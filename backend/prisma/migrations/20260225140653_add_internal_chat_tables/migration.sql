-- AlterTable
ALTER TABLE "account_settings" ADD COLUMN "logoUrl" TEXT;

-- CreateTable
CREATE TABLE "internal_rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "type" TEXT NOT NULL DEFAULT 'direct',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "internal_participants" (
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("roomId", "userId"),
    CONSTRAINT "internal_participants_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "internal_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "internal_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT,
    "attachmentUrl" TEXT,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "internal_messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "internal_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "internal_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "internal_read_receipts" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("messageId", "userId"),
    CONSTRAINT "internal_read_receipts_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "internal_messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
