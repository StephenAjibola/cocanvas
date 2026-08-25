-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "shareAccess" TEXT NOT NULL DEFAULT 'off';

-- Backfill: before this column existed, HAVING a token was itself the grant, and the
-- grant was always view-only. Defaulting those rows to 'off' would silently kill every
-- link already in circulation, so they are migrated to the tier they already had.
-- Currently matches zero rows in this database; it is here so the migration is correct
-- against any database it is replayed on, including production.
UPDATE "Board" SET "shareAccess" = 'view' WHERE "shareToken" IS NOT NULL;
