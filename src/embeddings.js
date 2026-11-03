const { embedMany } = require("ai");
const { EMBEDDING_MODEL } = require("./variables");

const embedTextsWithGoogle = async ({ texts }) => {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const { embeddings } = await embedMany({
        model: EMBEDDING_MODEL,
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
