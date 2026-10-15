DO $$
DECLARE
  hmo_table_count INTEGER;
  height_nullable TEXT;
BEGIN
  SELECT COUNT(*) INTO hmo_table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'Membership', 'DependentLink', 'MembershipRevision', 'DependentLinkRevision'
    );
  IF hmo_table_count <> 0 THEN
    RAISE EXCEPTION 'Expected four HMO tables to be removed; found %.', hmo_table_count;
  END IF;

  IF (SELECT COUNT(*) FROM "Patient"
      WHERE "id" = '00000000-0000-4000-8000-000000000201'
        AND "patientCategory" = 'employee'
        AND "employeeIdentifier" = 'SYN-1042') <> 1 THEN
    RAISE EXCEPTION 'Patient category or employee reference did not survive.';
  END IF;

  SELECT is_nullable INTO height_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Vitals' AND column_name = 'height';
  IF height_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'Vitals.height must exist and allow NULL.';
  END IF;

  IF (SELECT COUNT(*) FROM "Vitals"
      WHERE "id" = '00000000-0000-4000-8000-000000000701'
        AND "systolic" = 120 AND "diastolic" = 80
        AND "weight" = 60 AND "height" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'The seeded vital sign or its nullable height did not survive.';
  END IF;

  UPDATE "Vitals" SET "height" = 165
  WHERE "id" = '00000000-0000-4000-8000-000000000701';
  IF (SELECT COUNT(*) FROM "Vitals"
      WHERE "id" = '00000000-0000-4000-8000-000000000701' AND "height" = 165) <> 1 THEN
    RAISE EXCEPTION 'Vitals.height did not accept a value after migration.';
  END IF;

  IF (SELECT COUNT(*) FROM "AuditEvent"
      WHERE "id" = '00000000-0000-4000-8000-000000000801'
        AND "action" = 'view' AND "source" = 'synthetic-verification') <> 1 THEN
    RAISE EXCEPTION 'The generic audit event did not survive.';
  END IF;

  RAISE NOTICE 'PASS: all four HMO tables are gone; registry fields, nullable height, vitals, and generic audit event remain.';
END;
$$;
