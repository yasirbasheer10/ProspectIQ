"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, Telescope, Building2, Lightbulb, FileSearch, Users, Send, GitBranch, MessageSquare, BarChart3, Bot, Target } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Command Center", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agent Fleet", href: "/agents", icon: GitBranch },
  { label: "Discover", href: "/discovery", icon: Telescope },
  { label: "Lookalike Search", href: "/lookalike", icon: Target },
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Opportunities", href: "/opportunities", icon: Lightbulb },
  { label: "Growth Audits", href: "/audits", icon: FileSearch },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Outreach", href: "/outreach", icon: Send },
  { label: "Conversations", href: "/conversations", icon: MessageSquare },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Agent Activity", href: "/agent-activity", icon: Bot },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden">
      {/* Top Bar */}
      <div className="flex h-14 items-center justify-between bg-white px-4 border-b border-[#E5E5EA]">
        <Image 
          src="/landing-page/assets/prospectiq-logo.png" 
          alt="ProspectIQ Logo" 
          width={120}
          height={24}
          className="h-6 w-auto object-contain" 
        />
        <button onClick={() => setIsOpen(!isOpen)} className="p-2 -mr-2 text-gray-600 hover:text-black">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Full Screen Menu */}
      {isOpen && (
        <div className="fixed inset-0 top-14 z-50 bg-white overflow-y-auto pb-20">
          <nav className="p-4 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-4 py-3.5 text-base font-medium transition-colors",
                    isActive ? "bg-[#EBF3FF] text-[#0071E3]" : "text-[#4B5563] hover:bg-[#F5F5F7]"
                  )}
                >
                  <Icon size={20} className={isActive ? "text-[#0071E3]" : "text-[#86868B]"} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
