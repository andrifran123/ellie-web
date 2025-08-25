// app/pricing/page.tsx
import { Suspense } from "react";
import PricingInner from "./pricing-inner";

export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <Suspense fallback={<div className="text-white p-6">Loading…</div>}>
      <PricingInner />
    </Suspense>
  );
}
