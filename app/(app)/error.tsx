"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCw, Home } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The only place this goes. There is no error-reporting service wired up,
    // which is why the copy below no longer claims anyone was notified.
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#F5F5F7] p-8 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm border border-[#E5E5EA]">
        <AlertCircle size={32} className="text-[#FF3B30]" />
      </div>
      <h2 className="mb-2 text-2xl font-semibold text-[#1D1D1F]">Something went wrong</h2>
      <p className="mb-2 max-w-md text-[#4B5563]">
        This page failed to load. Trying again often works — the cause is usually a
        request that timed out or a background run that is still finishing.
      </p>
      {/* Next replaces a server error's message with a generic string in
          production and gives you this digest instead. It is the only way to
          match what you see here to the entry in the Vercel function logs, so
          it is worth showing rather than swallowing. */}
      {error.digest && (
        <p className="mb-8 font-mono text-[12px] text-[#86868B]">
          Error reference: {error.digest}
        </p>
      )}
      {!error.digest && (
        <p className="mb-8 max-w-md text-[13px] text-[#86868B]">
          Details are in the browser console.
        </p>
      )}
      <div className="flex gap-4">
        {/* Was `window.location.reload()` — a button labelled "Go Home" that
            reloaded the failing page, so it looked broken twice. */}
        <Link href="/dashboard">
          <Button variant="secondary" icon={Home}>
            Go Home
          </Button>
        </Link>
        <Button onClick={() => reset()} variant="primary" icon={RotateCw}>
          Try again
        </Button>
      </div>
    </div>
  );
}
