import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token")

    if (!token) {
      return new Response("Missing token", { status: 400 })
    }

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    })

    if (!verificationToken) {
      return new Response("Invalid or expired token", { status: 400 })
    }

    if (new Date() > verificationToken.expires) {
      return new Response("Token has expired", { status: 400 })
    }

    // Verify user
    await prisma.user.update({
      where: { email: verificationToken.identifier },
      data: { emailVerified: new Date() },
    })

    // Delete token
    await prisma.verificationToken.delete({
      where: { token },
    })

    // Redirect to login with success message
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    return Response.redirect(`${baseUrl}/login?verified=true`)
    
  } catch (error) {
    console.error("Verification error:", error)
    return new Response("Something went wrong", { status: 500 })
  }
}
