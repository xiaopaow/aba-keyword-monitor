import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "../components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeepWhale Data - ABA Weekly",
  description: "Amazon ABA search term ranking and member console.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
