const { createGoogleGenerativeAI } = require("@ai-sdk/google");
const { generateObject } = require("ai");
const { z } = require("zod");

const getSummaryPrompt = (text) => `
## Task:
Summarize the document into concise chunks, each 1400-1600 characters (~1500 characters). Adjust the number of chunks dynamically: 1 chunk for documents <5000 characters, 2-10 chunks for longer documents, using natural sections (e.g., headers, topics) as boundaries. Each chunk should capture the core themes, key facts, and essential details of its section, preserving the document's meaning and structure. Ensure summaries are abstractive but strictly faithful—do not add, omit, or invent information.

DOCUMENT:
<document>
${text}
</document>

## Guidelines:
- Use document headers or sections to guide chunk boundaries, but do not include "Section" or "Summary" labels in the output.
- Retain all critical facts, terminology, and details.
- Ensure each chunk is self-contained but references the broader document context where needed.
- Output only the chunks.
- Do not include extra explanations, prefixes, or text beyond the summary content.
`;

const summarizeWebPage = async ({ text }) => {
    try {
        const google = createGoogleGenerativeAI({
            apiKey: process.env.GOOGLE_AI_API_KEY_ROOFGPT,
        });

        const { object } = await generateObject({
            model: google("gemini-3.5-flash-lite"),
            temperature: 0,
            schema: z.object({
                summaries: z.array(z.string()),
            }),
            prompt: getSummaryPrompt(text),
        });

        const summaries = Array.isArray(object.summaries) ? object.summaries : [];
        return summaries;
    } catch (error) {
        console.error("Error in summarizeWebPage:", error);
        return []; // Return empty array if process fails
    }
};

module.exports = {
    summarizeWebPage,
};
