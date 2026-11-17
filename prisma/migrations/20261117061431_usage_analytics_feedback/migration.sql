-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'TRIAGED', 'DONE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shareUsageData" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "visitor" TEXT,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "props" JSONB,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "day" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "events" INTEGER NOT NULL,
    "visitors" INTEGER NOT NULL,
    "p75" DOUBLE PRECISION,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("day","name","path","role","device")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "rating" INTEGER,
    "path" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "score" INTEGER,
    "role" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyPrompt" (
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL,
    "answered" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SurveyPrompt_pkey" PRIMARY KEY ("userId","prompt")
);

-- CreateIndex
CREATE INDEX "AnalyticsEvent_occurredAt_idx" ON "AnalyticsEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_occurredAt_idx" ON "AnalyticsEvent"("name", "occurredAt");

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SurveyResponse_prompt_createdAt_idx" ON "SurveyResponse"("prompt", "createdAt");

-- AddForeignKey
ALTER TABLE "SurveyPrompt" ADD CONSTRAINT "SurveyPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
