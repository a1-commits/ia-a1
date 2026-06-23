-- CreateEnum
CREATE TYPE "ToolType" AS ENUM ('BLING', 'GMAIL', 'GOOGLE_CALENDAR', 'WEBHOOK', 'CUSTOM_API');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "objective" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "rules" TEXT NOT NULL DEFAULT '',
    "forbiddenRules" TEXT NOT NULL DEFAULT '',
    "examples" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT 'auto',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsappId" TEXT,
    "lastMessage" TEXT NOT NULL DEFAULT '—',
    "lastInteractionAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAgent" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ToolType" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTool" (
    "agentId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTool_pkey" PRIMARY KEY ("agentId","toolId")
);

-- CreateIndex
CREATE INDEX "Agent_userId_idx" ON "Agent"("userId");

-- CreateIndex
CREATE INDEX "Agent_userId_isDefault_idx" ON "Agent"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_userId_phone_key" ON "Contact"("userId", "phone");

-- CreateIndex
CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactAgent_contactId_key" ON "ContactAgent"("contactId");

-- CreateIndex
CREATE INDEX "ContactAgent_agentId_idx" ON "ContactAgent"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "ToolConnection_userId_type_key" ON "ToolConnection"("userId", "type");

-- CreateIndex
CREATE INDEX "ToolConnection_userId_idx" ON "ToolConnection"("userId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAgent" ADD CONSTRAINT "ContactAgent_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAgent" ADD CONSTRAINT "ContactAgent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolConnection" ADD CONSTRAINT "ToolConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTool" ADD CONSTRAINT "AgentTool_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTool" ADD CONSTRAINT "AgentTool_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "ToolConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
