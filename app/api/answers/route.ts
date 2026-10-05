import { currentUser, unauthorized } from "@/lib/auth";
import { researchCompany } from "@/lib/company";
import { getJob, parseSource } from "@/lib/jobs";
import { TailorError, answerQuestions } from "@/lib/tailor";
import type { StoredAnswer } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_QUESTIONS = 12;

/** Answers application-form questions from the CV sent in the request (nothing is stored here). */
export async function POST(request: Request) {
  if (!(await currentUser())) return unauthorized();
  const body = (await request.json()) as {
    source?: string;
    id?: string;
    resume?: string;
    questions?: unknown;
  };
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
  const questions = (Array.isArray(body.questions) ? body.questions : [])
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim().slice(0, 1000))
    .filter(Boolean);
  if (!questions.length) {
    return Response.json({ error: "Paste or type at least one question." }, { status: 400 });
  }
  if (questions.length > MAX_QUESTIONS) {
    return Response.json({ error: `Send at most ${MAX_QUESTIONS} questions at a time.` }, { status: 400 });
  }

  try {
    const brief = await researchCompany(job);
    const createdAt = new Date().toISOString();
    const answers: StoredAnswer[] = (await answerQuestions(resume, job, brief, questions)).map(
      (answer) => ({ ...answer, createdAt }),
    );
    return Response.json({ answers });
  } catch (error) {
    if (!(error instanceof TailorError)) console.error(error);
    return Response.json(
      {
        error:
          error instanceof TailorError ? error.message : "Something went wrong while answering.",
      },
      { status: 500 },
    );
  }
}
