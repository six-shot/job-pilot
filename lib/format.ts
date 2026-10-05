import type { Job, Source, TailoredResume, Tier } from "./types";

export function formatPay(job: Pick<Job, "payMin" | "payMax" | "payUnit">) {
  if (job.payMin == null && job.payMax == null) return "Pay not listed";
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  const min = job.payMin ?? job.payMax!;
  const max = job.payMax ?? job.payMin!;
  const range = min === max ? money(min) : `${money(min)}–${money(max)}`;
  return job.payUnit ? `${range}/${job.payUnit}` : range;
}

/** Whole days since the timestamp, or null when it is missing or unparseable. */
export function daysSince(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return Number.isNaN(days) ? null : days;
}

export function timeAgo(iso: string | null) {
  const days = daysSince(iso);
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/** The most recent sign of life on a listing: its last update if it has one, else its post date. */
export function lastActive(job: Pick<Job, "postedAt" | "updatedAt">) {
  return job.updatedAt && job.updatedAt > (job.postedAt ?? "") ? job.updatedAt : job.postedAt;
}

export function activityLabel(job: Pick<Job, "postedAt" | "updatedAt">) {
  const when = lastActive(job);
  if (!when) return "";
  return `${when === job.postedAt ? "posted" : "updated"} ${timeAgo(when)}`;
}

export const TIER_LABEL: Record<Tier, string> = {
  great: "Great fit",
  good: "Good fit",
  stretch: "Stretch",
};

export const SOURCE_LABEL: Record<Source, string> = {
  mercor: "Mercor",
  micro1: "micro1",
  handshake: "Handshake AI",
  g2i: "G2i",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  workingnomads: "Working Nomads",
  weworkremotely: "We Work Remotely",
  remotive: "Remotive",
};

/** Plain-text version for pasting into application forms. */
export function resumeToText(r: TailoredResume) {
  const out: string[] = [r.name, r.headline, r.contact.join(" • "), "", "SUMMARY", r.summary];
  if (r.experience.length) {
    out.push("", "PROFESSIONAL EXPERIENCE");
    for (const e of r.experience) {
      out.push("", `${e.company} — ${e.role}`, [e.dates, e.location].filter(Boolean).join(" | "));
      out.push(...e.bullets.map((b) => `- ${b}`));
    }
  }
  if (r.skills.length) {
    out.push("", "TECHNICAL SKILLS");
    out.push(...r.skills.map((s) => `- ${s.category}: ${s.items.join(", ")}`));
  }
  if (r.openSource.length) {
    out.push("", "OPEN SOURCE CONTRIBUTIONS");
    for (const o of r.openSource) {
      out.push("", [o.project, o.dates].filter(Boolean).join(" | "), ...o.links);
      out.push(...o.bullets.map((b) => `- ${b}`));
    }
  }
  if (r.education.length) {
    out.push("", "EDUCATION");
    for (const e of r.education) {
      out.push("", [e.title, e.institution].filter(Boolean).join(" | "), e.dates);
      out.push(...e.details.map((d) => `- ${d}`));
    }
  }
  if (r.certifications.length) {
    out.push("", "CERTIFICATIONS", ...r.certifications.map((c) => `- ${c}`));
  }
  if (r.languages.length) {
    out.push("", "LANGUAGES", ...r.languages.map((l) => `- ${l}`));
  }
  return out.join("\n");
}
