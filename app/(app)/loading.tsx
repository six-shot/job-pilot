import { Bone, JobListSkeleton } from "@/components/Skeleton";

/** Shown while a page in the signed-in area is being prepared on the server. */
export default function Loading() {
  return (
    <div>
      <Bone className="h-7 w-64" />
      <Bone className="mt-2 h-4 w-96 max-w-full" />
      <JobListSkeleton count={4} />
    </div>
  );
}
