class Helpers {
    getOrigin = (url) => {
        try {
            return new URL(url).origin;
        } catch {
            return url;
        }
    };

    normalizeUrl = (url) => {
        try {
            const urlObj = new URL(url);
            // Remove trailing slash and normalize
            return urlObj.origin + urlObj.pathname.replace(/\/$/, "");
        } catch {
            return url?.replace(/\/$/, "") || url;
        }
    };

    findSourceByUrl = (url, urlToSource) => {
        const normalizedUrl = this.normalizeUrl(url);
        const origin = this.getOrigin(normalizedUrl);

        return (
            urlToSource.get(normalizedUrl) ||
            urlToSource.get(origin) ||
            urlToSource.get(url) ||
            urlToSource.get(this.getOrigin(url))
        );
    };
}

module.exports = new Helpers();
