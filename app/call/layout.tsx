// app/call/layout.tsx  (Server Component by default)

// Tell Next not to prerender or cache this segment.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "default-no-store";
export const runtime = "nodejs";

export default function CallLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No UI wrapper needed; just pass children through.
  return <>{children}</>;
}
