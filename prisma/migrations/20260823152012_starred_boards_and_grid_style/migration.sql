-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "gridStyle" TEXT NOT NULL DEFAULT 'dot';

-- CreateTable
CREATE TABLE "StarredBoard" (
    "userId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarredBoard_pkey" PRIMARY KEY ("userId","boardId")
);

-- CreateIndex
CREATE INDEX "StarredBoard_boardId_idx" ON "StarredBoard"("boardId");

-- AddForeignKey
ALTER TABLE "StarredBoard" ADD CONSTRAINT "StarredBoard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarredBoard" ADD CONSTRAINT "StarredBoard_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
