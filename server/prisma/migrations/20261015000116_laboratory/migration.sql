CREATE TABLE "LabOrder" (
  "id" UUID NOT NULL, "patientId" UUID NOT NULL, "orderingProviderId" UUID NOT NULL,
  "discipline" TEXT NOT NULL, "requestedTests" TEXT[] NOT NULL, "clinicalContext" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'routine', "requestedFor" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ordered', "revision" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3), "finalizedAt" TIMESTAMP(3), "reviewedAt" TIMESTAMP(3),
  "reviewedById" UUID, "closedAt" TIMESTAMP(3), "closeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabOrder_discipline_check" CHECK ("discipline" IN ('medical','dental')),
  CONSTRAINT "LabOrder_status_check" CHECK ("status" IN ('ordered','in_progress','resulted','reviewed','cancelled','rejected')),
  CONSTRAINT "LabOrder_priority_check" CHECK ("priority" IN ('routine','urgent')),
  CONSTRAINT "LabOrder_tests_check" CHECK (cardinality("requestedTests") BETWEEN 1 AND 50),
  CONSTRAINT "LabOrder_revision_check" CHECK ("revision" > 0)
);
CREATE TABLE "LabResult" (
  "id" UUID NOT NULL, "orderId" UUID NOT NULL, "authorId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft', "revision" INTEGER NOT NULL DEFAULT 1,
  "values" JSONB NOT NULL, "notes" TEXT, "correctionOfId" UUID, "correctionReason" TEXT,
  "sourceRevision" INTEGER, "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LabResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabResult_status_check" CHECK ("status" IN ('draft','finalized')),
  CONSTRAINT "LabResult_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "LabResult_values_check" CHECK (jsonb_typeof("values") = 'array' AND jsonb_array_length("values") BETWEEN 1 AND 100),
  CONSTRAINT "LabResult_correction_check" CHECK (("correctionOfId" IS NULL AND "correctionReason" IS NULL AND "sourceRevision" IS NULL) OR ("correctionOfId" IS NOT NULL AND "correctionReason" IS NOT NULL AND "sourceRevision" > 0 AND "status" = 'finalized'))
);
CREATE INDEX "LabOrder_patientId_discipline_createdAt_idx" ON "LabOrder"("patientId","discipline","createdAt");
CREATE INDEX "LabOrder_status_requestedFor_priority_idx" ON "LabOrder"("status","requestedFor","priority");
CREATE INDEX "LabResult_orderId_createdAt_idx" ON "LabResult"("orderId","createdAt");
CREATE UNIQUE INDEX "LabResult_correctionOfId_key" ON "LabResult"("correctionOfId");
CREATE UNIQUE INDEX "LabResult_one_original_per_order" ON "LabResult"("orderId") WHERE "correctionOfId" IS NULL;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_orderingProviderId_fkey" FOREIGN KEY ("orderingProviderId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "LabOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabResult" ADD CONSTRAINT "LabResult_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "LabResult"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
