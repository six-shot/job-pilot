import type { ReactNode } from "react";
import { SOURCE_LABEL, TIER_LABEL } from "@/lib/format";
import type { Source, Tier } from "@/lib/types";

const TIER_STYLE: Record<Tier, string> = {
  great: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  good: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  stretch: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

export function Pill({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

export function TierPill({ tier }: { tier: Tier }) {
  return <Pill className={TIER_STYLE[tier]}>{TIER_LABEL[tier]}</Pill>;
}

export function SourcePill({ source }: { source: Source }) {
  return (
    <Pill className="border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
      {SOURCE_LABEL[source]}
    </Pill>
  );
}

export const buttonPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

export const buttonSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export const card =
  "rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
