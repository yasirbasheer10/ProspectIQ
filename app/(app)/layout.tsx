import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/login")
  }

  const user = session.user as any
  
  // If the user hasn't completed onboarding and we are NOT on the onboarding page
  // Note: we'll handle this purely in the middleware or here? 
  // Let's redirect them to the onboarding page. Since this layout only wraps /(app), 
  // we can create an onboarding page at /onboarding outside of /(app)
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
}
