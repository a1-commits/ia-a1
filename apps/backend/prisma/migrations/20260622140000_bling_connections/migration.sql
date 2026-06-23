-- CreateEnum
CREATE TYPE "BlingConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'TOKEN_EXPIRED', 'ERROR');

-- CreateTable
CREATE TABLE "BlingConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storeLabel" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEncrypted" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "status" "BlingConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "oauthState" TEXT,
    "oauthStateExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlingConnection_userId_idx" ON "BlingConnection"("userId");

-- CreateIndex
CREATE INDEX "BlingConnection_agentId_idx" ON "BlingConnection"("agentId");

-- CreateIndex
CREATE INDEX "BlingConnection_userId_agentId_idx" ON "BlingConnection"("userId", "agentId");

-- AddForeignKey
ALTER TABLE "BlingConnection" ADD CONSTRAINT "BlingConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlingConnection" ADD CONSTRAINT "BlingConnection_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
