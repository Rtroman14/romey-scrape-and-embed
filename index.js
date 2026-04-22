require("dotenv").config();

const { setGlobalDispatcher, Agent } = require("undici");

setGlobalDispatcher(
    new Agent({
        headersTimeout: 900000, // 15 minutes
        bodyTimeout: 900000, // 15 minutes
    })
);

const functions = require("@google-cloud/functions-framework");
const { createClient } = require("@supabase/supabase-js");
const { scrapePages } = require("./src/scrapePages");
const Sentry = require("@sentry/google-cloud-serverless");
const { validateToken } = require("./src/auth");
const { processDocuments } = require("./src/processDocument");
const _ = require("./src/Helpers");

Sentry.init({ dsn: process.env.SENTRY_DSN, sendDefaultPii: true });

// Helper function to update task status
const updateTaskStatus = async ({ supabase, taskId, status, message }) => {
    if (!taskId) return;

    try {
        const { error } = await supabase
            .from("tasks")
            .update({
                status,
                updated_at: new Date().toISOString(),
                message,
            })
            .eq("id", taskId);

        if (error) {
            console.error(`Failed to update task status to ${status}:`, error);
        }
    } catch (err) {
        console.error(`Error updating task status to ${status}:`, err);
    }
};

functions.http(
    "scrape-and-embed",
    Sentry.wrapHttpFunction(async (req, res) => {
        if (req.method !== "POST") return res.send("hello world");

        // Authenticate the request
        try {
            const user = await validateToken(req);
            // Attach user to request if needed later
            req.user = user;
        } catch (authError) {
            return res.status(authError.status || 401).send({
                success: false,
                message: authError.message,
                error: authError.error,
            });
        }

        const { team_id, knowledge_source_ids, task_id } = req.body;

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
            auth: { persistSession: false },
        });

        try {
            // Fetch rows from knowledge_source table where status === "staging" || "error" and id in knowledge_source_ids
            const { data: knowledgeSources, error: fetchError } = await supabase
                .from("knowledge_sources")
                .select("*")
                .in("id", knowledge_source_ids)
                .in("status", ["staging", "training", "error"]);

            if (fetchError) {
                throw new Error(`Failed to fetch knowledge sources: ${fetchError.message}`);
            }

            if (!knowledgeSources || knowledgeSources.length === 0) {
                throw new Error("No knowledge sources found with staging or error status");
            }

            const knowledgeSourceIds = knowledgeSources.map((source) => source.id);
            const knowledgeSourceUrls = knowledgeSources.map((source) => source.url);

            // Update all rows in supabase to status "training"
            const { error: updateError } = await supabase
                .from("knowledge_sources")
                .update({ status: "training", error_message: null })
                .in("id", knowledgeSourceIds);

            if (updateError) {
                throw new Error(`Failed to update knowledge source status: ${updateError.message}`);
            }

            // Update tasks table to mark task as running
            await updateTaskStatus({
                supabase,
                taskId: task_id,
                status: "running",
                message: `Training started on ${knowledge_source_ids.length} pages`,
            });

            const scrapedPages = await scrapePages({ urls: knowledgeSourceUrls });

            // Handle scrape-wide failure
            if (!scrapedPages?.success) {
                const errorMessage = scrapedPages?.error ?? "Scrape failed";
                await supabase
                    .from("knowledge_sources")
                    .update({ status: "error", error_message: errorMessage })
                    .in("id", knowledgeSourceIds);
                throw new Error(errorMessage);
            }

            // Create a map from normalized source URL to its record
            const normalizedUrlToSource = new Map(
                knowledgeSources.map((src) => [_.normalizeUrl(src.url), src])
            );

            const pages = Array.isArray(scrapedPages.data) ? scrapedPages.data : [];

            // Identify pages without content and mark them error
            const failedPages = pages.filter((page) => !page?.content);
            if (failedPages.length) {
                console.log(
                    "Failed pages:",
                    failedPages.map((p) => p.url)
                );
                console.log(
                    "Available URLs in urlToSource:",
                    Array.from(normalizedUrlToSource.keys())
                );

                const failedIds = [
                    ...new Set(
                        failedPages
                            .map((page) => {
                                const normalizedPageUrl = _.normalizeUrl(page.url);
                                const src = normalizedUrlToSource.get(normalizedPageUrl);
                                console.log(
                                    `Mapping ${page.url} -> source_id: ${src?.id || "NOT FOUND"}`
                                );
                                return src?.id;
                            })
                            .filter(Boolean)
                    ),
                ];

                console.log("Failed IDs to update:", failedIds);

                if (failedIds.length > 0) {
                    await supabase
                        .from("knowledge_sources")
                        .update({ status: "error", error_message: "No content scraped" })
                        .in("id", failedIds);
                }
            }

            // Filter and map valid pages for processing
            const validPages = pages.filter((page) => page?.content);
            const mappedPages = validPages.map((page) => {
                const normalizedPageUrl = _.normalizeUrl(page.url);
                const src = normalizedUrlToSource.get(normalizedPageUrl);
                if (!src) {
                    console.warn(`No matching knowledge source for URL: ${page.url}`);
                }
                return {
                    ...page,
                    source_id: src?.id,
                    team_id: src?.team_id,
                };
            });

            const result = await processDocuments({ supabase, pages: mappedPages });

            // Calculate success/failure counts for task update
            const totalSources = knowledgeSourceIds.length;
            const { data: finalSources } = await supabase
                .from("knowledge_sources")
                .select("status")
                .in("id", knowledgeSourceIds);

            const succeededCount = finalSources?.filter((s) => s.status === "trained").length || 0;
            const failedCount = finalSources?.filter((s) => s.status === "error").length || 0;

            // Update tasks table to mark task as succeeded
            const message = `Training complete (${succeededCount}/${totalSources} succeeded${
                failedCount ? `, ${failedCount} failed` : ""
            })`;
            await updateTaskStatus({
                supabase,
                taskId: task_id,
                status: "succeeded",
                message,
            });

            return res.send({ success: true, team_id, upserted: result.upserted });
        } catch (error) {
            // Update knowledge_source.status to error and error_message
            if (knowledge_source_ids && knowledge_source_ids.length > 0) {
                await supabase
                    .from("knowledge_sources")
                    .update({
                        status: "error",
                        error_message: error.message,
                    })
                    .in("id", knowledge_source_ids);
            }

            // Update tasks table to mark task as failed
            await updateTaskStatus({
                supabase,
                taskId: task_id,
                status: "failed",
                message: error.message,
            });

            console.error(error);
            return res.status(500).send({
                success: false,
                message: error.message,
            });
        }
    })
);
