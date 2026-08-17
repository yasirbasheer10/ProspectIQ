import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F5F7] p-8 text-center">
      <h1 className="mb-2 text-6xl font-bold text-[#1D1D1F]">404</h1>
      <h2 className="mb-4 text-2xl font-semibold text-[#1D1D1F]">Page Not Found</h2>
      <p className="mb-8 max-w-md text-[#4B5563]">
        We couldn&apos;t find the page you&apos;re looking for. It might have been moved or doesn&apos;t exist.
      </p>
      <Link href="/dashboard">
        <Button variant="primary">Return to Dashboard</Button>
      </Link>
    </div>
  );
}
