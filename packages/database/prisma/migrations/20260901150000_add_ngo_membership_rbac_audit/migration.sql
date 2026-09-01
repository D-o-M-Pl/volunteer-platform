CREATE TYPE "OrganizationRole" AS ENUM ('NGO_OWNER', 'NGO_MANAGER', 'NGO_RECRUITER', 'NGO_VIEWER');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

DROP INDEX IF EXISTS "organizations_owner_subject_key";
CREATE INDEX "organizations_owner_subject_idx" ON "organizations"("owner_subject");

CREATE TABLE "organization_memberships" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "identity_subject" TEXT NOT NULL,
  "role" "OrganizationRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "organization_memberships_organization_id_identity_subject_key" ON "organization_memberships"("organization_id", "identity_subject");
CREATE INDEX "organization_memberships_identity_subject_status_idx" ON "organization_memberships"("identity_subject", "status");
CREATE INDEX "organization_memberships_organization_id_role_status_idx" ON "organization_memberships"("organization_id", "role", "status");

INSERT INTO "organization_memberships" ("id", "organization_id", "identity_subject", "role", "status", "updated_at")
SELECT gen_random_uuid()::text, "id", "owner_subject", 'NGO_OWNER', 'ACTIVE', CURRENT_TIMESTAMP
FROM "organizations" WHERE "owner_subject" IS NOT NULL
ON CONFLICT ("organization_id", "identity_subject") DO NOTHING;

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "actor_subject" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT NOT NULL,
  "metadata" JSONB,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_organization_id_occurred_at_idx" ON "audit_logs"("organization_id", "occurred_at");
CREATE INDEX "audit_logs_actor_subject_occurred_at_idx" ON "audit_logs"("actor_subject", "occurred_at");

-- Audit records are append-only for the application runtime role.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_logs" FROM PUBLIC;
