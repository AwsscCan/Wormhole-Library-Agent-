import { cn } from "@/lib/utils";

type Tone = "cyan" | "copper" | "steel" | "rose" | "ivory";

const TONES: Record<Tone, string> = {
  cyan: "border-pulse/35 bg-pulse-faint/40 text-pulse",
  copper: "border-copper/35 bg-copper-faint/40 text-copper",
  steel: "border-ink-edge/60 bg-ink-raise text-steel",
  rose: "border-rosewood/35 bg-rosewood/10 text-rosewood",
  ivory: "border-ivory/25 bg-ivory/5 text-ivory",
};

export function Badge({
  tone = "steel",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md border px-2 py-0.5 text-[11px] leading-5",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
