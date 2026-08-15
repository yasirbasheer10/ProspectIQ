"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Loader2 } from "lucide-react"

export default function OnboardingPage() {
  const router = useRouter()
  const { data: session, update } = useSession()

  const [step, setStep] = useState(1)
  const [offer, setOffer] = useState("")
  const [targetAudience, setTargetAudience] = useState("")
  const [countries, setCountries] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer, targetAudience, countries }),
      })

      if (!res.ok) {
        throw new Error("Failed to save onboarding data")
      }

      // Update NextAuth session to reflect onboarding is complete
      await update({ onboardingComplete: true })
      
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      setError("Something went wrong. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB] flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-[500px] bg-white rounded-[22px] shadow-[0_20px_55px_rgba(18,32,65,0.08)] border border-[#D9DEEA] p-8 md:p-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-[#1B212D] tracking-[-0.02em] mb-2">
            Welcome to ProspectIQ
          </h1>
          <p className="text-[15px] text-[#747780]">
            Let's configure your AI agent.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm font-medium text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <label className="block text-[14px] font-medium text-[#1B212D] mb-2">
                What product or service do you sell?
              </label>
              <textarea
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
                required
                rows={3}
                className="w-full p-4 rounded-[12px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[15px] resize-none"
                placeholder="e.g. We sell enterprise B2B SaaS for HR teams to manage payroll..."
              />
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!offer.trim()}
                className="w-full h-12 mt-6 flex justify-center items-center rounded-[12px] bg-[#0071E3] text-white text-[15px] font-semibold hover:bg-[#005fb8] transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <label className="block text-[14px] font-medium text-[#1B212D] mb-2">
                Who is your target audience?
              </label>
              <textarea
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                required
                rows={3}
                className="w-full p-4 rounded-[12px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[15px] resize-none"
                placeholder="e.g. VP of HR, Chief People Officer at companies with 500+ employees"
              />
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-1/3 h-12 flex justify-center items-center rounded-[12px] border border-[#D9DEEA] bg-white text-[#1B212D] text-[15px] font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={!targetAudience.trim()}
                  className="w-2/3 h-12 flex justify-center items-center rounded-[12px] bg-[#0071E3] text-white text-[15px] font-semibold hover:bg-[#005fb8] transition-colors disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <label className="block text-[14px] font-medium text-[#1B212D] mb-2">
                Which countries do you target?
              </label>
              <input
                type="text"
                value={countries}
                onChange={(e) => setCountries(e.target.value)}
                required
                className="w-full h-12 px-4 rounded-[12px] border border-[#D9DEEA] bg-white outline-none focus:border-[#0071E3] focus:ring-1 focus:ring-[#0071E3] transition-all text-[15px]"
                placeholder="e.g. United States, United Kingdom, Canada"
              />
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-1/3 h-12 flex justify-center items-center rounded-[12px] border border-[#D9DEEA] bg-white text-[#1B212D] text-[15px] font-medium hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={!countries.trim() || isLoading}
                  className="w-2/3 h-12 flex justify-center items-center rounded-[12px] bg-[#0071E3] text-white text-[15px] font-semibold hover:bg-[#005fb8] transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Complete Setup"}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
