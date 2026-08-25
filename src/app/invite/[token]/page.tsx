import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Logo } from "@/components/Logo"
import { AcceptInviteCard } from "@/components/AcceptInviteCard"

const ROLE_LABEL = { OWNER: "Owner", EDITOR: "Editor", VIEWER: "Viewer" } as const

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const invite = await prisma.workspaceInvite.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      workspace: { select: { name: true } },
      invitedBy: { select: { name: true, email: true } },
    },
  })
  const session = await auth()
  const next = `/invite/${token}`

  return (
    <main className="flex min-h-screen items-center justify-center bg-hero px-4 text-ink-900">
      <div className="w-full max-w-sm">
        <Logo variant="light" className="mb-8" />

        {!invite || invite.expiresAt < new Date() ? (
          <>
            <h1 className="mb-2 text-2xl font-medium">
              {invite ? "This invite has expired" : "Invite not found"}
            </h1>
            <p className="text-sm text-ink-700">
              Ask whoever invited you to send a new one.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-2xl font-medium">You&apos;re invited</h1>
            <p className="mb-6 text-sm text-ink-700">
              {invite.invitedBy.name || invite.invitedBy.email} invited{" "}
              <span className="font-medium text-ink-900">{invite.email}</span> to join{" "}
              <span className="font-medium text-ink-900">{invite.workspace.name}</span> as
              an {ROLE_LABEL[invite.role]}.
            </p>

            {!session?.user?.email ? (
              <div className="space-y-2">
                <Link
                  href={`/login?next=${encodeURIComponent(next)}`}
                  className="block w-full rounded bg-accent-500 py-2 text-center font-medium text-white hover:bg-accent-700"
                >
                  Sign in
                </Link>
                <Link
                  href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}
                  className="block w-full rounded border border-ink-400 py-2 text-center font-medium hover:bg-paper-50"
                >
                  Create an account
                </Link>
              </div>
            ) : session.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
              <AcceptInviteCard
                token={token}
                mode="mismatch"
                invitedEmail={invite.email}
                currentEmail={session.user.email}
                next={next}
              />
            ) : (
              <AcceptInviteCard token={token} mode="accept" invitedEmail={invite.email} next={next} />
            )}
          </>
        )}
      </div>
    </main>
  )
}
