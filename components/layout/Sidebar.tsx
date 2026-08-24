"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Telescope,
  Building2,
  Lightbulb,
  FileSearch,
  Users,
  Send,
  GitBranch,
  MessageSquare,
  BarChart3,
  Bot,
  Settings,
  HelpCircle,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Command Center", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agent Fleet", href: "/agents", icon: GitBranch },
  { label: "Discover", href: "/discovery", icon: Telescope },
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Opportunities", href: "/opportunities", icon: Lightbulb },
  { label: "Growth Audits", href: "/audits", icon: FileSearch },
  { label: "Contacts", href: "/contacts", icon: Users },
  { label: "Outreach", href: "/outreach", icon: Send },
  { label: "Conversations", href: "/conversations", icon: MessageSquare },
  { label: "Analytics", href: "/analytics", icon: BarChart3 },
  { label: "Agent Activity", href: "/agent-activity", icon: Bot },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[260px] flex-col border-r border-[#E5E5EA] bg-white shrink-0">
      {/* Header / Logo */}
      <div className="px-6 pt-6 pb-2">
        <div className="mb-4 flex items-center">
          <Image 
            src="/landing-page/assets/prospectiq-logo.png" 
            alt="ProspectIQ Logo" 
            width={110}
            height={24}
            className="w-[110px] h-auto object-contain ml-3"
            priority
          />
        </div>
      </div>

      {/* Primary Action */}
      <div className="px-5 mb-6">
        <Link href="/deploy" className="w-full flex items-center justify-center gap-2 bg-[#0071E3] hover:bg-[#0077ED] text-white rounded-lg py-2.5 px-4 font-medium text-[13px] transition-colors shadow-sm">
          <Plus size={16} />
          Deploy New Agent
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
                  isActive
                    ? "bg-[#EBF3FF] text-[#0071E3]"
                    : "text-[#4B5563] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
                )}
              >
                <Icon
                  size={18}
                  className={isActive ? "text-[#0071E3]" : "text-[#86868B]"}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-[#E5E5EA]">
        <div className="flex flex-col gap-0.5">
          <Link href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#4B5563] hover:bg-[#F5F5F7] hover:text-[#1D1D1F] transition-colors">
            <Settings size={18} className="text-[#86868B]" strokeWidth={2} />
            Settings
          </Link>
          <button className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#4B5563] hover:bg-[#F5F5F7] hover:text-[#1D1D1F] transition-colors text-left">
            <HelpCircle size={18} className="text-[#86868B]" strokeWidth={2} />
            Help
          </button>
        </div>
      </div>
    </aside>
  );
}
