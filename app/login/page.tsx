// app/login/page.tsx
import { Suspense } from "react";
import LoginInner from "./login-inner";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-white p-6">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
