require("dotenv").config();

const scrapePages = async ({ urls }) => {
    const headers = {
        "Content-Type": "application/json",
    };

    try {
        const response = await fetch(`${process.env.CRAWL_AI_URL}/crawl-links`, {
            method: "POST",
            headers,
            body: JSON.stringify({ urls }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        return data;
    } catch (error) {
        console.error("Scraping error:", error);
        return {
            success: false,
            message: error.message,
        };
    }
};

module.exports = { scrapePages };
