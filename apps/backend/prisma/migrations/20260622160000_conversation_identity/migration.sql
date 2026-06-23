-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "agentId" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'internal';
ALTER TABLE "Conversation" ADD COLUMN "lastMessagePreview" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "contactIdentifier" TEXT;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Conversation_userId_contactId_channel_idx" ON "Conversation"("userId", "contactId", "channel");
CREATE INDEX "Conversation_userId_agentId_channel_idx" ON "Conversation"("userId", "agentId", "channel");
