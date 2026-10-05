import { currentUser, unauthorized } from "@/lib/auth";
import { researchCompany } from "@/lib/company";
import { getJob, parseSource } from "@/lib/jobs";
import { TailorError, writeCoverLetter } from "@/lib/tailor";
import type { StoredLetter } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Writes a cover letter from the CV sent in the request (nothing is stored here).
 * Streams newline-delimited JSON: progress events, then `done` or `error`.
 */
export async function POST(request: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await request.json()) as { source?: string; id?: string; resume?: string };
  const source = parseSource(body.source ?? "");
  const job = source && body.id ? await getJob(source, body.id) : null;
  if (!job) return Response.json({ error: "Job not found. It may have closed." }, { status: 404 });

  const resume = (body.resume ?? "").trim();
  if (!resume) {
    return Response.json({ error: "Add your CV on the My CV page first." }, { status: 400 });
  }
  if (resume.length > 40_000) {
    return Response.json({ error: "That CV is too long. Trim it to under 40,000 characters." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ type: "progress", chars: 0 });
        const brief = await researchCompany(job);
        const letter = await writeCoverLetter(resume, job, brief, () => {});
        const entry: StoredLetter = {
          jobKey: job.key,
          jobTitle: job.title,
          company: job.company,
          createdAt: new Date().toISOString(),
          companyBrief: brief,
          letter,
        };
        send({ type: "done", letter: entry });
      } catch (error) {
        if (!(error instanceof TailorError)) console.error(error);
        send({
          type: "error",
          message:
            error instanceof TailorError ? error.message : "Something went wrong while writing the letter.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
