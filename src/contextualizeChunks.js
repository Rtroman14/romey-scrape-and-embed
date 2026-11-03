const { generateText } = require("ai");
const { CHUNK_SIZE_TOKENS, TEXT_MODEL } = require("./variables");
const logError = require("./observability");

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

const contextualizeChunk = async ({ text, chunk }) => {
    try {
        const result = await generateText({
            model: TEXT_MODEL,
            temperature: 0,
            reasoning: "none",
            maxOutputTokens: CHUNK_SIZE_TOKENS * 0.1 + CHUNK_SIZE_TOKENS,
            prompt: getContextPrompt({ text, chunk }),
        });
        return result.text;
    } catch (error) {
        logError({ error, message: "Error contextualizing chunk:" });
        return chunk;
    }
};

const contextualizeChunks = async ({ docs, text }) => {
    try {
        const batchSize = 10;
        const results = [];

        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = docs.slice(i, i + batchSize);
            const batchResults = await Promise.all(
                batch.map(async (doc) => {
                    const contextualizedContent = await contextualizeChunk({
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
        logError({ error, message: "Error in contextualizeChunks:" });
        return docs;
    }
};

module.exports = {
    contextualizeChunks,
};
