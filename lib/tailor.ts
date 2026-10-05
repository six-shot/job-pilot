import { spawn } from "child_process";
import { existsSync, readdirSync } from "fs";
import os from "os";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { SOURCE_LABEL, deepPlainDashes } from "./format";
import { COMPANY_FIT, HUMAN_VOICE } from "./skills";
import { isAiSource, type CoverLetter, type Job, type TailorResult } from "./types";

export const TAILOR_MODEL = "claude-opus-5-5";

const TailorSchema = z.object({
  fitSummary: z.string(),
  keywords: z.array(z.string()),
  changes: z.array(z.string()),
  gaps: z.array(z.string()),
  resume: z.object({
    name: z.string(),
    headline: z.string(),
    contact: z.array(z.string()),
    summary: z.string(),
    experience: z.array(
      z.object({
        company: z.string(),
        role: z.string(),
        dates: z.string(),
        location: z.string(),
        bullets: z.array(z.string()),
      }),
    ),
    skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
    openSource: z.array(
      z.object({
        project: z.string(),
        dates: z.string(),
        links: z.array(z.string()),
        bullets: z.array(z.string()),
      }),
    ),
    education: z.array(
      z.object({
        title: z.string(),
        institution: z.string(),
        dates: z.string(),
        details: z.array(z.string()),
      }),
    ),
    certifications: z.array(z.string()),
    languages: z.array(z.string()),
  }),
});

const AI_PLATFORM_CONTEXT = `You tailor one candidate's CV to one specific job posting on an AI-work platform such as Mercor, micro1, Handshake AI or G2i.

Context on these platforms: they are expert networks that staff software engineers onto AI-training and evaluation projects (writing and reviewing code, judging model output, building benchmark tasks) as well as contract engineering roles. Applications are screened first by automated resume matching against the posting and then by an AI-led interview that probes whatever the CV claims. So the CV has to make the relevant evidence obvious in the posting's own vocabulary, and every claim on it has to survive follow-up questions.`;

const JOB_BOARD_CONTEXT = `You tailor one candidate's CV to one specific job posting found on a remote job board.

Context: the posting is for a role at the named company, and the candidate applies through that company's own form. Applications are usually screened first by applicant-tracking software matching the CV against the posting, then by a recruiter who skims it for under a minute, then in interviews that probe whatever the CV claims. So the CV has to make the relevant evidence obvious in the posting's own vocabulary, and every claim on it has to survive follow-up questions.`;

const RULES = `

The candidate's CV is the only source of truth about them. Tailoring means selecting, reordering, re-emphasising and rewording what is already there:
- Lead with the experience, projects and skills that matter most for this posting, and trim or drop bullets that don't help.
- Rewrite bullets so the relevant technology, the candidate's own contribution and the outcome are stated plainly, using the posting's terms wherever they truthfully describe the same thing.
- Rewrite the headline and summary for this role.
- Regroup and reorder skills so the ones the posting asks for come first.

Never add anything the CV doesn't support: no new employers, titles, dates, technologies, certifications, metrics or responsibilities, and no inflating seniority or scope. A fabricated claim gets exposed in the interview and costs the candidate the role. Keep every employer, job title, date, link and number exactly as written in the CV. If the posting asks for something the CV doesn't show, leave it off the resume and list it under gaps instead, so the candidate knows what to prepare for or address.

${HUMAN_VOICE}

Aim for a CV that fits on two pages: keep all roles, but give the most relevant ones four to six bullets and the rest two or three. Write plain text with no markdown, emoji or decorative symbols, since it will be parsed by resume software.

Fill the output fields as follows:
- fitSummary: two or three sentences, addressed to the candidate, on how well they fit and what the tailored CV leans on.
- keywords: terms from the posting that the tailored CV now covers truthfully.
- changes: the main edits you made, one short line each.
- gaps: requirements in the posting that the CV doesn't evidence. Empty if there are none.
- resume: the complete tailored CV. contact holds each contact item as its own string (email, phone, location, links).`;

function systemPrompt(job: Job, researched: boolean) {
  const context = isAiSource(job.source) ? AI_PLATFORM_CONTEXT : JOB_BOARD_CONTEXT;
  return context + "\n" + RULES + (researched ? `\n\n${COMPANY_FIT}` : "");
}

/** The CV, the posting and, when there is any, the company research. */
function material(resume: string, job: Job, brief: string | null) {
  const research = brief ? `\n\n<company_research>\n${brief}\n</company_research>` : "";
  return `<cv>\n${resume}\n</cv>\n\n<job_posting>\n${jobBlock(job)}\n</job_posting>${research}`;
}

