"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
          If an account exists for <strong>{email}</strong>, we&apos;ve sent instructions to reset your password.
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
          Reset password
        </h1>
        <p className="text-[15px] text-[#747780]">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-[#1B212D] mb-1.5">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-11 px-4 rounded-[10px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[15px]"
            placeholder="you@company.com"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 mt-2 flex justify-center items-center rounded-[12px] bg-[#0071E3] text-white text-[15px] font-semibold hover:bg-[#005fb8] transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Send reset link"}
        </button>
      </form>

      <div className="mt-8 text-center text-[14px]">
        <Link href="/login" className="text-[#0071E3] font-medium hover:underline flex items-center justify-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
