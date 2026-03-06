-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "ig_messages" ADD COLUMN     "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "facebook_conversations_metaPageId_updatedTime_idx" ON "facebook_conversations"("metaPageId", "updatedTime" DESC);

-- CreateIndex
CREATE INDEX "facebook_conversations_participantId_idx" ON "facebook_conversations"("participantId");

-- CreateIndex
CREATE INDEX "facebook_messages_conversationId_createdTime_idx" ON "facebook_messages"("conversationId", "createdTime" DESC);

-- CreateIndex
CREATE INDEX "ig_conversations_igAccountId_updatedAt_idx" ON "ig_conversations"("igAccountId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "ig_conversations_participantIgId_idx" ON "ig_conversations"("participantIgId");

-- CreateIndex
CREATE INDEX "ig_messages_conversationId_timestamp_idx" ON "ig_messages"("conversationId", "timestamp" DESC);
