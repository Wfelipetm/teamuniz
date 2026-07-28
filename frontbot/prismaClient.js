const { PrismaClient } = require("@prisma/client");

// PostgreSQL – URL deve vir da variável de ambiente DATABASE_URL
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
        "postgresql://chatbox:chatbox_secret@localhost:5432/chatbox_db";
}

const prisma = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

module.exports = prisma;
