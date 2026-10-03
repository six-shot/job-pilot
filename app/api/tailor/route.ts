import { currentUser, unauthorized } from "@/lib/auth";
import { getJob, parseSource } from "@/lib/jobs";
import { TAILOR_MODEL, TailorError, tailorBackend, tailorResume } from "@/lib/tailor";
import type { StoredTailor } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Tailors the CV sent in the request (the browser keeps it; nothing is stored here).
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
      let lastSent = 0;
      try {
        // The Claude Code path has no token stream, so say up front that work has begun.
        send({ type: "progress", chars: 0 });
        const result = await tailorResume(resume, job, (chars) => {
          if (chars - lastSent >= 200) {
            lastSent = chars;
            send({ type: "progress", chars });
          }
        });
        const entry: StoredTailor = {
          jobKey: job.key,
          jobTitle: job.title,
          createdAt: new Date().toISOString(),
          model: `${TAILOR_MODEL} (${tailorBackend() === "api" ? "API" : "Claude Code"})`,
          result,
        };
        send({ type: "done", tailored: entry });
      } catch (error) {
        if (!(error instanceof TailorError)) console.error(error);
        send({
          type: "error",
          message:
            error instanceof TailorError ? error.message : "Something went wrong while tailoring.",
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
