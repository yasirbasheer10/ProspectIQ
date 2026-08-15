"use client"

import { useEffect, useState } from "react"

export function Greeting({ userName }: { userName: string }) {
  const [greeting, setGreeting] = useState("Good morning")

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 12) {
      setGreeting("Good morning")
    } else if (hour >= 12 && hour < 17) {
      setGreeting("Good afternoon")
    } else {
      setGreeting("Good evening")
    }
  }, [])

  return (
    <h1 className="text-[38px] font-semibold tracking-tight text-[#1D1D1F] mb-2 leading-tight">
      {greeting}, {userName}.
    </h1>
  )
}
