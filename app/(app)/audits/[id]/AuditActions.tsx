"use client";

import { useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * The share bar above an audit.
 *
 * Its own client component so the document itself stays a server component —
 * this is the only interactive part of the page, and it is three buttons.
 *
 * Print rather than a PDF export on purpose: the browser's own print-to-PDF
 * already produces a clean file from the `print:` styles in `AuditDocument`, and
 * a server-side PDF renderer would be a headless-Chrome dependency on Vercel
 * earning nothing the agency cannot already do with Cmd-P.
 */
export function AuditActions({ shareToken }: { shareToken: string }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/a/${shareToken}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  };

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-[#E5E5EA] bg-white p-4 sm:flex-row sm:items-center print:hidden">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-[#1D1D1F]">Share link</p>
        <p className="mt-0.5 truncate font-mono text-[12px] text-[#86868B]">
          {shareUrl || `/a/${shareToken}`}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-[#86868B]">
          Anyone with this link can read the audit — no sign-in. Deleting the audit
          revokes it.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" icon={Printer} onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="primary" size="sm" icon={copied ? Check : Copy} onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
