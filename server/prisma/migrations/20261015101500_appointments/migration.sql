CREATE TABLE "Appointment" (
  "id" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "clinicId" TEXT NOT NULL,
  "discipline" TEXT NOT NULL CHECK ("discipline" IN ('medical', 'dental', 'laboratory')),
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'scheduled' CHECK ("status" IN ('scheduled', 'arrived', 'waiting', 'with_provider', 'lab', 'completed', 'no_show')),
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" UUID NOT NULL,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Appointment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Appointment_clinicId_scheduledAt_discipline_idx" ON "Appointment"("clinicId", "scheduledAt", "discipline");
CREATE INDEX "Appointment_patientId_idx" ON "Appointment"("patientId");
CREATE TABLE "AppointmentEvent" (
  "id" UUID NOT NULL,
  "appointmentId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('scheduled', 'transition', 'correction')),
  "fromStatus" TEXT,
  "toStatus" TEXT NOT NULL,
  "actorId" UUID NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT,
  CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AppointmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AppointmentEvent_appointmentId_revision_key" ON "AppointmentEvent"("appointmentId", "revision");
