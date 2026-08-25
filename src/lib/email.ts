import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendPasswordResetEmail(email: string, url: string) {
  const { error } = await resend.emails.send({
    from: "CoCanvas <onboarding@resend.dev>",
    to: email,
    subject: "Reset your CoCanvas password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>Click the link below to choose a new password:</p>
        <p><a href="${url}" style="font-size: 16px;">${url}</a></p>
        <p style="color: #666; font-size: 14px;">This link expires in 60 minutes and can only be used once. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  })

  if (error) {
    // ponytail: same dev fallback as verification — Resend test mode only reaches the account owner
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[dev] email send failed (${error.message})\n[dev] password reset link for ${email}: ${url}`)
      return
    }
    throw new Error(`Resend failed to send password reset email: ${error.message}`)
  }
}

export async function sendWorkspaceInviteEmail(
  email: string,
  inviterName: string,
  workspaceName: string,
  url: string,
) {
  const { error } = await resend.emails.send({
    from: "CoCanvas <onboarding@resend.dev>",
    to: email,
    subject: `${inviterName} invited you to ${workspaceName} on CoCanvas`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You're invited to ${workspaceName}</h2>
        <p>${inviterName} invited you to collaborate on their CoCanvas workspace.</p>
        <p><a href="${url}" style="font-size: 16px;">${url}</a></p>
        <p style="color: #666; font-size: 14px;">This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>
      </div>
    `,
  })

  if (error) {
    // ponytail: same dev fallback as verification — Resend test mode only reaches the account owner
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[dev] email send failed (${error.message})\n[dev] invite link for ${email}: ${url}`)
      return
    }
    throw new Error(`Resend failed to send invite email: ${error.message}`)
  }
}

export async function sendVerificationEmail(email: string, code: string) {
  const { error } = await resend.emails.send({
    from: "CoCanvas <onboarding@resend.dev>",
    to: email,
    subject: "Verify your CoCanvas account",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verify your email</h2>
        <p>Enter this code to finish creating your CoCanvas account:</p>
        <p style="font-size: 32px; font-weight: 600; letter-spacing: 4px;">${code}</p>
        <p style="color: #666; font-size: 14px;">This code expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  })

  if (error) {
    // ponytail: Resend test mode only delivers to the account owner's address, so any other
    // signup would 500 locally. Log the code instead and let the flow continue — dev only.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[dev] email send failed (${error.message})\n[dev] verification code for ${email}: ${code}`)
      return
    }
    throw new Error(`Resend failed to send verification email: ${error.message}`)
  }
}