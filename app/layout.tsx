// app/layout.tsx
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  metadataBase: new URL("https://ellie-web-ochre.vercel.app"),
  title: "Ellie — Your warm, playful AI companion",
  description:
    "Ellie remembers what you share, adapts to your mood, and talks like a real person. Chat or call anytime.",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "Ellie — Your warm, playful AI companion",
    description:
      "Ellie remembers what you share, adapts to your mood, and talks like a real person.",
    url: "/",
    siteName: "Ellie",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Ellie",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ellie — Your warm, playful AI companion",
    description:
      "Ellie remembers what you share, adapts to your mood, and talks like a real person.",
    images: ["/og.png"],
  },
  themeColor: "#0b0b10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[radial-gradient(1200px_800px_at_10%_-10%,#1b1b28_0%,#0b0b10_40%,#07070b_100%)] text-white antialiased selection:bg-white/20">
        {children}
        {/* Toast area for global toasts */}
        <div id="toast-root" className="fixed top-4 right-4 z-50 space-y-2" />
      </body>
    </html>
  );
}
