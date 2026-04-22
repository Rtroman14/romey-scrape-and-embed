const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { Document } = require("langchain/document");
const { embedTextsWithGoogle } = require("./embeddings");
const { contextualizeChunks } = require("./contextualizeChunks");
const { summarizeWebPage } = require("./summarizeWebPage");
const {
    CHUNK_SIZE_TOKENS,
    SEPARATORS,
    CHARACTERS_PER_TOKEN,
    OVERLAP,
    PAGE_CONCURRENCY,
} = require("./variables");

const chunkSize = CHUNK_SIZE_TOKENS * CHARACTERS_PER_TOKEN;
const chunkOverlap = Math.round(chunkSize * OVERLAP);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetries = async (fn, { attempts = 3, delayMs = 500 } = {}) => {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === attempts) break;
            await delay(delayMs * Math.pow(2, attempt - 1));
        }
    }
    throw lastError;
};

const splitDocsIntoChunks = async ({ text, metadata = {} }) => {
    const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
        separators: SEPARATORS,
    });

    const docs = await textSplitter.splitDocuments([
        new Document({ pageContent: text || "", metadata }),
    ]);

    // Normalize to plain objects for downstream usage
    return docs.map((doc) => ({
        content: doc.pageContent,
        metadata: doc.metadata || {},
    }));
};

// Minimal, clear concurrency pool for processing pages in parallel
const mapWithConcurrency = async (items, limit, worker) => {
    const results = new Array(items.length);
    let index = 0;
    const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (true) {
            const current = index++;
            if (current >= items.length) break;
            try {
                results[current] = await worker(items[current], current);
            } catch (error) {
                console.error("Uncaught worker error:", error);
                results[current] = 0;
            }
        }
    });
    await Promise.all(runners);
    return results;
};

const processDocuments = async ({ supabase, pages }) => {
    if (!supabase) throw new Error("supabase client is required");
    const inputPages = Array.isArray(pages) ? pages : [];
    if (inputPages.length === 0) throw new Error("pages array is empty");

    const pagesWithSource = inputPages.filter((p) => p && p.source_id);
    if (pagesWithSource.length === 0)
        throw new Error("No pages matched to knowledge sources by URL");

    const pageData = await mapWithConcurrency(pagesWithSource, PAGE_CONCURRENCY, async (page) => {
        try {
            const docs = await splitDocsIntoChunks({
                text: page.content,
                metadata: {
                    url: page.url,
                    title: page.title,
                    description: page.description,
                    source_id: page.source_id,
                    team_id: page.team_id,
                },
            });

            const [contextualizedDocs, summaries] = await Promise.all([
                withRetries(() => contextualizeChunks({ docs, text: page.content }), {
                    attempts: 3,
                    delayMs: 750,
                }),
                withRetries(() => summarizeWebPage({ text: page.content }), {
                    attempts: 3,
                    delayMs: 750,
                }),
            ]);

            const contextualizedChunks = contextualizedDocs.map((d) => ({
                team_id: page.team_id,
                source_id: page.source_id,
                content: d.content,
            }));
            const summaryChunks = summaries.map((summary) => ({
                team_id: page.team_id,
                source_id: page.source_id,
                content: summary,
            }));
            const combinedChunks = [...contextualizedChunks, ...summaryChunks];

            if (combinedChunks.length === 0) {
                throw new Error("No chunks generated");
            }

            const embeddings = await withRetries(
                () =>
                    embedTextsWithGoogle({
                        texts: combinedChunks.map((c) => c.content),
                    }),
                { attempts: 3, delayMs: 1000 }
            );

            const records = combinedChunks.map((c, i) => ({
                team_id: c.team_id,
                source_id: c.source_id,
                content: c.content,
                embedding: embeddings[i],
            }));

            return { page, records };
        } catch (error) {
            return { page, error };
        }
    });

    // Stage 2: perform Supabase operations sequentially
    let totalUpserted = 0;
    for (const item of pageData) {
        const { page, records, error } = item;
        if (error) {
            await withRetries(
                () =>
                    supabase
                        .from("knowledge_sources")
                        .update({
                            status: "error",
                            error_message: error.message,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", page.source_id),
                { attempts: 3, delayMs: 750 }
            );
            continue;
        }

        try {
            const batchSize = 500;
            let upserted = 0;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                const { error: upsertError } = await withRetries(
                    () => supabase.from("knowledge_base").upsert(batch),
                    { attempts: 3, delayMs: 1000 }
                );
                if (upsertError) throw upsertError;
                upserted += batch.length;
            }

            await withRetries(
                () =>
                    supabase
                        .from("knowledge_sources")
                        .update({
                            status: "trained",
                            title: page.title,
                            description: page.description,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", page.source_id),
                { attempts: 3, delayMs: 750 }
            );
            totalUpserted += upserted;
        } catch (error) {
            console.error("Error upserting or updating source:", page.url, error);
            try {
                await withRetries(
                    () =>
                        supabase
                            .from("knowledge_sources")
                            .update({
                                status: "error",
                                error_message: error.message,
                                updated_at: new Date().toISOString(),
                            })
                            .eq("id", page.source_id),
                    { attempts: 3, delayMs: 750 }
                );
            } catch (_) {}
        }
    }

    return { success: true, upserted: totalUpserted };
};

module.exports = {
    splitDocsIntoChunks,
    embedTextsWithGoogle,
    processDocuments,
};
