-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "accessTokenEnc" TEXT,
    "verifyToken" TEXT,
    "type" TEXT NOT NULL DEFAULT 'cloud_api',
    "sessionStatus" TEXT NOT NULL DEFAULT 'disconnected',
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "whatsapp_auth_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "keyType" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "keyData" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "whatsapp_auth_keys_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "whatsapp_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "nps_ratings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "agentId" TEXT,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shortcut" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ticket_tags" (
    "ticketId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("ticketId", "tagId"),
    CONSTRAINT "ticket_tags_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ticket_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "businessNiche" TEXT NOT NULL DEFAULT 'generic',
    "activeModules" TEXT NOT NULL DEFAULT '["ticketing","bot_flow","analytics","internal_chat","nps","automations","hsm_templates","bulk_import"]',
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "kanban_boards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "kanban_columns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "position" INTEGER NOT NULL DEFAULT 0,
    "columnType" TEXT NOT NULL DEFAULT 'default',
    "autoStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "kanban_columns_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "kanban_boards" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "web_widgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Widget do Site',
    "widgetToken" TEXT NOT NULL,
    "config" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "botFlowId" TEXT,
    "departmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "web_widget_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "widgetId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "contactId" TEXT,
    "socketRoom" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "web_widget_sessions_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "web_widgets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "web_widget_sessions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contact_merge_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceContactId" TEXT NOT NULL,
    "targetContactId" TEXT NOT NULL,
    "triggeredByUserId" TEXT,
    "mergeReason" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_account_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "allowPaidTemplates" BOOLEAN NOT NULL DEFAULT false,
    "autoRenewWindowPrompt" BOOLEAN NOT NULL DEFAULT true,
    "autoDistribute" TEXT NOT NULL DEFAULT 'ROUND_ROBIN',
    "logoUrl" TEXT,
    "businessHoursMode" TEXT NOT NULL DEFAULT 'always',
    "businessHoursJson" TEXT NOT NULL DEFAULT '{}',
    "awayMessage" TEXT NOT NULL DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "npsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "npsMessage" TEXT NOT NULL DEFAULT 'Por favor, avalie nosso atendimento de 1 a 10:',
    "npsExpirationHours" INTEGER NOT NULL DEFAULT 24,
    "autoCloseMinutes" INTEGER NOT NULL DEFAULT 0,
    "slaAlertMinutes" INTEGER NOT NULL DEFAULT 0,
    "rejectCalls" BOOLEAN NOT NULL DEFAULT true,
    "rejectCallMessage" TEXT NOT NULL DEFAULT 'No momento não aceitamos ligações por WhatsApp. Por favor, digite sua mensagem.',
    "activeBotFlowId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_account_settings" ("allowPaidTemplates", "autoRenewWindowPrompt", "createdAt", "id", "logoUrl", "updatedAt") SELECT "allowPaidTemplates", "autoRenewWindowPrompt", "createdAt", "id", "logoUrl", "updatedAt" FROM "account_settings";
DROP TABLE "account_settings";
ALTER TABLE "new_account_settings" RENAME TO "account_settings";
CREATE TABLE "new_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "fullName" TEXT,
    "cpf" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "phone" TEXT NOT NULL,
    "profilePicUrl" TEXT,
    "variables" TEXT NOT NULL DEFAULT '{}',
    "mergedIntoId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contacts_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_contacts" ("createdAt", "id", "name", "phone", "profilePicUrl", "updatedAt") SELECT "createdAt", "id", "name", "phone", "profilePicUrl", "updatedAt" FROM "contacts";
DROP TABLE "contacts";
ALTER TABLE "new_contacts" RENAME TO "contacts";
CREATE UNIQUE INDEX "contacts_phone_key" ON "contacts"("phone");
CREATE TABLE "new_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "origin" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "senderName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" TEXT NOT NULL,
    "whatsappMessageId" TEXT,
    CONSTRAINT "messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_messages" ("body", "createdAt", "id", "mediaType", "mediaUrl", "origin", "ticketId", "whatsappMessageId") SELECT "body", "createdAt", "id", "mediaType", "mediaUrl", "origin", "ticketId", "whatsappMessageId" FROM "messages";
DROP TABLE "messages";
ALTER TABLE "new_messages" RENAME TO "messages";
CREATE TABLE "new_tickets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "protocol" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    "contactId" TEXT NOT NULL,
    "departmentId" TEXT,
    "userId" TEXT,
    "botFlowId" TEXT,
    "currentNodeId" TEXT,
    "lastContactMessageAt" DATETIME,
    "kanbanColumnId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    CONSTRAINT "tickets_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tickets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tickets_kanbanColumnId_fkey" FOREIGN KEY ("kanbanColumnId") REFERENCES "kanban_columns" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tickets" ("botFlowId", "closedAt", "contactId", "createdAt", "currentNodeId", "departmentId", "id", "lastContactMessageAt", "protocol", "status", "updatedAt", "userId") SELECT "botFlowId", "closedAt", "contactId", "createdAt", "currentNodeId", "departmentId", "id", "lastContactMessageAt", "protocol", "status", "updatedAt", "userId" FROM "tickets";
DROP TABLE "tickets";
ALTER TABLE "new_tickets" RENAME TO "tickets";
CREATE UNIQUE INDEX "tickets_protocol_key" ON "tickets"("protocol");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "maxConcurrentChats" INTEGER NOT NULL DEFAULT 5,
    "lastAssignedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "email", "id", "name", "online", "password", "role", "updatedAt") SELECT "createdAt", "email", "id", "name", "online", "password", "role", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_phoneNumberId_key" ON "whatsapp_connections"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_auth_keys_connectionId_keyType_keyId_key" ON "whatsapp_auth_keys"("connectionId", "keyType", "keyId");

-- CreateIndex
CREATE UNIQUE INDEX "quick_replies_shortcut_key" ON "quick_replies"("shortcut");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "web_widgets_widgetToken_key" ON "web_widgets"("widgetToken");

-- CreateIndex
CREATE UNIQUE INDEX "web_widget_sessions_socketRoom_key" ON "web_widget_sessions"("socketRoom");

-- CreateIndex
CREATE UNIQUE INDEX "web_widget_sessions_widgetId_visitorId_key" ON "web_widget_sessions"("widgetId", "visitorId");
