import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Role Chat",
  description: "Chat with AI characters",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
