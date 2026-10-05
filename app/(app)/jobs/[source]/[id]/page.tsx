"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ResumeView } from "@/components/ResumeView";
import { JobDetailSkeleton, ResumeSkeleton } from "@/components/Skeleton";
import { Pill, SourcePill, TierPill, buttonPrimary, buttonSecondary, card } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import * as mine from "@/lib/browser-store";
import { resumeSkills, scoreJob } from "@/lib/relevance";
import { SOURCE_LABEL, activityLabel, formatPay, resumeToText, timeAgo } from "@/lib/format";
import { letterPdf, letterToText, resumePdf, savePdf } from "@/lib/pdf";
import type { ScoredJob, StoredLetter, StoredTailor } from "@/lib/types";

type TailorEvent =
  | { type: "progress"; chars: number }
  | { type: "done"; tailored: StoredTailor }
  | { type: "error"; message: string };

type LetterEvent =
  | { type: "progress"; chars: number }
  | { type: "done"; letter: StoredLetter }
  | { type: "error"; message: string };

/** Reads a newline-delimited JSON response, handing each event to `onEvent`. */
async function readEvents<T>(res: Response, onEvent: (event: T) => void) {
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines.filter(Boolean)) onEvent(JSON.parse(line) as T);
  }
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function JobPage({ params }: PageProps<"/jobs/[source]/[id]">) {
  const { source, id } = use(params);
  const user = useUser();
  const router = useRouter();
  const [job, setJob] = useState<ScoredJob | null>(null);
  const [tailored, setTailored] = useState<StoredTailor | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [letter, setLetter] = useState<StoredLetter | null>(null);
  const [writingLetter, setWritingLetter] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterCopied, setLetterCopied] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jobs/${source}/${id}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setLoadError(body.error ?? "Couldn't load this job.");
        else {
          const key = body.job.key as string;
          setJob({
            ...body.job,
            ...scoreJob(body.job, resumeSkills(mine.getResume(user) ?? "")),
            tailored: mine.getTailored(user, key) !== null,
            applied: key in mine.getApplied(user),
          });
          setTailored(mine.getTailored(user, key));
          setLetter(mine.getLetter(user, key));
        }
      })
      .catch(() => !cancelled && setLoadError("Couldn't load this job."));
    return () => {
      cancelled = true;
    };
  }, [source, id, user, router]);

  async function tailor() {
    const resume = mine.getResume(user) ?? "";
    if (!resume.trim()) {
      setTailorError("Add your CV on the My CV page first.");
      return;
    }
    setTailoring(true);
    setTailorError(null);
    setProgress(0);
    try {
      const res = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, id, resume }),
      });
      let finished = false;
      await readEvents<TailorEvent>(res, (event) => {
        if (event.type === "progress") setProgress(event.chars);
        else if (event.type === "done") {
          mine.saveTailored(user, event.tailored);
          setTailored(event.tailored);
          finished = true;
        } else throw new Error(event.message);
      });
      if (!finished) throw new Error("The connection closed before the CV was ready. Try again.");
    } catch (e) {
      setTailorError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setTailoring(false);
    }
  }

  async function writeLetter() {
    const resume = mine.getResume(user) ?? "";
    if (!resume.trim()) {
      setLetterError("Add your CV on the My CV page first.");
      return;
    }
    setWritingLetter(true);
    setLetterError(null);
    try {
      const res = await fetch("/api/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, id, resume }),
      });
      let finished = false;
      await readEvents<LetterEvent>(res, (event) => {
        if (event.type === "done") {
          mine.saveLetter(user, event.letter);
          setLetter(event.letter);
          finished = true;
        } else if (event.type === "error") throw new Error(event.message);
      });
      if (!finished) throw new Error("The connection closed before the letter was ready. Try again.");
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setWritingLetter(false);
    }
  }

  async function downloadCv() {
    if (!tailored || !job) return;
    setSaved(await savePdf(resumePdf(tailored.result.resume, job.company), job.company));
  }

  async function downloadLetter() {
    if (!letter || !job) return;
    setSaved(await savePdf(letterPdf(letter.letter, letterhead(), job), job.company));
  }

  async function copyLetter() {
    if (!letter) return;
    await navigator.clipboard.writeText(letterToText(letter.letter, letterhead().name));
    setLetterCopied(true);
    setTimeout(() => setLetterCopied(false), 2000);
  }

  /** Name and contact lines for the letter: from the tailored CV, else the top of the CV as typed. */
  function letterhead() {
    if (tailored) return tailored.result.resume;
    const [name = "", headline = "", ...rest] = (mine.getResume(user) ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const contact = rest
      .slice(0, 2)
      .filter((line) => /@|https?:|www\.|\+?\d{7,}/.test(line))
      .flatMap((line) => line.split("•").map((part) => part.trim()));
    return { name, headline, contact };
  }

  function toggleApplied() {
    if (!job) return;
    const applied = !job.applied;
    setJob({ ...job, applied });
    mine.setApplied(user, job.key, applied);
  }

  async function copyText() {
    if (!tailored) return;
    await navigator.clipboard.writeText(resumeToText(tailored.result.resume));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{loadError}</p>
        <Link href="/" className={`${buttonSecondary} mt-4`}>
          Back to jobs
        </Link>
      </div>
    );
  }
  if (!job) return <JobDetailSkeleton />;

  const result = tailored?.result;

  return (
    <div>
      <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
        ← All jobs
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TierPill tier={job.tier} />
            <SourcePill source={job.source} />
            {!job.eligible && (
              <Pill className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Not open to Nigeria
              </Pill>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{job.title}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {[
              job.company,
              formatPay(job),
              job.commitment,
              job.location,
              activityLabel(job),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={toggleApplied} className={buttonSecondary} aria-pressed={job.applied}>
            {job.applied ? "✓ Applied" : "Mark as applied"}
          </button>
          <a href={job.applyUrl} target="_blank" rel="noreferrer" className={buttonPrimary}>
            Apply on {SOURCE_LABEL[job.source]} ↗
          </a>
        </div>
      </div>

      <div className={`${card} mt-5 flex flex-wrap items-center gap-2 p-3`}>
        <span className="mr-1 text-sm font-semibold">What do you want to do?</span>
        <button onClick={tailor} disabled={tailoring} className={buttonPrimary}>
          {tailoring ? "Tailoring…" : tailored ? "Tailor CV again" : "Tailor my CV"}
        </button>
        <button onClick={writeLetter} disabled={writingLetter} className={buttonSecondary}>
          {writingLetter ? "Writing…" : letter ? "Rewrite cover letter" : "Write cover letter"}
        </button>
        {tailored && (
          <button
            onClick={downloadCv}
            className={buttonSecondary}
          >
            Download CV
          </button>
        )}
        {letter && (
          <button
            onClick={downloadLetter}
            className={buttonSecondary}
          >
            Download cover letter
          </button>
        )}
      </div>

      {saved && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          {saved}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className={`${card} h-fit p-5`}>
          <h2 className="text-sm font-semibold">About the role</h2>
          {job.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.skills.map((skill) => (
                <Pill
                  key={skill}
                  className={
                    job.matchedSkills.some((m) => skill.toLowerCase().includes(m.toLowerCase()))
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                  }
                >
                  {skill}
                </Pill>
              ))}
            </div>
          )}
          <p className="mt-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
            {job.description ??
              "This posting has no description available here. Open it on the site for details."}
          </p>
        </section>

        <section className="min-w-0">
          <div className={`${card} p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Your CV for this role</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {tailored
                    ? `Tailored ${timeAgo(tailored.createdAt)}`
                    : "Reworded and reordered from your real CV. Nothing is invented."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {tailored && (
                  <>
                    <button onClick={copyText} className={buttonSecondary}>
                      {copied ? "Copied" : "Copy text"}
                    </button>
                    <button
                      onClick={downloadCv}
                      className={buttonSecondary}
                    >
                      Download CV
                    </button>
                  </>
                )}
                <button onClick={tailor} disabled={tailoring} className={buttonPrimary}>
                  {tailoring ? "Tailoring…" : tailored ? "Tailor again" : "Tailor my CV"}
                </button>
              </div>
            </div>

            {tailoring && (
              <p role="status" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                {progress === 0
                  ? "Claude is reading up on the company, then rewriting your CV. This takes a couple of minutes…"
                  : `Writing your CV… ${progress.toLocaleString()} characters so far`}
              </p>
            )}
            {tailorError && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                {tailorError}
              </p>
            )}

            {result && (
              <div className="mt-5 space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{result.fitSummary}</p>
                {result.keywords.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold">Keywords covered</h3>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {result.keywords.map((keyword) => (
                        <Pill
                          key={keyword}
                          className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        >
                          {keyword}
                        </Pill>
                      ))}
                    </div>
                  </div>
                )}
                {tailored?.companyBrief && (
                  <div>
                    <h3 className="text-sm font-semibold">What I found about {job.company}</h3>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                      {tailored.companyBrief}
                    </p>
                  </div>
                )}
                <InsightList title="What changed" items={result.changes} />
                <InsightList title="Gaps to prepare for" items={result.gaps} />
              </div>
            )}
          </div>

          {!tailoring && (
            <div className={`${card} mt-4 p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Cover letter</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {letter
                      ? `Written ${timeAgo(letter.createdAt)}`
                      : "Only if this application asks for one. Written from your real CV."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {letter && (
                    <>
                      <button onClick={copyLetter} className={buttonSecondary}>
                        {letterCopied ? "Copied" : "Copy text"}
                      </button>
                      <button
                        onClick={downloadLetter}
                        className={buttonSecondary}
                      >
                        Download cover letter
                      </button>
                    </>
                  )}
                  <button
                    onClick={writeLetter}
                    disabled={writingLetter}
                    className={letter ? buttonSecondary : buttonPrimary}
                  >
                    {writingLetter ? "Writing…" : letter ? "Write again" : "Write cover letter"}
                  </button>
                </div>
              </div>
              {writingLetter && (
                <p role="status" className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                  Claude is writing your cover letter. This takes under a minute…
                </p>
              )}
              {letterError && (
                <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
                  {letterError}
                </p>
              )}
              {letter && !writingLetter && (
                <div className="mt-4 space-y-3 border-t border-zinc-200 pt-4 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                  <p>{letter.letter.greeting}</p>
                  {letter.letter.paragraphs.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                  <p>
                    {letter.letter.signOff}
                    <br />
                    {letterhead().name}
                  </p>
                </div>
              )}
            </div>
          )}

          {tailoring && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
              <ResumeSkeleton />
            </div>
          )}
          {result && !tailoring && (
            <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800">
              <ResumeView resume={result.resume} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
