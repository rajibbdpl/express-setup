/*
  Warnings:

  - Added the required column `userId` to the `instagram_accounts` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "instagram_accounts" DROP CONSTRAINT "instagram_accounts_metaPageId_fkey";

-- AlterTable
ALTER TABLE "instagram_accounts" ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "metaPageId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_metaPageId_fkey" FOREIGN KEY ("metaPageId") REFERENCES "meta_pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_accounts" ADD CONSTRAINT "instagram_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
