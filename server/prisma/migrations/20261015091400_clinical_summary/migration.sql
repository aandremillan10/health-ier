CREATE TABLE "ClinicalSummaryItem" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "content" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "notes" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClinicalSummaryItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicalSummaryItem_kind_check" CHECK ("kind" IN ('allergy', 'medication', 'condition', 'immunization')),
    CONSTRAINT "ClinicalSummaryItem_status_check" CHECK ("status" IN ('active', 'inactive')),
    CONSTRAINT "ClinicalSummaryItem_revision_check" CHECK ("revision" >= 1)
);

CREATE TABLE "ClinicalSummaryRevision" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalSummaryRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClinicalSummaryRevision_action_check" CHECK ("action" IN ('create', 'update', 'correct', 'inactivate')),
    CONSTRAINT "ClinicalSummaryRevision_revision_check" CHECK ("revision" >= 1)
);

CREATE INDEX "ClinicalSummaryItem_patientId_kind_status_idx" ON "ClinicalSummaryItem"("patientId", "kind", "status");
CREATE UNIQUE INDEX "ClinicalSummaryRevision_itemId_revision_key" ON "ClinicalSummaryRevision"("itemId", "revision");
ALTER TABLE "ClinicalSummaryItem" ADD CONSTRAINT "ClinicalSummaryItem_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalSummaryItem" ADD CONSTRAINT "ClinicalSummaryItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalSummaryRevision" ADD CONSTRAINT "ClinicalSummaryRevision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ClinicalSummaryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalSummaryRevision" ADD CONSTRAINT "ClinicalSummaryRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