function jobBlock(job: Job) {
  const pay =
    job.payMin != null
      ? `$${job.payMin}${job.payMax && job.payMax !== job.payMin ? `-$${job.payMax}` : ""}/${job.payUnit}`
      : "not listed";
  const lines = [
    `${isAiSource(job.source) ? "Platform" : "Found on"}: ${SOURCE_LABEL[job.source]}`,
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Pay: ${pay}`,
  ];
  if (job.commitment) lines.push(`Commitment: ${job.commitment}`);
  if (job.skills.length) lines.push(`Listed skills: ${job.skills.join(", ")}`);
  lines.push(
    "",
    "Description:",
    job.description ?? "(The posting has no description beyond the title and listed skills.)",
  );
  return lines.join("\n");
}

export class TailorError extends Error {}

const CoverLetterSchema = z.object({
  greeting: z.string(),
  paragraphs: z.array(z.string()),
  signOff: z.string(),
});

const COVER_LETTER_SYSTEM = `You write one candidate's cover letter for one specific job posting.

The candidate's CV is the only source of truth about them. Use only employers, projects, technologies, numbers and outcomes that appear in it, exactly as stated; never invent or inflate anything, and never claim a skill the CV doesn't show. If the posting asks for something the CV lacks, leave it out rather than bluff.

${HUMAN_VOICE}

Write the way a capable engineer writes an email to a hiring manager they respect: direct, specific and warm, in the first person, with contractions where they come naturally ("I've", "I'd"). It should sound like one person talking to another, not like an application form. Don't walk through the posting's requirements one by one ("Your posting also asks for..."); tell it as their own story of the work most relevant here. Open with the role and the strongest reason this candidate fits it, not with "I am writing to apply". Then give two or three concrete pieces of evidence from the CV that map onto what the posting actually asks for, naming the product, the technology and the result. Close briefly with what they would like to do next. No clichés ("passionate", "team player", "fast-paced"), no restating the whole CV, no flattery of the company beyond what the posting itself supports.

Keep it to three or four paragraphs and under 300 words so it fits on one page. Plain text only: no markdown, bullet points, emoji or placeholders in brackets.

Fill the output fields as follows:
- greeting: "Dear Hiring Manager," unless the posting names the person to address, or "Dear <Company> team," when the company is clearly named.
- paragraphs: the body, one string per paragraph.
- signOff: a closing phrase such as "Kind regards," only. The candidate's name is added separately.`;

/** With an API key the Anthropic API is used; without one, the local Claude Code CLI (your Claude subscription). */
export function tailorBackend(): "api" | "claude-code" {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "api" : "claude-code";
}

interface Ask<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  onProgress: (chars: number) => void;
}

async function ask<T>(request: Ask<T>): Promise<T> {
  try {
    const answer = tailorBackend() === "api" ? await askApi(request) : await askClaudeCode(request);
    // The prompt forbids them too; this makes sure none slip through.
    return deepPlainDashes(answer);
  } catch (error) {
    if (error instanceof TailorError) throw error;
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new TailorError("Claude's answer came back in an unexpected shape. Try again.");
    }
    throw error;
  }
}

export function tailorResume(
  resume: string,
  job: Job,
  brief: string | null,
  onProgress: (chars: number) => void,
): Promise<TailorResult> {
  return ask({
    system: systemPrompt(job, brief !== null),
    prompt: `${material(resume, job, brief)}\n\nTailor the CV to this posting.`,
    schema: TailorSchema,
    onProgress,
  });
}

export function writeCoverLetter(
  resume: string,
  job: Job,
  brief: string | null,
  onProgress: (chars: number) => void,
): Promise<CoverLetter> {
  return ask({
    system: COVER_LETTER_SYSTEM + (brief ? `\n\n${COMPANY_FIT}\n\nIn the letter, one specific and true reference to what the company does or is working on is welcome where it explains why this candidate's experience is relevant. One is enough.` : ""),
    prompt: `${material(resume, job, brief)}\n\nWrite the cover letter for this posting.`,
    schema: CoverLetterSchema,
    onProgress,
  });
}

/** Keys that aren't tied to one workspace must say which workspace to bill. */
export function apiClient() {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID;
  return new Anthropic(
    workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {},
  );
}

