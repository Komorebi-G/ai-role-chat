-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create default conversations for existing messages (one per user+character pair)
INSERT INTO "Conversation" ("id", "userId", "characterId", "title", "createdAt")
SELECT DISTINCT
    lower(hex(randomblob(16))) AS "id",
    "userId",
    "characterId",
    'New Chat' AS "title",
    datetime('now') AS "createdAt"
FROM "Message";

-- Redefine Message table with conversationId
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("characterId", "content", "createdAt", "id", "role", "userId", "conversationId")
SELECT
    m."characterId", m."content", m."createdAt", m."id", m."role", m."userId",
    COALESCE(
        (SELECT c."id" FROM "Conversation" c WHERE c."userId" = m."userId" AND c."characterId" = m."characterId" LIMIT 1),
        lower(hex(randomblob(16)))
    ) AS "conversationId"
FROM "Message" m;
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
