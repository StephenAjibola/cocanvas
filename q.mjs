import { PrismaClient } from "./src/generated/prisma/client.ts"
import { PrismaNeon } from "@prisma/adapter-neon"
const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }) })
const ws = "cmsgehgtf0000z0v89ymd92s5"
const a = await p.board.create({ data: { name: "ZZ purge-test A", workspaceId: ws, deletedAt: new Date() } })
const b = await p.board.create({ data: { name: "ZZ purge-test B", workspaceId: ws, deletedAt: new Date() } })
console.log("created trashed:", a.id, b.id)
await p.$disconnect()
