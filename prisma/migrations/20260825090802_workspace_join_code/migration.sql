-- Nullable, so every existing workspace starts with the code OFF. Postgres treats NULLs
-- as distinct under a unique index, so no backfill is needed and no existing row can
-- collide with another.
ALTER TABLE "Workspace" ADD COLUMN "joinCode" TEXT;

CREATE UNIQUE INDEX "Workspace_joinCode_key" ON "Workspace"("joinCode");
