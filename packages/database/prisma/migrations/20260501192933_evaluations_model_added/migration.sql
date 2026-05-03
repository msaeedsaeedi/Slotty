-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "ta_id" UUID NOT NULL,
    "rubric_scores" JSONB NOT NULL DEFAULT '{}',
    "total_score" DECIMAL(5,2),
    "private_note" TEXT,
    "submitted_at" TIMESTAMPTZ,
    "visible_to_instructor" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_booking_id_key" ON "evaluations"("booking_id");

-- CreateIndex
CREATE INDEX "idx_evaluations_booking" ON "evaluations"("booking_id");

-- CreateIndex
CREATE INDEX "idx_evaluations_ta" ON "evaluations"("ta_id");

-- CreateIndex
CREATE INDEX "idx_evaluations_visible" ON "evaluations"("visible_to_instructor");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_ta_id_fkey" FOREIGN KEY ("ta_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
