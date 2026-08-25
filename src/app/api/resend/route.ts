import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendVerificationEmail } from "@/lib/email"

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email } })

    // ponytail: same response for unknown/already-verified so this can't be used to probe accounts
    if (!user || user.emailVerified) {
      return NextResponse.json({ success: true })
    }

    const last = await prisma.emailVerificationCode.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    })

    // ponytail: cooldown read off the last token's createdAt, no rate-limit store needed
    if (last && Date.now() - last.createdAt.getTime() < 60_000) {
      return NextResponse.json(
        { error: "Please wait a minute before requesting another code" },
        { status: 429 }
      )
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)

    await prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } })
    await prisma.emailVerificationCode.create({
      data: { token: code, userId: user.id, expiresAt },
    })

    await sendVerificationEmail(email, code)

    return NextResponse.json({ success: true, expiresAt })
  } catch (err) {
    console.error("POST /api/resend failed:", err)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 })
  }
}
