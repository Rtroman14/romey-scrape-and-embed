require("dotenv").config();

const jwt = require("jsonwebtoken");

const validateToken = (req) => {
    return new Promise((resolve, reject) => {
        try {
            // Get authorization header
            const authHeader = req.headers.authorization;

            // Check if auth header exists and starts with 'Bearer '
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return reject({
                    status: 401,
                    message: "Authentication failed. No bearer token provided.",
                });
            }

            // Extract the token
            const token = authHeader.split(" ")[1];

            try {
                // Verify token
                const decoded = jwt.verify(token, process.env.JWT_SECRET);

                // Return decoded payload
                resolve(decoded);
            } catch (jwtError) {
                console.error(
                    "DEBUG: JWT verification error:",
                    jwtError.name,
                    "-",
                    jwtError.message
                );
                reject({
                    status: 401,
                    message: "Authentication failed. Invalid token.",
                    error: process.env.NODE_ENV === "development" ? jwtError.message : undefined,
                });
            }
        } catch (error) {
            console.error("DEBUG: Authentication error details:", error);
            reject({
                status: 401,
                message: "Authentication failed. Invalid token.",
                error: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    });
};

module.exports = { validateToken };
