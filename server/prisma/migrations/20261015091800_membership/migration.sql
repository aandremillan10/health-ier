-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "memberNumber" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "effectiveStart" TEXT NOT NULL,
    "effectiveEnd" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependentLink" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "dependentPatientId" UUID NOT NULL,
    "relationship" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "effectiveStart" TEXT NOT NULL,
    "effectiveEnd" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DependentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipRevision" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DependentLinkRevision" (
    "id" UUID NOT NULL,
    "linkId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DependentLinkRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_patientId_key" ON "Membership"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_memberNumber_key" ON "Membership"("memberNumber");

-- CreateIndex
CREATE INDEX "DependentLink_membershipId_state_idx" ON "DependentLink"("membershipId", "state");

-- CreateIndex
CREATE INDEX "DependentLink_dependentPatientId_state_idx" ON "DependentLink"("dependentPatientId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipRevision_membershipId_revision_key" ON "MembershipRevision"("membershipId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "DependentLinkRevision_linkId_revision_key" ON "DependentLinkRevision"("linkId", "revision");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependentLink" ADD CONSTRAINT "DependentLink_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependentLink" ADD CONSTRAINT "DependentLink_dependentPatientId_fkey" FOREIGN KEY ("dependentPatientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependentLink" ADD CONSTRAINT "DependentLink_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRevision" ADD CONSTRAINT "MembershipRevision_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipRevision" ADD CONSTRAINT "MembershipRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependentLinkRevision" ADD CONSTRAINT "DependentLinkRevision_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "DependentLink"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DependentLinkRevision" ADD CONSTRAINT "DependentLinkRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
