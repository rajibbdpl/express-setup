/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "WaMessageType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACTS', 'TEMPLATE', 'INTERACTIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WaMessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'WHATSAPP');

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metaUserId" TEXT,
    "metaAccessToken" TEXT,
    "metaTokenExpiry" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_pages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "pageCategory" TEXT,
    "pageAccessToken" TEXT NOT NULL,
    "pictureUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_accounts" (
    "id" TEXT NOT NULL,
    "metaPageId" TEXT NOT NULL,
    "igAccountId" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "profilePicUrl" TEXT,
    "followersCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_posts" (
    "id" TEXT NOT NULL,
    "igAccountId" TEXT NOT NULL,
    "igMediaId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "permalink" TEXT,
    "likeCount" INTEGER,
    "commentsCount" INTEGER,
    "timestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instagram_comments" (
    "id" TEXT NOT NULL,
    "igPostId" TEXT NOT NULL,
    "igCommentId" TEXT NOT NULL,
    "parentId" TEXT,
    "username" TEXT,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instagram_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ig_conversations" (
    "id" TEXT NOT NULL,
    "igAccountId" TEXT NOT NULL,
    "igConversationId" TEXT NOT NULL,
    "participantIgId" TEXT,
    "participantUsername" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ig_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ig_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "igMessageId" TEXT NOT NULL,
    "fromId" TEXT,
    "fromUsername" TEXT,
    "text" TEXT,
    "attachmentUrl" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "timestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ig_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_posts" (
    "id" TEXT NOT NULL,
    "metaPageId" TEXT NOT NULL,
    "fbPostId" TEXT NOT NULL,
    "message" TEXT,
    "story" TEXT,
    "fullPicture" TEXT,
    "permalink" TEXT,
    "createdTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_comments" (
    "id" TEXT NOT NULL,
    "fbPostId" TEXT NOT NULL,
    "fbCommentId" TEXT NOT NULL,
    "parentId" TEXT,
    "fromId" TEXT,
    "fromName" TEXT,
    "message" TEXT NOT NULL,
    "createdTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_conversations" (
    "id" TEXT NOT NULL,
    "metaPageId" TEXT NOT NULL,
    "fbConversationId" TEXT NOT NULL,
    "participantId" TEXT,
    "participantName" TEXT,
    "snippet" TEXT,
    "updatedTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fbMessageId" TEXT NOT NULL,
    "fromId" TEXT,
    "fromName" TEXT,
    "text" TEXT,
    "attachmentUrl" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "createdTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessAccountId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "displayName" TEXT,
    "systemUserToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_conversations" (
    "id" TEXT NOT NULL,
    "waAccountId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "WaMessageType" NOT NULL,
    "text" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "caption" TEXT,
    "status" "WaMessageStatus" NOT NULL,
    "timestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_metaUserId_key" ON "users"("metaUserId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "meta_pages_pageId_key" ON "meta_pages"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_metaPageId_key" ON "instagram_accounts"("metaPageId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_accounts_igAccountId_key" ON "instagram_accounts"("igAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_posts_igMediaId_key" ON "instagram_posts"("igMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_comments_igCommentId_key" ON "instagram_comments"("igCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "ig_conversations_igConversationId_key" ON "ig_conversations"("igConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "ig_messages_igMessageId_key" ON "ig_messages"("igMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_posts_fbPostId_key" ON "facebook_posts"("fbPostId");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_comments_fbCommentId_key" ON "facebook_comments"("fbCommentId");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_conversations_fbConversationId_key" ON "facebook_conversations"("fbConversationId");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_messages_fbMessageId_key" ON "facebook_messages"("fbMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_phoneNumberId_key" ON "whatsapp_accounts"("phoneNumberId");

-- CreateIndex
CREATE INDEX "wa_conversations_waAccountId_contactPhone_idx" ON "wa_conversations"("waAccountId", "contactPhone");

-- CreateIndex
CREATE UNIQUE INDEX "wa_messages_waMessageId_key" ON "wa_messages"("waMessageId");

-- CreateIndex
CREATE INDEX "webhook_events_platform_processed_idx" ON "webhook_events"("platform", "processed");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_pages" ADD CONSTRAINT "meta_pages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_metaPageId_fkey" FOREIGN KEY ("metaPageId") REFERENCES "meta_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_posts" ADD CONSTRAINT "instagram_posts_igAccountId_fkey" FOREIGN KEY ("igAccountId") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_comments" ADD CONSTRAINT "instagram_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "instagram_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_comments" ADD CONSTRAINT "instagram_comments_igPostId_fkey" FOREIGN KEY ("igPostId") REFERENCES "instagram_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ig_conversations" ADD CONSTRAINT "ig_conversations_igAccountId_fkey" FOREIGN KEY ("igAccountId") REFERENCES "instagram_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ig_messages" ADD CONSTRAINT "ig_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ig_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_posts" ADD CONSTRAINT "facebook_posts_metaPageId_fkey" FOREIGN KEY ("metaPageId") REFERENCES "meta_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_comments" ADD CONSTRAINT "facebook_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "facebook_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_comments" ADD CONSTRAINT "facebook_comments_fbPostId_fkey" FOREIGN KEY ("fbPostId") REFERENCES "facebook_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_conversations" ADD CONSTRAINT "facebook_conversations_metaPageId_fkey" FOREIGN KEY ("metaPageId") REFERENCES "meta_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_messages" ADD CONSTRAINT "facebook_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "facebook_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_conversations" ADD CONSTRAINT "wa_conversations_waAccountId_fkey" FOREIGN KEY ("waAccountId") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_messages" ADD CONSTRAINT "wa_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "wa_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
