"use client";

import Link from "next/link";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type Principal = { id: string; mode: "member" | "guest" };

export function AuthStatus() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/v3/principal", { cache: "no-store" });
    if (response.ok) setPrincipal((await response.json()).principal as Principal);
  }

  useEffect(() => { void load().catch(() => undefined); }, []);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      window.location.href = "/";
    } finally { setBusy(false); }
  }

  if (!principal) return <Link href="/auth" className="flex items-center gap-1.5 rounded-md border border-pulse/40 px-3 py-1.5 text-xs text-pulse hover:bg-pulse/10"><LogIn className="h-3.5 w-3.5" />登录</Link>;
  if (principal.mode === "guest") return <Link href="/auth" className="flex items-center gap-1.5 rounded-md border border-ink-border px-3 py-1.5 text-xs text-steel hover:border-pulse/50 hover:text-pulse"><UserRound className="h-3.5 w-3.5" />访客身份</Link>;
  return <button type="button" disabled={busy} onClick={signOut} title="退出登录" className="flex items-center gap-1.5 rounded-md border border-ink-border px-3 py-1.5 text-xs text-steel hover:border-rosewood/50 hover:text-rosewood disabled:opacity-50"><UserRound className="h-3.5 w-3.5 text-pulse" />账户 · {principal.id.slice(0, 8)}<LogOut className="ml-1 h-3 w-3" /></button>;
}
