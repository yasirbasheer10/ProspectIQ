import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { v4 as uuidv4 } from "uuid"
import { sendPasswordResetEmail } from "@/lib/email"
import { z } from "zod"

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()
    
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      // Don't leak whether the user exists or not for security
      return new Response(JSON.stringify({ success: true, message: "If your email is registered, you will receive a reset link." }), { status: 200 })
    }

    // Check rate limit - clean up old tokens first
    await prisma.passwordResetToken.deleteMany({
      where: { expires: { lt: new Date() } }
    })

    const recentToken = await prisma.passwordResetToken.findFirst({
      where: { identifier: email },
      orderBy: { expires: 'desc' }
    })
    
    if (recentToken) {
      const timeSinceCreation = new Date().getTime() - (recentToken.expires.getTime() - 1000 * 60 * 60)
      if (timeSinceCreation < 1000 * 60) { // 1 minute rate limit
         return new Response(JSON.stringify({ error: "Please wait a minute before requesting another reset" }), { status: 429 })
      }
    }

    const token = uuidv4()
    
    // Delete any existing valid tokens for this user to invalidate old links
    await prisma.passwordResetToken.deleteMany({
      where: { identifier: email }
    })

    await prisma.passwordResetToken.create({
      data: {
        identifier: email,
        token,
        expires: new Date(Date.now() + 1000 * 60 * 60), // 1 hour expiration
      }
    })

    await sendPasswordResetEmail(email, token)

    return new Response(JSON.stringify({ 
      success: true, 
      message: "If your email is registered, you will receive a reset link." 
    }), { status: 200 })

  } catch (error) {
    console.error("Password reset error:", error)
    return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { token, password } = await req.json()

    if (!token || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 })
    }

    // Validate password strength
    const schema = z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/)
    const result = schema.safeParse(password)
    if (!result.success) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters and contain a number and uppercase letter" }), { status: 400 })
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token }
    })

    if (!resetToken) {
      return new Response(JSON.stringify({ error: "Invalid or expired reset token" }), { status: 400 })
    }

    if (new Date() > resetToken.expires) {
      // Clean it up
      await prisma.passwordResetToken.delete({ where: { token } })
      return new Response(JSON.stringify({ error: "Reset token has expired" }), { status: 400 })
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    // Update user
    await prisma.user.update({
      where: { email: resetToken.identifier },
      data: { passwordHash }
    })

    // Delete the token
    await prisma.passwordResetToken.delete({
      where: { token }
    })

    return new Response(JSON.stringify({ success: true, message: "Password updated successfully" }), { status: 200 })

  } catch (error) {
    console.error("Password update error:", error)
    return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500 })
  }
}
