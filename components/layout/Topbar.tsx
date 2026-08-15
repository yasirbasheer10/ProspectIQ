"use client";

import Link from "next/link";
import { Bell, User } from "lucide-react";

interface TopbarProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="flex h-[72px] items-center justify-between border-b border-[#E5E5EA] bg-white px-8 shrink-0">
      {/* Left: page title */}
      <div className="flex items-baseline gap-4">
        <h1 className="text-xl font-medium text-[#1D1D1F] tracking-tight">{title}</h1>
        {subtitle && (
          <span className="text-[13px] text-[#86868B]">{subtitle}</span>
        )}
      </div>

      {/* Right: actions + notifications */}
      <div className="flex items-center gap-4">
        {/* Custom actions */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        {/* Status Pill */}
        <div className="flex items-center gap-2 rounded-full border border-[#E5E5EA] bg-white px-3 py-1.5 shadow-sm">
          <div className="h-1.5 w-1.5 rounded-full bg-[#0071E3] pulse-active" />
          <span className="text-[11px] font-medium text-[#1D1D1F]">Active</span>
        </div>

        {/* Notifications */}
        <button className="flex h-8 w-8 items-center justify-center text-[#4B5563] hover:text-[#1D1D1F] transition-colors">
          <Bell size={20} strokeWidth={2} />
        </button>

        {/* User avatar */}
        <Link href="/profile" className="flex h-8 w-8 items-center justify-center text-[#4B5563] hover:text-[#1D1D1F] transition-colors">
          <User size={20} strokeWidth={2} />
        </Link>
      </div>
    </header>
  );
}
