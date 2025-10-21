// Server Component (no "use client" here)
import dynamic from "next/dynamic";

// Render the client component only on the client
const CallClient = dynamic(() => import("./CallClient"), { ssr: false });

export default function CallPage() {
  return <CallClient />;
}
