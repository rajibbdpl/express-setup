-- AlterEnum
ALTER TYPE "Platform" ADD VALUE 'TIKTOK';

-- CreateTable
CREATE TABLE "tiktok_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "profileImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiktok_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_conversations" (
    "id" TEXT NOT NULL,
    "tiktokAccountId" TEXT NOT NULL,
    "tiktokConversationId" TEXT NOT NULL,
    "participantOpenId" TEXT,
    "participantUsername" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiktok_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "tiktokMessageId" TEXT NOT NULL,
    "fromOpenId" TEXT,
    "fromUsername" TEXT,
    "text" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "timestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiktok_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_accounts_openId_key" ON "tiktok_accounts"("openId");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_conversations_tiktokConversationId_key" ON "tiktok_conversations"("tiktokConversationId");

-- CreateIndex
CREATE INDEX "tiktok_conversations_tiktokAccountId_updatedAt_idx" ON "tiktok_conversations"("tiktokAccountId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "tiktok_conversations_participantOpenId_idx" ON "tiktok_conversations"("participantOpenId");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_messages_tiktokMessageId_key" ON "tiktok_messages"("tiktokMessageId");

-- CreateIndex
CREATE INDEX "tiktok_messages_conversationId_timestamp_idx" ON "tiktok_messages"("conversationId", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "tiktok_accounts" ADD CONSTRAINT "tiktok_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_conversations" ADD CONSTRAINT "tiktok_conversations_tiktokAccountId_fkey" FOREIGN KEY ("tiktokAccountId") REFERENCES "tiktok_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_messages" ADD CONSTRAINT "tiktok_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "tiktok_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
