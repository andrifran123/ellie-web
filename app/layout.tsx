// app/layout.tsx
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Ellie",
  description: "Your warm, playful AI companion",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[radial-gradient(1200px_800px_at_10%_-10%,#1b1b28_0%,#0b0b10_40%,#07070b_100%)] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
