require("dotenv").config();

const data = require("../scrapedPages");
const { createClient } = require("@supabase/supabase-js");
const { processDocuments } = require("../src/processDocument");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
});

const knowledge_source_ids = [
    "87d860b8-f163-4909-8230-729de0a620a0",
    "2ab17620-52d7-46f9-934c-0a2e4456f56a",
    "8cfa5a64-4db2-440e-a47d-e170ca812720",
    "38145e86-638f-4019-b949-25786cd32007",
    "065b82cf-5639-4ce7-9f0a-2bf2f05330c3",
    "5a208310-c5ae-46d1-be5f-bd5487ca0387",
];

(async () => {
    try {
        const { data: knowledgeSources, error: fetchError } = await supabase
            .from("knowledge_sources")
            .select("id, url, status, team_id")
            .in("id", knowledge_source_ids)
            .in("status", ["staging", "error"]);

        if (fetchError) throw fetchError;

        if (!knowledgeSources || knowledgeSources.length === 0) {
            throw new Error("No knowledge sources found");
        }

        const getOrigin = (url) => {
            try {
                return new URL(url).origin;
            } catch (e) {
                return url;
            }
        };

        const urlToSource = new Map();
        for (const knowledgeSource of knowledgeSources) {
            urlToSource.set(knowledgeSource.url, knowledgeSource);
            urlToSource.set(getOrigin(knowledgeSource.url), knowledgeSource);
        }

        const pages = data && Array.isArray(data.data) ? data.data : [];
        const mappedPages = pages.map((page) => {
            const origin = getOrigin(page.url);
            const match = urlToSource.get(page.url) || urlToSource.get(origin) || null;
            return {
                ...page,
                source_id: match ? match.id : null,
                team_id: match ? match.team_id : null,
            };
        });

        const result = await processDocuments({ supabase, pages: mappedPages });
        console.log(`Inserted/updated ${result.upserted} chunks into knowledge_base.`);
    } catch (error) {
        console.error(error);
    }
})();
