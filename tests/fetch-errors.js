require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");
const _ = require("../src/Helpers");
const { scrapePages } = require("../src/scrapePages");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false },
});

const TEAM_ID = "52eaff5a-0bd0-4d7f-815d-1852698e5ca0";

(async () => {
    try {
        const { data: knowledgeSources, error: fetchError } = await supabase
            .from("knowledge_sources")
            .select("id, url, status")
            .eq("status", "error")
            .eq("team_id", TEAM_ID);

        if (fetchError) throw fetchError;

        if (!knowledgeSources || knowledgeSources.length === 0) {
            throw new Error("No knowledge sources found");
        }

        const knowledgeSourceIds = knowledgeSources.map((source) => source.id);
        const knowledgeSourceUrls = knowledgeSources.map((source) => source.url);

        console.time("scrapePages");
        const scrapedPages = await scrapePages({ urls: knowledgeSourceUrls });
        console.timeEnd("scrapePages");

        console.log(scrapedPages);
    } catch (error) {
        console.error(error);
    }
})();
