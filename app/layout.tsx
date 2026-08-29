import type { Metadata } from "next";
import { TopNav } from "@/components/TopNav";
import { PrincipalBootstrap } from "@/components/auth/PrincipalBootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wormhole Library — 知识导航台",
  description:
    "A librarian that knows when to lead you to a shelf, paper, or person you never knew to search for.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" data-theme="cockpit" suppressHydrationWarning>
      <body className="min-h-screen font-sans">
        <PrincipalBootstrap>
          <TopNav />
          <main className="mx-auto max-w-[1400px] px-5 pb-16 pt-6">{children}</main>
        </PrincipalBootstrap>
      </body>
    </html>
  );
}
