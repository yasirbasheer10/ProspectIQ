"use client"

import { useSyncExternalStore } from "react"

function greetingForHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 17) return "Good afternoon"
  return "Good evening"
}

/** Nothing to subscribe to — the greeting is read once, at hydration. */
const noop = () => () => {}

export function Greeting({ userName }: { userName: string }) {
  // The time of day is the browser's, not the server's, so this value can only
  // be known after hydration. `useSyncExternalStore` is the React API for
  // exactly that split: the third argument is what the server renders, the
  // second is what the client swaps in. Doing it with `useState` + `useEffect`
  // means a setState inside an effect, which triggers a second render pass.
  //
  // Both snapshots return one of four constant strings, so they're
  // referentially stable and can't loop.
  const greeting = useSyncExternalStore(noop, () => greetingForHour(new Date().getHours()), () => "Hello")

  return (
    <h1 className="text-[38px] font-semibold tracking-tight text-[#1D1D1F] mb-2 leading-tight">
      {greeting}, {userName}.
    </h1>
  )
}
