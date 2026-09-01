-- Bind application records to immutable identity-provider subjects.
-- Nullable columns preserve existing records for an administrator-reviewed backfill.
ALTER TABLE "volunteers" ADD COLUMN "identity_subject" TEXT;
ALTER TABLE "organizations" ADD COLUMN "owner_subject" TEXT;

CREATE UNIQUE INDEX "volunteers_identity_subject_key"
  ON "volunteers"("identity_subject");
CREATE UNIQUE INDEX "organizations_owner_subject_key"
  ON "organizations"("owner_subject");
CREATE INDEX "tasks_organization_id_status_idx"
  ON "tasks"("organization_id", "status");
CREATE INDEX "applications_task_id_status_idx"
  ON "applications"("task_id", "status");
