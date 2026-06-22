CREATE TABLE "GeneratedImage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT,
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "revisedPrompt" TEXT,
  "brief" JSONB,
  "fileName" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'image/png',
  "byteSize" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GeneratedImage_userId_idx" ON "GeneratedImage"("userId");
CREATE INDEX "GeneratedImage_conversationId_idx" ON "GeneratedImage"("conversationId");

ALTER TABLE "GeneratedImage"
  ADD CONSTRAINT "GeneratedImage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GeneratedImage"
  ADD CONSTRAINT "GeneratedImage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
