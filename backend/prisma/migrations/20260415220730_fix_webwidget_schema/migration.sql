/*
  Warnings:

  - You are about to drop the `whatsapp_auth_keys` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "whatsapp_auth_keys_connectionId_keyType_keyId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "whatsapp_auth_keys";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_web_widget_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "widgetId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "visitorName" TEXT NOT NULL DEFAULT 'Visitante',
    "contactId" TEXT,
    "socketRoom" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "web_widget_sessions_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "web_widgets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "web_widget_sessions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_web_widget_sessions" ("contactId", "createdAt", "endedAt", "id", "metadata", "socketRoom", "updatedAt", "visitorId", "widgetId") SELECT "contactId", "createdAt", "endedAt", "id", "metadata", "socketRoom", "updatedAt", "visitorId", "widgetId" FROM "web_widget_sessions";
DROP TABLE "web_widget_sessions";
ALTER TABLE "new_web_widget_sessions" RENAME TO "web_widget_sessions";
CREATE UNIQUE INDEX "web_widget_sessions_socketRoom_key" ON "web_widget_sessions"("socketRoom");
CREATE UNIQUE INDEX "web_widget_sessions_widgetId_visitorId_key" ON "web_widget_sessions"("widgetId", "visitorId");
CREATE TABLE "new_web_widgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Widget do Site',
    "widgetToken" TEXT NOT NULL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "primaryColor" TEXT NOT NULL DEFAULT '#6366f1',
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Olá! 👋 Como podemos ajudar?',
    "agentName" TEXT NOT NULL DEFAULT 'Atendimento',
    "allowedOrigin" TEXT NOT NULL DEFAULT '*',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "botFlowId" TEXT,
    "departmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_web_widgets" ("botFlowId", "config", "createdAt", "departmentId", "id", "isActive", "name", "updatedAt", "widgetToken") SELECT "botFlowId", "config", "createdAt", "departmentId", "id", "isActive", "name", "updatedAt", "widgetToken" FROM "web_widgets";
DROP TABLE "web_widgets";
ALTER TABLE "new_web_widgets" RENAME TO "web_widgets";
CREATE UNIQUE INDEX "web_widgets_widgetToken_key" ON "web_widgets"("widgetToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
