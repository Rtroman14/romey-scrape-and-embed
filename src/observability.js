const Sentry = require("@sentry/google-cloud-serverless");

const logError = ({ error, message = "", extra = {} }) => {
    // Structured logging to console
    console.error(message);

    // Capture exception in Sentry with extra context
    // Sentry.captureException(error);
    Sentry.captureException(error, {
        extra,
    });
};

module.exports = logError;
