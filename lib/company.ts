import Anthropic from "@anthropic-ai/sdk";
import { TAILOR_MODEL, apiClient, tailorBackend } from "./tailor";
import type { Job } from "./types";

const SYSTEM = `You research a company for a job applicant, so their CV and cover letter can speak to what this employer actually cares about.

Search the web and read the company's own site (home, about, careers, engineering blog) where you can. Then write a short brief, in plain sentences, covering only what you found:
- What the company makes and who uses or pays for it.
- Roughly how big and how old it is, and where it is based.
- What its engineering work looks like: stack, product surface, anything it has written about how it builds.
- What it says it values in people, and the tone it uses about itself.
- Given all that and the posting, the three or four things this team most likely wants to see in a candidate for this role.

Be strict about accuracy. Many companies share a name, so make sure the one you describe matches the posting. Leave out anything you could not confirm, and if you found little or nothing reliable, say so in one sentence instead of guessing. Keep it under 250 words, with no headings, and put the finished brief inside <brief></brief> tags.`;

const MAX_RESUMES = 3;
const cache = new Map<string, string>();

/**
 * A short brief on the employer, or null when none could be gathered. Research is a
 * nice-to-have, so every failure here is swallowed and tailoring carries on without it.
 */
export async function researchCompany(job: Job): Promise<string | null> {
  // Web search runs on Anthropic's servers, so it needs the API.
  if (tailorBackend() !== "api") return null;
  const key = job.company.trim().toLowerCase();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit) return hit;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        `Company: ${job.company}`,
        `Role: ${job.title}`,
        `Posting: ${job.applyUrl}`,
        "",
        "From the posting:",
        (job.description ?? "(no description)").slice(0, 3000),
      ].join("\n"),
    },
  ];
  try {
    const client = apiClient();
    let message: Anthropic.Message | null = null;
    // A long search turn can pause; sending the paused turn back resumes it.
    for (let attempt = 0; attempt <= MAX_RESUMES; attempt++) {
      message = await client.messages
        .stream({
          model: TAILOR_MODEL,
          max_tokens: 8000,
          system: SYSTEM,
          output_config: { effort: "low" },
          tools: [
            { type: "web_search_20260209", name: "web_search", max_uses: 4 },
            { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
          ],
          messages,
        })
        .finalMessage();
      if (message.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: message.content });
    }
    if (!message || message.stop_reason !== "end_turn") return null;
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const brief = (text.match(/<brief>([\s\S]*?)<\/brief>/)?.[1] ?? "").trim();
    if (!brief) return null;
    cache.set(key, brief);
    return brief;
  } catch (error) {
    console.warn(`Company research failed for ${job.company}:`, error);
    return null;
  }
}