async function askApi<T>({ system, prompt, schema, onProgress }: Ask<T>): Promise<T> {
  const client = apiClient();
  try {
    const stream = client.messages.stream({
      model: TAILOR_MODEL,
      max_tokens: 32000,
      system,
      output_config: { effort: "high", format: zodOutputFormat(schema) },
      messages: [{ role: "user", content: prompt }],
    });

    let chars = 0;
    stream.on("text", (delta) => {
      chars += delta.length;
      onProgress(chars);
    });

    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new TailorError("Claude declined this request. Try again or pick another posting.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new TailorError("The response was cut off before it was complete. Try again.");
    }
    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    return schema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new TailorError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.local.");
    }
    if (error instanceof Anthropic.APIError && /not scoped to a workspace/i.test(error.message)) {
      throw new TailorError(
        "Your Anthropic API key isn't tied to a workspace. Either create a key inside a workspace at console.anthropic.com and put it in ANTHROPIC_API_KEY, or add ANTHROPIC_WORKSPACE_ID=<your workspace id> to .env.local, then restart the app.",
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new TailorError("Rate limited by the Anthropic API. Wait a minute and try again.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new TailorError(`Anthropic API error ${error.status ?? ""}: ${error.message}`);
    }
    throw error;
  }
}

const CLAUDE_CODE_TIMEOUT_MS = 8 * 60 * 1000;

/** CLAUDE_CODE_PATH, then a `claude` on PATH, then the copy the Claude desktop app ships. */
function findClaudeCode(): string | null {
  if (process.env.CLAUDE_CODE_PATH) return process.env.CLAUDE_CODE_PATH;
  const home = os.homedir();
  const dirs = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(home, ".local/bin"),
    path.join(home, ".claude/local"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  for (const dir of dirs) {
    if (dir && existsSync(path.join(dir, "claude"))) return path.join(dir, "claude");
  }
  const bundled = path.join(home, "Library/Application Support/Claude/claude-code");
  try {
    const versions = readdirSync(bundled).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    );
    for (const version of versions) {
      for (const build of readdirSync(path.join(bundled, version))) {
        const bin = path.join(bundled, version, build, "claude.app/Contents/MacOS/claude");
        if (existsSync(bin)) return bin;
      }
    }
  } catch {
    // desktop app not installed
  }
  return null;
}

const LOGIN_HELP =
  "Claude Code on this Mac isn't signed in. Open Terminal, run the login command from the README (claude auth login) once, then try again.";

function askClaudeCode<T>({ system, prompt, schema: outputSchema }: Ask<T>): Promise<T> {
  const bin = findClaudeCode();
  if (!bin) {
    throw new TailorError(
      "Couldn't find Claude Code on this Mac. Install it (npm install -g @anthropic-ai/claude-code) or add ANTHROPIC_API_KEY to .env.local.",
    );
  }
  // The CLI rejects the `$schema` dialect marker zod adds.
  const { $schema: _dialect, ...schema } = z.toJSONSchema(outputSchema);
  void _dialect;
  return new Promise((resolve, reject) => {
    // A plain single-turn call: no tools, no project settings, nothing saved to session history.
    // The CLI path is found at runtime; keep the bundler from tracing it.
    const child = spawn(/*turbopackIgnore: true*/
      bin,
      [
        "-p",
        "--output-format", "json",
        "--model", TAILOR_MODEL,
        "--system-prompt", system,
        "--json-schema", JSON.stringify(schema),
        "--tools", "",
        "--setting-sources", "",
        "--strict-mcp-config",
        "--no-session-persistence",
      ],
      { cwd: os.tmpdir(), stdio: ["pipe", "pipe", "pipe"] },
    );
    const timer = setTimeout(() => child.kill(), CLAUDE_CODE_TIMEOUT_MS);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new TailorError(`Couldn't start Claude Code: ${error.message}`));
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const out = JSON.parse(stdout) as {
          is_error?: boolean;
          result?: string;
          structured_output?: unknown;
        };
        if (out.is_error) {
          const message = out.result ?? "unknown error";
          throw new TailorError(/log ?in/i.test(message) ? LOGIN_HELP : `Claude Code: ${message}`);
        }
        const data =
          out.structured_output ??
          JSON.parse((out.result ?? "").replace(/^```(?:json)?\s*|\s*```$/g, ""));
        resolve(outputSchema.parse(data));
      } catch (error) {
        if (!stdout.trim()) {
          reject(new TailorError(`Claude Code gave no output. ${stderr.trim().slice(0, 300)}`));
        } else reject(error);
      }
    });
    child.stdin.end(prompt);
  });
}
