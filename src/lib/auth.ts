import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"
import { PrismaAdapter } from "@auth/prisma-adapter"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"

// ponytail: only a CredentialsSignin subclass propagates a `code` to the client.
// A plain Error here becomes a masked CallbackRouteError and the reason is lost.
class EmailNotVerified extends CredentialsSignin {
  code = "EMAIL_NOT_VERIFIED"
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    // Non-client-safe failures (CallbackRouteError et al.) are collapsed to
    // `Configuration`, and Auth.js's built-in page renders that as a raw HTTP 500.
    // Send them to /login, which already reads ?error=.
    error: "/login",
  },
  events: {
    // OAuth providers verify email on their side, so mark the row verified when the
    // account is linked. Without this an OAuth user lands with emailVerified: null.
    linkAccount: async ({ user }) => {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      })
    },
  },
  providers: [
    // Linking by email is only unsafe with providers that don't verify it — someone could
    // claim an address they don't own and inherit the existing account. Google and GitHub
    // both verify, so the address in the profile is trustworthy. Do NOT copy this flag onto
    // a provider that doesn't guarantee a verified email.
    Google({ allowDangerousEmailAccountLinking: true }),
    GitHub({ allowDangerousEmailAccountLinking: true }),
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined
        const password = credentials?.password as string | undefined

        if (!email || !password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.password) return null

        const isValid = await bcrypt.compare(password, user.password)
        if (!isValid) return null

        if (!user.emailVerified) {
          throw new EmailNotVerified()
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      },
    }),
  ],
})