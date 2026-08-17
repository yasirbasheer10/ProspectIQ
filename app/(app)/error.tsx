"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#F5F5F7] p-8 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-sm border border-[#E5E5EA]">
        <AlertCircle size={32} className="text-[#FF3B30]" />
      </div>
      <h2 className="mb-2 text-2xl font-semibold text-[#1D1D1F]">Something went wrong!</h2>
      <p className="mb-8 max-w-md text-[#4B5563]">
        An unexpected error occurred while loading this page. Our team has been notified.
      </p>
      <div className="flex gap-4">
        <Button onClick={() => window.location.reload()} variant="secondary">
          Go Home
        </Button>
        <Button onClick={() => reset()} variant="primary" icon={RotateCw}>
          Try again
        </Button>
      </div>
    </div>
  );
}
