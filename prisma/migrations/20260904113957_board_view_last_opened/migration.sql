-- CreateTable
CREATE TABLE "BoardView" (
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardView_pkey" PRIMARY KEY ("userId","boardId")
);

-- CreateIndex
CREATE INDEX "BoardView_userId_viewedAt_idx" ON "BoardView"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "BoardView_boardId_idx" ON "BoardView"("boardId");

-- AddForeignKey
ALTER TABLE "BoardView" ADD CONSTRAINT "BoardView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardView" ADD CONSTRAINT "BoardView_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed one row per (workspace member, live board) from the board's last edit.
--
-- Without this, Recent is empty on first load for every existing board and the section
-- reads as broken until each one has been opened once. updatedAt is the wrong timestamp
-- by definition — that is why this table exists — but it is the only evidence the
-- database has of a board ever having been touched, and every row it writes is replaced
-- by a real one the first time that user actually opens that board.
--
-- Trashed boards are skipped: they do not appear in Recent, so a row for one would only
-- ever be dead weight.
INSERT INTO "BoardView" ("userId", "boardId", "viewedAt")
SELECT m."userId", b."id", b."updatedAt"
FROM "Board" b
JOIN "Membership" m ON m."workspaceId" = b."workspaceId"
WHERE b."deletedAt" IS NULL
ON CONFLICT ("userId", "boardId") DO NOTHING;
