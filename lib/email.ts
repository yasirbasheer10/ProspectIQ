import { Resend } from "resend"

const resendApiKey = process.env.RESEND_API_KEY
const resend = resendApiKey ? new Resend(resendApiKey) : null

export const sendEmail = async ({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) => {
  if (!resend) {
    console.log("----------------------------------------")
    console.log("MOCK EMAIL SENT (No RESEND_API_KEY found)")
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Body: ${html}`)
    console.log("----------------------------------------")
    return { success: true, mock: true }
  }

  try {
    const data = await resend.emails.send({
      from: "ProspectIQ <onboarding@resend.dev>", // Update this to your verified domain in production
      to,
      subject,
      html,
    })
    return { success: true, data }
  } catch (error) {
    console.error("Error sending email:", error)
    return { success: false, error }
  }
}

export const sendVerificationEmail = async (email: string, token: string) => {
  const confirmLink = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${token}`
  
  return sendEmail({
    to: email,
    subject: "Verify your email - ProspectIQ",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to ProspectIQ!</h2>
        <p>Please click the button below to verify your email address and complete your registration.</p>
        <div style="margin: 30px 0;">
          <a href="${confirmLink}" style="background-color: #0071E3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify Email</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p><a href="${confirmLink}">${confirmLink}</a></p>
      </div>
    `,
  })
}

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const resetLink = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${token}`
  
  return sendEmail({
    to: email,
    subject: "Reset your password - ProspectIQ",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>You requested a password reset for your ProspectIQ account. Click the button below to set a new password.</p>
        <div style="margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #0071E3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset Password</a>
        </div>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p>Or copy and paste this link into your browser:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
      </div>
    `,
  })
}
