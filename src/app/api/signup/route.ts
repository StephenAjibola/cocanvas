import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { sendVerificationEmail } from "@/lib/email"

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    })

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    await prisma.emailVerificationCode.create({
      data: { token: code, userId: user.id, expiresAt },
    })

    try {
      await sendVerificationEmail(email, code)
    } catch (err) {
      // ponytail: no rollback here strands an unverified user row, and the 409 above then blocks re-signup forever
      await prisma.user.delete({ where: { id: user.id } })
      throw err
    }

    return NextResponse.json({ success: true, userId: user.id, expiresAt })
  } catch (err) {
    console.error("POST /api/signup failed:", err)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}