-- AlterTable
ALTER TABLE "facebook_messages" ADD COLUMN     "attachmentId" TEXT,
ADD COLUMN     "attachmentType" TEXT,
ADD COLUMN     "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "ig_messages" ADD COLUMN     "attachmentId" TEXT,
ADD COLUMN     "attachmentType" TEXT;
