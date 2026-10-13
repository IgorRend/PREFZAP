-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "lastContactMessageAt" DATETIME;

-- CreateTable
CREATE TABLE "account_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "allowPaidTemplates" BOOLEAN NOT NULL DEFAULT false,
    "autoRenewWindowPrompt" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "hsm_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "namespace" TEXT,
    "language" TEXT NOT NULL DEFAULT 'pt_BR',
    "category" TEXT,
    "components" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "hsm_templates_name_key" ON "hsm_templates"("name");
