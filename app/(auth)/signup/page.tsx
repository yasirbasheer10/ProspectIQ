"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2 } from "lucide-react"

export default function SignupPage() {
  const router = useRouter()
  
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isLinkedInLoading, setIsLinkedInLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Something went wrong")
        setIsLoading(false)
      } else {
        setSuccess(true)
        setIsLoading(false)
      }
    } catch (err) {
      setError("Something went wrong. Please try again.")
      setIsLoading(false)
    }
  }

  const handleOAuthLogin = async (provider: "google" | "linkedin") => {
    // Show coming soon message for now
    setError(`${provider === 'google' ? 'Google' : 'LinkedIn'} signup is coming soon!`)
  }

  if (success) {
    return (
      <div className="w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="h-16 w-16 bg-[#e6f4ea] text-[#137333] rounded-full flex items-center justify-center">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-[#1B212D] tracking-[-0.02em] mb-3">
          Check your email
        </h1>
        <p className="text-[15px] text-[#747780] mb-8 leading-relaxed">
          We&apos;ve sent a verification link to <strong>{email}</strong>. Please click the link to verify your account and sign in.
        </p>
        <Link 
          href="/login"
          className="inline-flex justify-center items-center h-11 px-6 rounded-[10px] bg-[#0071E3] text-white text-[15px] font-medium hover:bg-[#005fb8] transition-colors"
        >
          Return to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-[#1B212D] tracking-[-0.02em] mb-2">
          Create your account
        </h1>
        <p className="text-[15px] text-[#747780]">
          Join ProspectIQ to find companies worth talking to.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium text-center">
          {error}
        </div>
      )}

      <div className="space-y-3 mb-6">
        <button
          onClick={() => handleOAuthLogin("google")}
          disabled={isGoogleLoading || isLinkedInLoading || isLoading}
          className="w-full flex items-center justify-center gap-3 h-12 rounded-[12px] border border-[#D9DEEA] bg-white transition-all text-[15px] font-medium text-[#1B212D] opacity-60 blur-[1px] hover:blur-none hover:opacity-100 disabled:opacity-50"
        >
          {isGoogleLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#747780]" />
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          )}
          Sign up with Google
        </button>

        <button
          onClick={() => handleOAuthLogin("linkedin")}
          disabled={isGoogleLoading || isLinkedInLoading || isLoading}
          className="w-full flex items-center justify-center gap-3 h-12 rounded-[12px] border border-[#D9DEEA] bg-white transition-all text-[15px] font-medium text-[#1B212D] opacity-60 blur-[1px] hover:blur-none hover:opacity-100 disabled:opacity-50"
        >
          {isLinkedInLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#747780]" />
          ) : (
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#0A66C2">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          )}
          Sign up with LinkedIn
        </button>
      </div>

      <div className="relative flex items-center py-2 mb-6">
        <div className="flex-grow border-t border-[#D9DEEA]"></div>
        <span className="flex-shrink-0 mx-4 text-[#A7ABAF] text-[13px] font-medium tracking-wide uppercase">OR</span>
        <div className="flex-grow border-t border-[#D9DEEA]"></div>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[13px] font-medium text-[#1B212D] mb-1.5">First name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full h-11 px-3 rounded-[10px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[14px]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#1B212D] mb-1.5">Last name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full h-11 px-3 rounded-[10px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[14px]"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-[13px] font-medium text-[#1B212D] mb-1.5">Work email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-11 px-4 rounded-[10px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[14px]"
          />
        </div>
        
        <div>
          <label className="block text-[13px] font-medium text-[#1B212D] mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-11 px-4 rounded-[10px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[14px]"
            placeholder="At least 8 characters, 1 uppercase, 1 number"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-[#1B212D] mb-1.5">Confirm password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full h-11 px-4 rounded-[10px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[14px]"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || isGoogleLoading || isLinkedInLoading}
          className="w-full h-12 mt-4 flex justify-center items-center rounded-[12px] bg-[#0071E3] text-white text-[15px] font-semibold hover:bg-[#005fb8] transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Create account"}
        </button>
      </form>

      <div className="mt-8 text-center text-[14px] text-[#747780]">
        Already have an account?{" "}
        <Link href="/login" className="text-[#0071E3] font-medium hover:underline">
          Sign in
        </Link>
      </div>
    </div>
  )
}
