-- AlterTable
-- Nullable: invites created before this column keep working through their emailed link,
-- and a null code simply means that invite has no short form.
ALTER TABLE "WorkspaceInvite" ADD COLUMN     "code" TEXT;

-- CreateIndex
-- Unique so a code resolves to exactly one invite. Safe to add over existing rows:
-- Postgres unique indexes do not treat NULLs as equal, so every pre-existing invite
-- (all of which have code IS NULL) coexists happily under this constraint.
CREATE UNIQUE INDEX "WorkspaceInvite_code_key" ON "WorkspaceInvite"("code");
