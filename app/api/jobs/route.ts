import { currentUser, unauthorized } from "@/lib/auth";
import { getSoftwareJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await currentUser())) return unauthorized();
  const force = new URL(request.url).searchParams.has("refresh");
  return Response.json(await getSoftwareJobs(force));
}
