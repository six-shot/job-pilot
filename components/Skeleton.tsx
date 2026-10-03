import { card } from "./ui";

/** A grey placeholder bar. Size it with Tailwind classes. */
export function Bone({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-md bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800 ${className}`}
    />
  );
}

function JobCardSkeleton() {
  return (
    <li className={`${card} flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between`}>
      <div className="min-w-0 flex-1">
        <div className="flex gap-2">
          <Bone className="h-5 w-16 rounded-full" />
          <Bone className="h-5 w-14 rounded-full" />
        </div>
        <Bone className="mt-3 h-5 w-3/5" />
        <Bone className="mt-2 h-4 w-2/5" />
        <Bone className="mt-3 h-3 w-1/2" />
      </div>
      <div className="flex shrink-0 gap-2">
        <Bone className="h-9 w-24 rounded-lg" />
        <Bone className="h-9 w-20 rounded-lg" />
      </div>
    </li>
  );
}

export function JobListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="mt-4 space-y-3" aria-busy="true" aria-label="Loading jobs">
      {Array.from({ length: count }, (_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </ul>
  );
}

export function JobDetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading job">
      <Bone className="h-4 w-20" />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex gap-2">
            <Bone className="h-5 w-16 rounded-full" />
            <Bone className="h-5 w-14 rounded-full" />
          </div>
          <Bone className="mt-3 h-7 w-3/4 max-w-xl" />
          <Bone className="mt-2 h-4 w-1/2 max-w-md" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-9 w-32 rounded-lg" />
          <Bone className="h-9 w-36 rounded-lg" />
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={`${card} space-y-2.5 p-5`}>
          <Bone className="h-4 w-28" />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {["w-14", "w-20", "w-16", "w-24", "w-12"].map((w) => (
              <Bone key={w} className={`h-5 rounded-full ${w}`} />
            ))}
          </div>
          {Array.from({ length: 9 }, (_, i) => (
            <Bone key={i} className={`h-3.5 ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
          ))}
        </div>
        <div className={`${card} h-fit p-5`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <Bone className="h-4 w-40" />
              <Bone className="mt-2 h-3 w-64 max-w-full" />
            </div>
            <Bone className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shaped like a CV page; shown while one is loading or being written. */
export function ResumeSkeleton() {
  const block = (lines: number) =>
    Array.from({ length: lines }, (_, i) => (
      <Bone key={i} className={`h-3 ${i === lines - 1 ? "w-3/4" : "w-full"}`} />
    ));
  return (
    <div className="space-y-2" aria-hidden>
      <Bone className="h-7 w-48" />
      <Bone className="h-4 w-80 max-w-full" />
      <Bone className="h-3 w-full max-w-lg" />
      <Bone className="mt-5 h-3 w-24" />
      {block(3)}
      <Bone className="mt-5 h-3 w-40" />
      {[0, 1].map((n) => (
        <div key={n} className="space-y-2 pt-2">
          <div className="flex justify-between gap-4">
            <Bone className="h-4 w-56" />
            <Bone className="h-3 w-28" />
          </div>
          {block(4)}
        </div>
      ))}
    </div>
  );
}
