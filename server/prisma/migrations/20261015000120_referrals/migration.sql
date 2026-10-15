CREATE TABLE "Referral" (
  "id" UUID NOT NULL, "patientId" UUID NOT NULL, "originStaffId" UUID NOT NULL,
  "originDiscipline" TEXT NOT NULL, "receivingDiscipline" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "revision" INTEGER NOT NULL DEFAULT 1,
  "acceptedAt" TIMESTAMP(3), "acceptedById" UUID, "startedAt" TIMESTAMP(3), "startedById" UUID,
  "completedAt" TIMESTAMP(3), "completedById" UUID, "completionNote" TEXT, "completionReference" TEXT,
  "closedAt" TIMESTAMP(3), "closedById" UUID, "closeReason" TEXT, "labOrderId" UUID, "labResultId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Referral_origin_check" CHECK ("originDiscipline" IN ('medical','dental')),
  CONSTRAINT "Referral_unit_check" CHECK ("receivingDiscipline" IN ('medical','dental','laboratory') AND "receivingDiscipline" <> "originDiscipline"),
  CONSTRAINT "Referral_status_check" CHECK ("status" IN ('pending','accepted','in_progress','completed','cancelled','rejected')),
  CONSTRAINT "Referral_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "Referral_lab_order_check" CHECK (("receivingDiscipline" = 'laboratory') = ("labOrderId" IS NOT NULL)),
  CONSTRAINT "Referral_completion_check" CHECK (("status" <> 'completed' AND "completedAt" IS NULL AND "completedById" IS NULL AND "labResultId" IS NULL) OR ("status" = 'completed' AND "completedAt" IS NOT NULL AND "completedById" IS NOT NULL AND (("receivingDiscipline" = 'laboratory' AND "labResultId" IS NOT NULL) OR ("receivingDiscipline" <> 'laboratory' AND "labResultId" IS NULL AND "completionNote" IS NOT NULL))))
);
CREATE INDEX "Referral_patientId_createdAt_idx" ON "Referral"("patientId","createdAt");
CREATE INDEX "Referral_originStaffId_status_createdAt_idx" ON "Referral"("originStaffId","status","createdAt");
CREATE INDEX "Referral_receivingDiscipline_status_createdAt_idx" ON "Referral"("receivingDiscipline","status","createdAt");
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_originStaffId_fkey" FOREIGN KEY ("originStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_labResultId_fkey" FOREIGN KEY ("labResultId") REFERENCES "LabResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
