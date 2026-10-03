import { currentUser, unauthorized } from "@/lib/auth";
import { getJob, parseSource } from "@/lib/jobs";
import { isEligible } from "@/lib/relevance";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ source: string; id: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!(await currentUser())) return unauthorized();
  const { source: rawSource, id } = await params;
  const source = parseSource(rawSource);
  const job = source ? await getJob(source, id) : null;
  if (!job) return Response.json({ error: "Job not found. It may have closed." }, { status: 404 });
  return Response.json({ job: { ...job, eligible: isEligible(job) } });
}
