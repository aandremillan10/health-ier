BEGIN;

ALTER TABLE "Appointment" ADD COLUMN "queueDay" TEXT, ADD COLUMN "queueNumber" INTEGER;

WITH numbered AS (
  SELECT "id",
    to_char("scheduledAt" + INTERVAL '8 hours', 'YYYY-MM-DD') AS day,
    row_number() OVER (
      PARTITION BY "clinicId", "discipline", ("scheduledAt" + INTERVAL '8 hours')::date
      ORDER BY "createdAt", "id"
    ) AS number
  FROM "Appointment"
)
UPDATE "Appointment" AS appointment
SET "queueDay" = numbered.day, "queueNumber" = numbered.number
FROM numbered WHERE appointment."id" = numbered."id";

ALTER TABLE "Appointment"
  ALTER COLUMN "queueDay" SET NOT NULL,
  ALTER COLUMN "queueNumber" SET NOT NULL,
  ADD CONSTRAINT "Appointment_queueNumber_positive" CHECK ("queueNumber" > 0),
  ADD CONSTRAINT "Appointment_queueDay_matches_schedule"
    CHECK ("queueDay" = to_char("scheduledAt" + INTERVAL '8 hours', 'YYYY-MM-DD'));

CREATE UNIQUE INDEX "Appointment_clinicId_discipline_queueDay_queueNumber_key"
  ON "Appointment"("clinicId", "discipline", "queueDay", "queueNumber");

COMMIT;
