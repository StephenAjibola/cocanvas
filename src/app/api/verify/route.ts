import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const { email, code } = await req.json()

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 })
  }

  const token = await prisma.emailVerificationCode.findFirst({
    where: { userId: user.id, token: code },
  })

  if (!token) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 })
  }

  if (token.expiresAt < new Date()) {
    return NextResponse.json({ error: "Code has expired" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: new Date() },
  })

  await prisma.emailVerificationCode.delete({ where: { id: token.id } })

  return NextResponse.json({ success: true })
}