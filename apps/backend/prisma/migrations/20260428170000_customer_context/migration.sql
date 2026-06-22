-- CreateTable
CREATE TABLE "CustomerContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "whatsappId" TEXT,
    "name" TEXT,
    "lastConversationId" TEXT,
    "lastInteractionAt" TIMESTAMP(3),
    "currentProject" JSONB,
    "conversationSummary" TEXT,
    "pendingQuestions" JSONB,
    "nextSuggestedAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'novo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerContext_userId_idx" ON "CustomerContext"("userId");

-- CreateIndex
CREATE INDEX "CustomerContext_lastConversationId_idx" ON "CustomerContext"("lastConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerContext_userId_phone_key" ON "CustomerContext"("userId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerContext_userId_whatsappId_key" ON "CustomerContext"("userId", "whatsappId");

-- AddForeignKey
ALTER TABLE "CustomerContext" ADD CONSTRAINT "CustomerContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
