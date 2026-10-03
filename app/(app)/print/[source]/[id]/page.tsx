"use client";

import { use, useEffect, useState } from "react";
import { ResumeView } from "@/components/ResumeView";
import { ResumeSkeleton } from "@/components/Skeleton";
import { buttonPrimary } from "@/components/ui";
import { useUser } from "@/components/UserContext";
import { getTailored } from "@/lib/browser-store";
import type { StoredTailor } from "@/lib/types";

export default function PrintPage({ params }: PageProps<"/print/[source]/[id]">) {
  const { source, id } = use(params);
  const user = useUser();
  const [tailored, setTailored] = useState<StoredTailor | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    // Browser storage only exists after mount, so this can't be initial state.
    const entry = getTailored(user, `${source}/${id}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMissing(!entry);
    setTailored(entry);
    // The browser uses the tab title as the default PDF file name.
    if (entry) document.title = `${entry.result.resume.name} - ${entry.jobTitle}`;
  }, [source, id, user]);

  if (missing) {
    return <p className="py-16 text-center text-sm text-zinc-500">No tailored CV for this job yet.</p>;
  }
  if (!tailored) {
    return (
      <div className="mx-auto max-w-[800px] rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <ResumeSkeleton />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[800px]">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Choose “Save as PDF” as the destination in the print dialog.
        </p>
        <button onClick={() => window.print()} className={buttonPrimary}>
          Print / Save as PDF
        </button>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <ResumeView resume={tailored.result.resume} />
      </div>
    </div>
  );
}
