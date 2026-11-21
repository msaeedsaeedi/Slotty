-- CreateEnum
CREATE TYPE "AuthAttemptKind" AS ENUM ('SIGN_IN_FAILURE', 'RESET_REQUEST', 'RESET_EMAIL');

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "kind" "AuthAttemptKind" NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthAttempt_kind_keyHash_createdAt_idx" ON "AuthAttempt"("kind", "keyHash", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_createdAt_idx" ON "AuthAttempt"("createdAt");

