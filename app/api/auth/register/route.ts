import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { v4 as uuidv4 } from "uuid"
import { sendVerificationEmail } from "@/lib/email"

const registerSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { firstName, lastName, email, password } = registerSchema.parse(body)

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return new Response(JSON.stringify({ error: "Email already exists. Please log in." }), { status: 409 })
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
