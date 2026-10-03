"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { JobListSkeleton } from "@/components/Skeleton";
import { Pill, SourcePill, TierPill, buttonPrimary, buttonSecondary, card } from "@/components/ui";
import { SOURCE_LABEL, activityLabel, daysSince, formatPay, lastActive } from "@/lib/format";
import { useUser } from "@/components/UserContext";
import { getAllTailored, getApplied, getResume, importLocalFilesOnce } from "@/lib/browser-store";
import type { ListedJob } from "@/lib/jobs";
import { resumeSkills, scoreJob } from "@/lib/relevance";
import { SOURCES, type ScoredJob, type Source } from "@/lib/types";

interface JobsResponse {
  jobs: ListedJob[];
  errors: string[];
  fetchedAt: number;
  totalListings: number;
}

interface MyData {
  resume: string;
  tailored: Set<string>;
  applied: Set<string>;
}

type SourceFilter = "all" | Source;

const AGE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
  { value: 60, label: "Last 60 days" },
  { value: 0, label: "Any time" },
];

const NEW_WITHIN_DAYS = 7;

const selectClass =
  "rounded-lg border border-zinc-300 bg-transparent px-2.5 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-900";

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...SOURCES.map((value) => ({ value, label: SOURCE_LABEL[value] })),
];

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-emerald-600"
      />
      {children}
    </label>
  );
}

function JobCard({ job }: { job: ScoredJob }) {
  const href = `/jobs/${job.source}/${job.id}`;
  const age = daysSince(lastActive(job));
  return (
    <li className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {age !== null && age <= NEW_WITHIN_DAYS && (
            <Pill className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">New</Pill>
          )}
          <TierPill tier={job.tier} />
          <SourcePill source={job.source} />
          {!job.eligible && (
            <Pill className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              Not open to Nigeria
            </Pill>
          )}
          {job.applied && (
            <Pill className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300">
              Applied
            </Pill>
          )}
          {job.tailored && !job.applied && (
            <Pill className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              CV tailored
            </Pill>
          )}
        </div>
        <Link href={href} className="mt-2 block text-base font-semibold hover:underline">
          {job.title}
        </Link>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
          {[job.company, formatPay(job), job.commitment, activityLabel(job)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {job.matchedSkills.length > 0 && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Matches your CV: {job.matchedSkills.join(", ")}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <Link href={href} className={buttonPrimary}>
          {job.tailored ? "View CV" : "Tailor CV"}
        </Link>
        <a href={job.applyUrl} target="_blank" rel="noreferrer" className={buttonSecondary}>
          Apply ↗
        </a>
      </div>
    </li>
  );
}

export default function JobsPage() {
  const user = useUser();
  const router = useRouter();
  const [data, setData] = useState<JobsResponse | null>(null);
  const [mine, setMine] = useState<MyData>({ resume: "", tailored: new Set(), applied: new Set() });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [maxAge, setMaxAge] = useState(30);
  const [sort, setSort] = useState<"newest" | "fit">("newest");
  const [showStretch, setShowStretch] = useState(false);
  const [showIneligible, setShowIneligible] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs${refresh ? "?refresh" : ""}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load jobs.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const loadMine = () =>
      !cancelled &&
      setMine({
        resume: getResume(user) ?? "",
        tailored: new Set(Object.keys(getAllTailored(user))),
        applied: new Set(Object.keys(getApplied(user))),
      });
    loadMine();
    void importLocalFilesOnce(user).then((imported) => imported && loadMine());
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Scoring happens here because the CV lives in this browser, not on the server.
  const scored: ScoredJob[] = useMemo(() => {
    if (!data) return [];
    const skills = resumeSkills(mine.resume);
    return data.jobs.map((job) => ({
      ...job,
      ...scoreJob(job, skills),
      tailored: mine.tailored.has(job.key),
      applied: mine.applied.has(job.key),
    }));
  }, [data, mine]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const jobs = scored.filter(
      (job) =>
        (source === "all" || job.source === source) &&
        (maxAge === 0 || (daysSince(lastActive(job)) ?? Infinity) <= maxAge) &&
        (showStretch || job.tier !== "stretch") &&
        (showIneligible || job.eligible) &&
        (!q || `${job.title} ${job.company} ${job.skills.join(" ")}`.toLowerCase().includes(q)),
    );
    // The API returns newest first; sort() is stable, so ties keep that order.
    return sort === "fit" ? jobs.sort((a, b) => b.score - a.score) : jobs;
  }, [data, scored, query, source, maxAge, sort, showStretch, showIneligible]);

  const hidden = scored.length - visible.length;
  const inSource = data
    ? scored.filter((job) => source === "all" || job.source === source).length
    : 0;

  function showEverything() {
    setQuery("");
    setMaxAge(0);
    setShowStretch(true);
    setShowIneligible(true);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Software roles for you</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {data
              ? `${visible.length} roles shown, newest first, picked from ${data.totalListings} live listings on Mercor, micro1, Handshake AI and G2i.`
              : "Loading live listings…"}
          </p>
        </div>
        <button onClick={() => load(true)} disabled={loading} className={buttonSecondary}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className={`${card} mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 p-3`}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, company or skill"
          aria-label="Search jobs"
          className="min-w-52 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700"
        />
        <div className="flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
          {SOURCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSource(option.value)}
              aria-pressed={source === option.value}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                source === option.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select
          value={maxAge}
          onChange={(e) => setMaxAge(Number(e.target.value))}
          aria-label="Posted within"
          className={selectClass}
        >
          {AGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "newest" | "fit")}
          aria-label="Sort by"
          className={selectClass}
        >
          <option value="newest">Newest first</option>
          <option value="fit">Best fit first</option>
        </select>
        <Toggle checked={showStretch} onChange={setShowStretch}>
          Show stretch roles
        </Toggle>
        <Toggle checked={showIneligible} onChange={setShowIneligible}>
          Show roles closed to Nigeria
        </Toggle>
      </div>

      {data && !mine.resume.trim() && (
        <p className="mt-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-200">
          Add your CV on the{" "}
          <Link href="/resume" className="font-semibold underline">
            My CV
          </Link>{" "}
          page so jobs are ranked for you and you can tailor it.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {data?.errors.map((message) => (
        <p
          key={message}
          className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
        >
          Couldn&apos;t reach one source ({message}). Showing the rest.
        </p>
      ))}

      {!data && loading && <JobListSkeleton />}
      <ul className="mt-4 space-y-3">
        {visible.map((job) => (
          <JobCard key={job.key} job={job} />
        ))}
      </ul>

      {data && visible.length === 0 && (
        <div className="mt-8 text-center text-sm text-zinc-500">
          {inSource > 0 ? (
            <>
              <p>
                {source === "all" ? "There are" : `${SOURCE_LABEL[source]} has`} {inSource} software{" "}
                {inSource === 1 ? "role" : "roles"}, but the filters above hide{" "}
                {inSource === 1 ? "it" : "them"} (older than the time range, a stretch for your CV, or
                closed to Nigeria).
              </p>
              <button onClick={showEverything} className={`${buttonSecondary} mt-3`}>
                Show all {inSource}
              </button>
            </>
          ) : (
            <p>
              {source === "all" ? "No software roles found" : `${SOURCE_LABEL[source]} has no software roles listed`}{" "}
              right now. Try Refresh.
            </p>
          )}
        </div>
      )}
      {data && visible.length > 0 && hidden > 0 && (
        <p className="mt-6 text-center text-xs text-zinc-500">
          {hidden} other software roles are hidden by the filters above.
        </p>
      )}
    </div>
  );
}
