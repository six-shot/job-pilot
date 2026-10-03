import { spawn } from "child_process";
import { existsSync, readdirSync } from "fs";
import os from "os";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { SOURCE_LABEL } from "./format";
import type { Job, TailorResult } from "./types";

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

const SYSTEM = `You tailor one candidate's CV to one specific job posting on an AI-work platform such as Mercor, micro1, Handshake AI or G2i.

Context on these platforms: they are expert networks that staff software engineers onto AI-training and evaluation projects (writing and reviewing code, judging model output, building benchmark tasks) as well as contract engineering roles. Applications are screened first by automated resume matching against the posting and then by an AI-led interview that probes whatever the CV claims. So the CV has to make the relevant evidence obvious in the posting's own vocabulary, and every claim on it has to survive follow-up questions.

The candidate's CV is the only source of truth about them. Tailoring means selecting, reordering, re-emphasising and rewording what is already there:
- Lead with the experience, projects and skills that matter most for this posting, and trim or drop bullets that don't help.
- Rewrite bullets so the relevant technology, the candidate's own contribution and the outcome are stated plainly, using the posting's terms wherever they truthfully describe the same thing.
- Rewrite the headline and summary for this role.
- Regroup and reorder skills so the ones the posting asks for come first.

Never add anything the CV doesn't support: no new employers, titles, dates, technologies, certifications, metrics or responsibilities, and no inflating seniority or scope. A fabricated claim gets exposed in the interview and costs the candidate the role. Keep every employer, job title, date, link and number exactly as written in the CV. If the posting asks for something the CV doesn't show, leave it off the resume and list it under gaps instead, so the candidate knows what to prepare for or address.

Aim for a CV that fits on two pages: keep all roles, but give the most relevant ones four to six bullets and the rest two or three. Write plain text with no markdown, emoji or decorative symbols, since it will be parsed by resume software.

Fill the output fields as follows:
- fitSummary: two or three sentences, addressed to the candidate, on how well they fit and what the tailored CV leans on.
- keywords: terms from the posting that the tailored CV now covers truthfully.
- changes: the main edits you made, one short line each.
- gaps: requirements in the posting that the CV doesn't evidence. Empty if there are none.
- resume: the complete tailored CV. contact holds each contact item as its own string (email, phone, location, links).`;

function jobBlock(job: Job) {
  const pay =
    job.payMin != null
      ? `$${job.payMin}${job.payMax && job.payMax !== job.payMin ? `–$${job.payMax}` : ""}/${job.payUnit}`
      : "not listed";
  const lines = [
    `Platform: ${SOURCE_LABEL[job.source]}`,
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

function userPrompt(resume: string, job: Job) {
  return `<cv>\n${resume}\n</cv>\n\n<job_posting>\n${jobBlock(job)}\n</job_posting>\n\nTailor the CV to this posting.`;
}

/** With an API key the Anthropic API is used; without one, the local Claude Code CLI (your Claude subscription). */
export function tailorBackend(): "api" | "claude-code" {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "api" : "claude-code";
}

export async function tailorResume(
  resume: string,
  job: Job,
  onProgress: (chars: number) => void,
): Promise<TailorResult> {
  try {
    return tailorBackend() === "api"
      ? await tailorWithApi(resume, job, onProgress)
      : await tailorWithClaudeCode(resume, job);
  } catch (error) {
    if (error instanceof TailorError) throw error;
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new TailorError("Claude returned a CV in an unexpected shape. Try again.");
    }
    throw error;
  }
}

async function tailorWithApi(
  resume: string,
  job: Job,
  onProgress: (chars: number) => void,
): Promise<TailorResult> {
  const client = new Anthropic();
  try {
    const stream = client.messages.stream({
      model: TAILOR_MODEL,
      max_tokens: 32000,
      system: SYSTEM,
      output_config: { effort: "high", format: zodOutputFormat(TailorSchema) },
      messages: [{ role: "user", content: userPrompt(resume, job) }],
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
      throw new TailorError("The response was cut off before the CV was complete. Try again.");
    }
    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    return TailorSchema.parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new TailorError("Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env.local.");
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

function tailorWithClaudeCode(resume: string, job: Job): Promise<TailorResult> {
  const bin = findClaudeCode();
  if (!bin) {
    throw new TailorError(
      "Couldn't find Claude Code on this Mac. Install it (npm install -g @anthropic-ai/claude-code) or add ANTHROPIC_API_KEY to .env.local.",
    );
  }
  // The CLI rejects the `$schema` dialect marker zod adds.
  const { $schema: _dialect, ...schema } = z.toJSONSchema(TailorSchema);
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
        "--system-prompt", SYSTEM,
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
        resolve(TailorSchema.parse(data));
      } catch (error) {
        if (!stdout.trim()) {
          reject(new TailorError(`Claude Code gave no output. ${stderr.trim().slice(0, 300)}`));
        } else reject(error);
      }
    });
    child.stdin.end(userPrompt(resume, job));
  });
}
