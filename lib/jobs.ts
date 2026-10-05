import { lastActive } from "./format";
import { isEligible, isSoftwareJob, jobTrack } from "./relevance";
import { getAllJobs, getMicro1Description } from "./sources";
import { SOURCES, isAiSource, type Job, type Source, type Track } from "./types";

export type ListedJob = Job & { eligible: boolean; track: Track | null };

/** Software roles from every source, newest first. The browser scores them against its CV. */
export async function getSoftwareJobs(force = false) {
  const { jobs, errors, at } = await getAllJobs(force);
  const listed: ListedJob[] = [];
  for (const job of jobs) {
    const track = jobTrack(job);
    // Job boards carry every kind of role, so only their frontend and mobile ones are kept.
    if (isAiSource(job.source) ? !isSoftwareJob(job) : !track) continue;
    listed.push({
      ...job,
      // Enough text for skill matching; the detail route returns the full description.
      description: job.description ? job.description.slice(0, 2000) : null,
      eligible: isEligible(job),
      track,
    });
  }
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
