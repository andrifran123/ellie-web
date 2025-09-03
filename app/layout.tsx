// app/layout.tsx
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "./(providers)/toast";

export const viewport = {
  themeColor: "#0b0b10",
};

export const metadata = {
  metadataBase: new URL("https://ellie-web-ochre.vercel.app"),
  title: "Ellie — Your warm, playful AI companion",
  description:
    "Ellie remembers what you share, adapts to your mood, and talks like a real person. Chat or call anytime.",
  icons: {
    icon: "/favicon.svg",
  },

import "./globals.css";
import AuthBoot from "./(providers)/auth-boot";

export const metadata = {
  title: "Ellie",
  description: "Ellie — warm, playful, mood-aware companion",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Runs once, redirects unpaid logged-in users to /pricing */}
        <AuthBoot />
        {children}
      </body>
    </html>
  );
}


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
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[radial-gradient(1200px_800px_at_10%_-10%,#1b1b28_0%,#0b0b10_40%,#07070b_100%)] text-white antialiased selection:bg-white/20">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
