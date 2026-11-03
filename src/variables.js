const CHUNK_SIZE_TOKENS = 400;
const SEPARATORS = ["#", "##", "###", "####", ".", "?", "!", "\n\n", "\n", ""];
const CHARACTERS_PER_TOKEN = 4;
const OVERLAP = 0.15;
const PAGE_CONCURRENCY = 10;
const TEXT_MODEL = "openai/gpt-6-luna";
// Must stay in sync with the model/dimensions used to query knowledge_base embeddings
const EMBEDDING_MODEL = "google/gemini-embedding-001";

module.exports = {
    TEXT_MODEL,
    EMBEDDING_MODEL,
    CHUNK_SIZE_TOKENS,
    SEPARATORS,
    CHARACTERS_PER_TOKEN,
    OVERLAP,
    PAGE_CONCURRENCY,
};
