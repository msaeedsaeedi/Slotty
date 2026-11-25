-- Push reminders expire when they stop being useful, and are sent with high urgency (#142).
-- Expand only: both columns are optional for the previous release, which ignores them.
ALTER TABLE "PushMessage" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "PushMessage" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;
