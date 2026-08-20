import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wormhole Library Agent",
  description: "A librarian that knows when to lead you somewhere you never knew to search for.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <nav className="topnav">
          <Link href="/" className="brand">🌀 Wormhole Library</Link>
          <div className="navlinks">
            <Link href="/">检索</Link>
            <Link href="/memory">我的记忆</Link>
            <Link href="/living-library">Living Library</Link>
          </div>
          <span className="demo-badge" title="当前使用演示馆藏数据">Demo catalog</span>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
