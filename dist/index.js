// server.ts
import app from "./app";
import { config } from "./config";
import { prisma } from "./config/database";
const startServer = async () => {
    try {
        // Connect to the database once
        await prisma.$connect();
        console.log("Database connected successfully");
        // Start Express server
        const server = app.listen(config.PORT, () => {
            console.log(`Server running on http://localhost:${config.PORT}`);
        });
        // Graceful shutdown on SIGTERM (e.g., container stop)
        process.on("SIGTERM", async () => {
            console.log("⚡ SIGTERM received. Closing server...");
            server.close(async () => {
                await prisma.$disconnect();
                console.log("Server and DB connection closed");
                process.exit(0);
            });
        });
        // Graceful shutdown on SIGINT (e.g., Ctrl+C)
        process.on("SIGINT", async () => {
            console.log("SIGINT received. Closing server...");
            server.close(async () => {
                await prisma.$disconnect();
                console.log("Server and DB connection closed");
                process.exit(0);
            });
        });
        // Handle unhandled promise rejections
        process.on("unhandledRejection", async (reason) => {
            console.error("Unhandled Rejection:", reason);
            server.close(async () => {
                await prisma.$disconnect();
                process.exit(1);
            });
        });
        // Handle uncaught exceptions
        process.on("uncaughtException", async (error) => {
            console.error("Uncaught Exception:", error);
            server.close(async () => {
                await prisma.$disconnect();
                process.exit(1);
            });
        });
    }
    catch (error) {
        console.error("Failed to start server or connect DB:", error);
        process.exit(1);
    }
};
startServer();
//# sourceMappingURL=index.js.map