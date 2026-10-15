CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL PRIMARY KEY,
  "actorId" UUID NOT NULL,
  "actorName" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "patientId" UUID,
  "resourceType" TEXT NOT NULL,
  "resourceId" UUID,
  "outcome" TEXT NOT NULL CHECK ("outcome" IN ('success', 'failure')),
  "source" TEXT NOT NULL DEFAULT 'clinic-api',
  "workstation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_createdAt_id_idx" ON "AuditEvent"("createdAt", "id");
CREATE INDEX "AuditEvent_patientId_createdAt_idx" ON "AuditEvent"("patientId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE FUNCTION preserve_audit_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are append-only.';
END;
$$;
CREATE TRIGGER "AuditEvent_immutable" BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION preserve_audit_event();
