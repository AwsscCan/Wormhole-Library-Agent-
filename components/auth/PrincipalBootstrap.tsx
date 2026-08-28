"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function PrincipalBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(false);
    fetch("/api/v3/principal", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("principal bootstrap failed");
        if (active) setReady(true);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);

  if (ready) return children;
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-5">
      <div className="w-full rounded-md border border-ink-border bg-ink-panel p-5 text-center">
        <p role="status" className="text-sm text-steel">
          {error ? "暂时无法准备私有工作区。" : "正在准备私有工作区…"}
        </p>
        {error && <Button className="mt-4" onClick={() => setAttempt((value) => value + 1)}>重试</Button>}
      </div>
    </main>
  );
}
