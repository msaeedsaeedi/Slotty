-- CreateEnum
CREATE TYPE "TimeFormat" AS ENUM ('H12', 'H24');

-- AlterTable
ALTER TABLE "Course" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Karachi';

-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "noBookingReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "timeFormat" "TimeFormat" NOT NULL DEFAULT 'H12';
