-- AlterTable
ALTER TABLE "instagram_accounts" ADD COLUMN     "metaAccessToken" TEXT,
ADD COLUMN     "metaTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "metaUserId" TEXT;
