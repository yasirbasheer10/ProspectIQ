import { NextRequest } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    }

    const { offer, targetAudience, countries } = await req.json()

    if (!offer || !targetAudience || !countries) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 })
    }

    const userId = session.user.id

    // Check if user already completed onboarding
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (user?.onboardingComplete) {
      return new Response(JSON.stringify({ success: true, message: "Already onboarded" }), { status: 200 })
    }

    // Wrap everything in a transaction to ensure data integrity
    await prisma.$transaction(async (tx) => {
      // 1. Create a workspace based on the user's name
      const workspaceName = `${user?.name || 'User'}'s Workspace`
      const baseSlug = workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      
      // Ensure unique slug
      let slug = baseSlug
      let counter = 1
      while (await tx.workspace.findUnique({ where: { slug } })) {
        slug = `${baseSlug}-${counter}`
        counter++
      }

      const workspace = await tx.workspace.create({
        data: {
          name: workspaceName,
          slug,
          members: {
            create: {
              userId,
              role: "owner"
            }
          }
        }
      })

      // 2. Create the Offer based on their input
      await tx.offer.create({
        data: {
          name: "Main Offer",
          description: offer,
          workspaceId: workspace.id,
        }
      })

      // 3. Create the ICP based on their input
      await tx.iCP.create({
        data: {
          name: "Primary Audience",
          description: targetAudience,
          geographies: countries.split(',').map((c: string) => c.trim()),
          workspaceId: workspace.id,
        }
      })

      // 4. Update the user
      await tx.user.update({
        where: { id: userId },
        data: { onboardingComplete: true }
      })
    })

    return new Response(JSON.stringify({ success: true }), { status: 200 })

  } catch (error) {
    console.error("Onboarding error:", error)
    return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500 })
  }
}
