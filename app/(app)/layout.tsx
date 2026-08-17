import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      redirect("/login")
    }

    const user = session.user as any
    
    if (user && user.onboardingComplete === false) {
      redirect("/onboarding")
    }

    return (
      <div className="flex h-screen overflow-hidden bg-[#F5F5F7]">
        <div className="hidden md:flex shrink-0">
          <Sidebar />
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          <MobileNav />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    );
  } catch (error: any) {
    return (
      <div className="p-10 text-red-500 font-mono bg-white h-screen">
        <h1 className="text-2xl font-bold mb-4">Fatal Layout Error on Vercel</h1>
        <p className="font-bold">{error.message}</p>
        <pre className="mt-4 whitespace-pre-wrap text-sm">{error.stack}</pre>
        <p className="mt-8 text-black">If this says "Please define a secret in production", you need to add NEXTAUTH_SECRET to your Vercel Environment Variables.</p>
      </div>
    );
  }
}
