const CHUNK_SIZE_TOKENS = 400;
const SEPARATORS = ["#", "##", "###", "####", ".", "?", "!", "\n\n", "\n", ""];
const CHARACTERS_PER_TOKEN = 4;
const OVERLAP = 0.15;
const PAGE_CONCURRENCY = 10;

module.exports = {
    CHUNK_SIZE_TOKENS,
    SEPARATORS,
    CHARACTERS_PER_TOKEN,
    OVERLAP,
    PAGE_CONCURRENCY,
};
