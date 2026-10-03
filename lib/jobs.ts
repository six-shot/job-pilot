import { lastActive } from "./format";
import { isEligible, isSoftwareJob } from "./relevance";
import { getAllJobs, getMicro1Description } from "./sources";
import { SOURCES, type Job, type Source } from "./types";

export type ListedJob = Job & { eligible: boolean };

/** Software roles from every source, newest first. The browser scores them against its CV. */
export async function getSoftwareJobs(force = false) {
  const { jobs, errors, at } = await getAllJobs(force);
  const listed: ListedJob[] = jobs.filter(isSoftwareJob).map((job) => ({
    ...job,
    // Enough text for skill matching; the detail route returns the full description.
    description: job.description ? job.description.slice(0, 2000) : null,
    eligible: isEligible(job),
  }));
  listed.sort((a, b) => (lastActive(b) ?? "").localeCompare(lastActive(a) ?? ""));
  return { jobs: listed, errors, fetchedAt: at, totalListings: jobs.length };
}

export async function getJob(source: Source, id: string): Promise<Job | null> {
  const { jobs } = await getAllJobs();
  const job = jobs.find((j) => j.source === source && j.id === id);
  if (!job) return null;
  if (source === "micro1" && !job.description) {
    return { ...job, description: await getMicro1Description(id).catch(() => null) };
  }
  return job;
}

export function parseSource(value: string): Source | null {
  return (SOURCES as readonly string[]).includes(value) ? (value as Source) : null;
}
