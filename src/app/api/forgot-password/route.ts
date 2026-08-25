import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { sendPasswordResetEmail } from "@/lib/email"

// Same body for every outcome so this endpoint can't be used to probe which emails exist.
const GENERIC = { success: true, message: "If an account exists with this email, we've sent a reset link." }

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return NextResponse.json(GENERIC)

    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    // ponytail: one live reset link per user — issuing a new one retires the old
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })
    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    })

    const origin = new URL(req.url).origin
    await sendPasswordResetEmail(email, `${origin}/reset-password?token=${token}`)

    return NextResponse.json(GENERIC)
  } catch (err) {
    console.error("POST /api/forgot-password failed:", err)
    // Still generic: a send failure must not become an existence oracle either.
    return NextResponse.json(GENERIC)
  }
}
