"use client"

import { useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Loader2 } from "lucide-react"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-[#1B212D] mb-3">Invalid Link</h1>
        <p className="text-[15px] text-[#747780] mb-6">
          This password reset link is invalid or has expired.
        </p>
        <Link 
          href="/forgot-password"
          className="inline-flex justify-center items-center h-11 px-6 rounded-[10px] bg-[#0071E3] text-white text-[15px] font-medium hover:bg-[#005fb8] transition-colors"
        >
          Request new link
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
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
          Password updated
        </h1>
        <p className="text-[15px] text-[#747780] mb-8 leading-relaxed">
          Your password has been successfully reset. You can now sign in with your new password.
        </p>
        <Link 
          href="/login"
          className="inline-flex justify-center items-center h-11 px-6 rounded-[10px] bg-[#0071E3] text-white text-[15px] font-medium hover:bg-[#005fb8] transition-colors"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold text-[#1B212D] tracking-[-0.02em] mb-2">
          Create new password
        </h1>
        <p className="text-[15px] text-[#747780]">
          Your new password must be different from previous used passwords.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-[#1B212D] mb-1.5">New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-11 px-4 rounded-[10px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[15px]"
            placeholder="At least 8 characters, 1 uppercase, 1 number"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-[#1B212D] mb-1.5">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full h-11 px-4 rounded-[10px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[15px]"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full h-12 mt-2 flex justify-center items-center rounded-[12px] bg-[#0071E3] text-white text-[15px] font-semibold hover:bg-[#005fb8] transition-colors disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Reset password"}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-[#0071E3]" /></div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
