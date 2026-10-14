-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Staff" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isHead" BOOLEAN NOT NULL DEFAULT false,
    "licenseText" TEXT,
    "ptrText" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "tokenHash" TEXT NOT NULL,
    "staffId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "fullName" TEXT NOT NULL,
    "sex" TEXT,
    "address" TEXT,
    "patientCategory" TEXT,
    "employeeIdentifier" TEXT,
    "dateOfBirth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vitals" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "systolic" DOUBLE PRECISION,
    "diastolic" DOUBLE PRECISION,
    "temperature" DOUBLE PRECISION,
    "pulse" DOUBLE PRECISION,
    "respiratoryRate" DOUBLE PRECISION,
    "oxygenSaturation" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "discipline" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "consultationDate" TEXT,
    "ageAtConsultation" INTEGER,
    "cs" TEXT,
    "vitalsId" UUID,
    "reason" TEXT,
    "findings" TEXT,
    "clinicalImpression" TEXT,
    "plan" TEXT,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" UUID NOT NULL,
    "originalType" TEXT NOT NULL,
    "originalEntryId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "correctedContent" JSONB NOT NULL,
    "sourceRevision" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "consultationId" UUID NOT NULL,
    "issuerId" UUID NOT NULL,
    "issueDate" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "eventId" UUID NOT NULL,
    "clinicId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL DEFAULT 'upsert',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "MirrorEntity" (
    "clinicId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MirrorEntity_pkey" PRIMARY KEY ("clinicId","entityType","entityId")
);

-- CreateTable
CREATE TABLE "MirrorVersion" (
    "clinicId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "MirrorVersion_pkey" PRIMARY KEY ("clinicId","entityType","entityId","revision")
);

-- CreateTable
CREATE TABLE "MirrorReceipt" (
    "clinicId" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MirrorReceipt_pkey" PRIMARY KEY ("clinicId","eventId")
);

-- CreateTable
CREATE TABLE "MirrorState" (
    "clinicId" TEXT NOT NULL,
    "bootstrapCompletedAt" TIMESTAMP(3),
    "lastAcknowledgedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "MirrorState_pkey" PRIMARY KEY ("clinicId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_username_key" ON "Staff"("username");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Vitals_patientId_idx" ON "Vitals"("patientId");

-- CreateIndex
CREATE INDEX "Entry_patientId_discipline_idx" ON "Entry"("patientId", "discipline");

-- CreateIndex
CREATE INDEX "Correction_originalType_originalEntryId_idx" ON "Correction"("originalType", "originalEntryId");

-- CreateIndex
CREATE INDEX "Outbox_acknowledgedAt_createdAt_idx" ON "Outbox"("acknowledgedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Outbox_clinicId_entityType_entityId_revision_key" ON "Outbox"("clinicId", "entityType", "entityId", "revision");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_vitalsId_fkey" FOREIGN KEY ("vitalsId") REFERENCES "Vitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_issuerId_fkey" FOREIGN KEY ("issuerId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Domain authority and immutable-history constraints also apply outside HTTP handlers.
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_role_check" CHECK (role IN ('doctor','dentist','medtech','attendant','clerk'));
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_head_doctor_check" CHECK (NOT "isHead" OR role = 'doctor');
CREATE UNIQUE INDEX "one_head_doctor" ON "Staff" (("isHead")) WHERE "isHead";
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_discipline_check" CHECK (discipline IN ('medical','dental','laboratory'));
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_status_check" CHECK (status IN ('draft','finalized'));
ALTER TABLE "Vitals" ADD CONSTRAINT "Vitals_status_check" CHECK (status IN ('draft','finalized'));
CREATE FUNCTION preserve_finalized() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'finalized' AND (to_jsonb(NEW) - 'revision' - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'revision' - 'updatedAt') THEN
    RAISE EXCEPTION 'Finalized clinical content is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Entry_preserve_finalized" BEFORE UPDATE ON "Entry" FOR EACH ROW EXECUTE FUNCTION preserve_finalized();
CREATE TRIGGER "Vitals_preserve_finalized" BEFORE UPDATE ON "Vitals" FOR EACH ROW EXECUTE FUNCTION preserve_finalized();
CREATE FUNCTION preserve_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'History is immutable';
END $$;
CREATE TRIGGER "Document_immutable" BEFORE UPDATE OR DELETE ON "Document" FOR EACH ROW EXECUTE FUNCTION preserve_record();
CREATE TRIGGER "Correction_immutable" BEFORE UPDATE OR DELETE ON "Correction" FOR EACH ROW EXECUTE FUNCTION preserve_record();
CREATE FUNCTION preserve_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'acknowledgedAt' - 'attempts' - 'lastError') IS DISTINCT FROM (to_jsonb(OLD) - 'acknowledgedAt' - 'attempts' - 'lastError') THEN
    RAISE EXCEPTION 'Outbox event content is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Outbox_immutable" BEFORE UPDATE ON "Outbox" FOR EACH ROW EXECUTE FUNCTION preserve_outbox();
