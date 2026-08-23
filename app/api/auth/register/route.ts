import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { v4 as uuidv4 } from "uuid"
import { sendVerificationEmail } from "@/lib/email"
import { clientIp, rateLimit } from "@/lib/rate-limit"

const registerSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
})

/** Registrations allowed per IP per window. */
const MAX_PER_IP = 5
const IP_WINDOW_MS = 15 * 60 * 1000

/**
 * Minimum gap between two verification emails to the same address.
 *
 * Enforced against the database rather than memory, so it holds across
 * serverless instances and cold starts — unlike the IP limit above.
 */
const EMAIL_COOLDOWN_MS = 2 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    // Unauthenticated, creates a row and sends an email on every call. Without
    // a limit, one loop mints unlimited users and burns the Resend quota (or
    // uses this endpoint to mail a third party repeatedly).
    const ip = clientIp(req.headers)
    const limit = rateLimit(`register:${ip}`, MAX_PER_IP, IP_WINDOW_MS)
    if (!limit.ok) {
      return new Response(
        JSON.stringify({ error: "Too many sign-up attempts. Please try again in a few minutes." }),
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      )
    }

    const body = await req.json()
    const { firstName, lastName, email, password } = registerSchema.parse(body)

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return new Response(JSON.stringify({ error: "Email already exists. Please log in." }), { status: 409 })
    }

    // Per-address cooldown. The IP limit above can be sidestepped by rotating
    // addresses; this one can't, because it is keyed on the thing that actually
    // receives the email.
    const recentToken = await prisma.verificationToken.findFirst({
      where: {
        identifier: email,
        createdAt: { gt: new Date(Date.now() - EMAIL_COOLDOWN_MS) },
      },
    })

    if (recentToken) {
      return new Response(
        JSON.stringify({ error: "A verification email was just sent to that address. Please check your inbox." }),
        { status: 429, headers: { "Retry-After": String(Math.ceil(EMAIL_COOLDOWN_MS / 1000)) } }
      )
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    // Create user
    const user = await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`.trim(),
        email,
        passwordHash,
      },
    })

    // Generate Verification Token
    const token = uuidv4()
    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires: new Date(Date.now() + 1000 * 60 * 60 * 24), // 24 hours
      }
    })

    // Send email
    await sendVerificationEmail(email, token)

    return new Response(JSON.stringify({
      success: true,
      message: "User created successfully. Please check your email to verify your account.",
      user: { id: user.id, email: user.email, name: user.name }
    }), { status: 201 })

  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({ error: error.issues[0].message }), { status: 400 })
    }
    // The real reason goes to the server log only. This used to return
    // `Debug Error: ${error.message}` to the caller, which on an unauthenticated
    // endpoint hands out Prisma messages, table and column names, and connection
    // strings to anyone who can POST malformed data at it.
    console.error("Registration error:", error)
    return new Response(JSON.stringify({ error: "Could not create your account. Please try again." }), { status: 500 })
  }
}
