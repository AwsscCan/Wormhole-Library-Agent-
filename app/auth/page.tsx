"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, UserRound } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Principal = { id: string; mode: "member" | "guest" };

export default function AuthPage() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/v3/principal", { cache: "no-store" }).then(async (response) => {
      if (response.ok) setPrincipal((await response.json()).principal as Principal);
    }).catch(() => undefined);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) { setStatus("密码至少需要 10 个字符。"); return; }
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/auth/${mode}/email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(mode === "sign-up" ? { name: name.trim() || undefined } : {}), email: email.trim(), password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message ?? data.error?.message ?? "认证未完成，请检查邮箱和密码。");
      setPassword("");
      setStatus(mode === "sign-up" ? "注册成功，已登录。" : "登录成功。");
      window.location.href = "/research";
    } catch (error) { setStatus(error instanceof Error ? error.message : "认证未完成，请稍后重试。"); }
    finally { setBusy(false); }
  }

  return <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-[1fr_0.8fr]">
    <Panel><PanelHeader icon={KeyRound} title="account access · 账户入口" accent="cyan" /><PanelBody className="space-y-4">
      <div><h1 className="font-display text-xl text-ivory">进入你的研究工作区</h1><p className="mt-1 text-sm leading-relaxed text-steel">登录后研究会话、笔记、证据和写作检查点会按账户持久保存。本期不需要邮箱验证。</p></div>
      <div className="grid grid-cols-2 gap-2"><Button variant={mode === "sign-in" ? "solid" : "ghost"} onClick={() => setMode("sign-in")}>登录</Button><Button variant={mode === "sign-up" ? "solid" : "ghost"} onClick={() => setMode("sign-up")}>注册</Button></div>
      <form className="space-y-3" onSubmit={submit}>
        {mode === "sign-up" && <label className="block space-y-1.5 text-xs text-steel">显示名称<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="你的名字（可选）" /></label>}
        <label className="block space-y-1.5 text-xs text-steel">邮箱<Input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
        <label className="block space-y-1.5 text-xs text-steel">密码<Input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 10 个字符" /></label>
        <Button type="submit" variant="solid" className="w-full" loading={busy}><ArrowRight className="h-4 w-4" />{mode === "sign-in" ? "进入工作区" : "创建账户并进入"}</Button>
      </form>
      {status && <p role="status" className="rounded-md border border-copper/40 bg-copper-faint/30 p-3 text-sm text-copper">{status}</p>}
    </PanelBody></Panel>
    <Panel><PanelHeader icon={UserRound} title="guest workspace · 访客工作区" accent="copper" /><PanelBody className="space-y-3 text-sm text-steel">
      <p>不登录也可以先体验搜索、星图、虫洞和私有研究会话。访客身份通过签名 Cookie 保存，刷新和重启服务后仍能找回会话。</p>
      {principal?.mode === "guest" && <p className="rounded-md border border-pulse/30 bg-pulse-faint/20 p-3 text-pulse">当前正在使用访客身份。</p>}
      <Link href="/research" className="inline-flex items-center gap-1 text-xs text-pulse hover:underline">打开研究工作区 <ArrowRight className="h-3 w-3" /></Link>
    </PanelBody></Panel>
  </div>;
}
