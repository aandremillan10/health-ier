BEGIN;

INSERT INTO "Staff" (
  "id", "username", "passwordHash", "displayName", "role", "isHead", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-000000000101', 'migration-check', 'synthetic-only',
  'Synthetic migration checker', 'attendant', false, CURRENT_TIMESTAMP
);

INSERT INTO "Patient" (
  "id", "fullName", "patientCategory", "employeeIdentifier", "updatedAt"
) VALUES
  ('00000000-0000-4000-8000-000000000201', 'Synthetic employee patient', 'employee', 'SYN-1042', CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000202', 'Synthetic dependent patient', 'dependent', NULL, CURRENT_TIMESTAMP);

INSERT INTO "Vitals" (
  "id", "patientId", "authorId", "status", "systolic", "diastolic", "weight", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'draft', 120, 80, 60, CURRENT_TIMESTAMP
);

INSERT INTO "Membership" (
  "id", "patientId", "memberNumber", "effectiveStart", "authorId", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  'SYN-MEMBER-1', '2026-01-01', '00000000-0000-4000-8000-000000000101', CURRENT_TIMESTAMP
);

INSERT INTO "DependentLink" (
  "id", "membershipId", "dependentPatientId", "relationship", "effectiveStart", "authorId", "updatedAt"
) VALUES (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000202',
  'child', '2026-01-01', '00000000-0000-4000-8000-000000000101', CURRENT_TIMESTAMP
);

INSERT INTO "MembershipRevision" (
  "id", "membershipId", "authorId", "revision", "action", "snapshot"
) VALUES (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000101', 1, 'create', '{"memberNumber":"SYN-MEMBER-1"}'
);

INSERT INTO "DependentLinkRevision" (
  "id", "linkId", "authorId", "revision", "action", "snapshot"
) VALUES (
  '00000000-0000-4000-8000-000000000601',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000101', 1, 'create', '{"relationship":"child"}'
);

INSERT INTO "AuditEvent" (
  "id", "actorId", "actorName", "actorRole", "action", "patientId",
  "resourceType", "resourceId", "outcome", "source"
) VALUES (
  '00000000-0000-4000-8000-000000000801',
  '00000000-0000-4000-8000-000000000101',
  'Synthetic migration checker', 'attendant', 'view',
  '00000000-0000-4000-8000-000000000201', 'patient',
  '00000000-0000-4000-8000-000000000201', 'success', 'synthetic-verification'
);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "Membership") <> 1
     OR (SELECT COUNT(*) FROM "DependentLink") <> 1
     OR (SELECT COUNT(*) FROM "MembershipRevision") <> 1
     OR (SELECT COUNT(*) FROM "DependentLinkRevision") <> 1 THEN
    RAISE EXCEPTION 'Synthetic HMO migration rows were not seeded.';
  END IF;
END;
$$;

COMMIT;
