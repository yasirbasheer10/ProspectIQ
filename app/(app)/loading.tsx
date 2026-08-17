import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-white">
      <Loader2 className="h-8 w-8 animate-spin text-[#0071E3]" />
      <p className="mt-4 text-[14px] font-medium text-[#86868B]">Loading...</p>
    </div>
  );
}
