const { createGoogleGenerativeAI } = require("@ai-sdk/google");
const { generateText } = require("ai");
const { CHUNK_SIZE_TOKENS } = require("./variables");

const getContextPrompt = ({ text, chunk }) => {
    const wordCount = chunk.split(/\s+/).filter(Boolean).length;
    const characterCount = chunk.length;

    return `
## Task:
Review the full document and the provided chunk. Your task is to rephrase the chunk to make it more standalone by subtly incorporating relevant contextual details from the full document (e.g., resolving pronouns or implicit references), while preserving all key information, facts, and details.

FULL DOCUMENT:
<document>
${text}
</document>

CHUNK TO REPHRASE:
<chunk>
${chunk}
</chunk>

## Guidelines:
- Retain all essential facts, details, and structure from the original chunk—do not add, remove, or invent content.
- Make the rephrased chunk more contextually self-contained where needed (e.g., clarify references using document-wide info).
- Keep the output length very close to the original: aim for ${wordCount} ± 5% words and ${characterCount} ± 5% characters.
- Do not include extraneous explanations or summaries beyond what's needed for clarity.

Return only the rephrased chunk.
`;
};

const contextualizeChunk = async ({ google, text, chunk }) => {
    try {
        const result = await generateText({
            model: google("gemini-3.5-flash-lite"),
            temperature: 0,
            maxTokens: CHUNK_SIZE_TOKENS * 0.1 + CHUNK_SIZE_TOKENS,
            prompt: getContextPrompt({ text, chunk }),
        });
        return result.text;
    } catch (error) {
        console.error("Error contextualizing chunk:", error);
        return chunk;
    }
};

const contextualizeChunks = async ({ docs, text }) => {
    try {
        const googleInstance1 = createGoogleGenerativeAI({
            apiKey: process.env.GOOGLE_AI_API_KEY_ROOFGPT,
        });
        const googleInstance2 = createGoogleGenerativeAI({
            apiKey: process.env.GOOGLE_AI_API_KEY_WEBAGENT,
        });

        const batchSize = 10;
        const results = [];

        for (let i = 0; i < docs.length; i += batchSize) {
            const batchNumber = i / batchSize;
            const currentGoogle = batchNumber % 2 === 0 ? googleInstance1 : googleInstance2;

            const batch = docs.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(async (doc) => {
                    const contextualizedContent = await contextualizeChunk({
                        google: currentGoogle,
                        text,
                        chunk: doc.content,
                    });

                    return {
                        ...doc,
                        content: contextualizedContent,
                    };
                }),
            );

            results.push(...batchResults);
        }

        return results;
    } catch (error) {
        console.error("Error in contextualizeChunks:", error);
        return docs;
    }
};

module.exports = {
    contextualizeChunks,
};
