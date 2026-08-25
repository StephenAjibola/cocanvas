import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const { token, newPassword } = await req.json()

    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const reset = await prisma.passwordResetToken.findUnique({ where: { token } })
    if (!reset) {
      return NextResponse.json({ error: "This reset link is invalid or has already been used" }, { status: 400 })
    }

    if (reset.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { id: reset.id } })
      return NextResponse.json({ error: "This reset link has expired. Request a new one." }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Clicking a link sent to that inbox proves ownership, so a reset also verifies the
    // email — otherwise an unverified user resets successfully and is still locked out.
    await prisma.user.update({
      where: { id: reset.userId },
      data: { password: hashedPassword, emailVerified: new Date() },
    })

    await prisma.passwordResetToken.delete({ where: { id: reset.id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("POST /api/reset-password failed:", err)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
