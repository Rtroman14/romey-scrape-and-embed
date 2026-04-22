const { embedMany } = require("ai");
const { createGoogleGenerativeAI } = require("@ai-sdk/google");

const google = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_AI_API_KEY_ROOFGPT,
});

const embedTextsWithGoogle = async ({ texts }) => {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const { embeddings } = await embedMany({
        model: google.textEmbedding("gemini-embedding-001"),
        values: texts,
        providerOptions: {
            google: {
                outputDimensionality: 768,
                taskType: "RETRIEVAL_DOCUMENT",
            },
        },
    });

    return embeddings;
};

module.exports = {
    embedTextsWithGoogle,
};
