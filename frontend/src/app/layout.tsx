import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Orchestration Dashboard",
  description: "Real-time monitoring dashboard for Claude Code sessions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
