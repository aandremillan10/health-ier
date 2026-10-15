CREATE TABLE "HistoricalDocument" (
  "id" UUID PRIMARY KEY,
  "patientId" UUID NOT NULL REFERENCES "Patient"("id"),
  "discipline" TEXT NOT NULL CHECK ("discipline" IN ('medical','dental','laboratory')),
  "documentType" TEXT NOT NULL,
  "documentDate" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL CHECK ("mimeType" IN ('application/pdf','image/jpeg')),
  "byteLength" INTEGER NOT NULL CHECK ("byteLength" BETWEEN 1 AND 10485760),
  "sha256" TEXT NOT NULL CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  "objectKey" TEXT NOT NULL UNIQUE,
  "uploaderId" UUID NOT NULL REFERENCES "Staff"("id"),
  "uploaderName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replacesId" UUID UNIQUE REFERENCES "HistoricalDocument"("id"),
  "replacementReason" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" = 1),
  CHECK (("replacesId" IS NULL) = ("replacementReason" IS NULL))
);
CREATE INDEX "HistoricalDocument_patientId_discipline_createdAt_id_idx"
  ON "HistoricalDocument"("patientId","discipline","createdAt","id");
CREATE TRIGGER "HistoricalDocument_immutable" BEFORE UPDATE OR DELETE ON "HistoricalDocument"
  FOR EACH ROW EXECUTE FUNCTION preserve_audit_event();
