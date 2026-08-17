import { Inter } from "next/font/google"
import "@/app/globals.css"
import Image from "next/image"
import Link from "next/link"

const inter = Inter({ subsets: ["latin"] })

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`min-h-screen flex flex-col bg-[#F4F6FB] ${inter.className}`}>
      {/* Simple Header */}
      <header className="w-full flex justify-center py-8">
        <Link href="/">
          <Image 
            src="/landing-page/assets/prospectiq-logo.png" 
            alt="ProspectIQ" 
            width={160}
            height={32}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>
      </header>

      {/* Main Content (Centered Card) */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] bg-white rounded-[22px] shadow-[0_20px_55px_rgba(18,32,65,0.08)] border border-[#D9DEEA] p-8">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 text-center text-[#747780] text-[13px]">
        <p>© {new Date().getFullYear()} ProspectIQ. All rights reserved.</p>
      </footer>
    </div>
  )
}
