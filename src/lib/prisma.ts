import { PrismaClient } from "@/generated/prisma/client"
import { PrismaNeon } from "@prisma/adapter-neon"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Neon's own driver adapter, over its WebSocket pool.
 *
 * PrismaNeon, deliberately NOT PrismaNeonHttp. The HTTP transport is one-shot and has no
 * startTransaction, and requireWorkspace() creates a workspace with a nested membership
 * write — which Prisma runs inside an implicit transaction, on the path of every first
 * dashboard load. HTTP would typecheck and then fail there at runtime.
 *
 * DATABASE_URL points at the -pooler host, so this shares a small set of real Postgres
 * connections across every request rather than each one opening its own. No
 * `pgbouncer=true` param: that exists to stop Prisma's Rust engine using session-level
 * prepared statements, and the driver-adapter path does not go through that engine.
 *
 * No neonConfig.webSocketConstructor either — the driver only needs one where there is
 * no global WebSocket, and both Node 20+ (Vercel) and local Node have it built in.
 */
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })

// The singleton matters more with WebSockets than it did with node-postgres: without it
// every dev hot-reload would leave another live pool dangling.
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
