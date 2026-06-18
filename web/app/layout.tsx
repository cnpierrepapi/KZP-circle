import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Rewards",
  description: "USDC escrow that pays an AI agent for cryptographically-attested work",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
