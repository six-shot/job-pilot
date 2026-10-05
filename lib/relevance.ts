import type { Job, Tier, Track } from "./types";

/** ISO-3166 alpha-3 of where you live. Roles closed to this country are flagged. */
export const HOME_COUNTRY = process.env.HOME_COUNTRY ?? "NGA";
/** Matches the same country where a source names it in words instead of a code. */
const HOME_COUNTRY_NAME = new RegExp(process.env.HOME_COUNTRY_NAME ?? "nigeria|^africa$|^emea$|worldwide|global|anywhere", "i");

const SOFTWARE_DOMAINS = new Set(["Software Engineering", "software-engineering"]);

/** Tech terms we look for in both the CV and a job. Only ones found in the CV count. */
const VOCAB: [label: string, pattern: RegExp][] = [
  ["React", /\breact(?:\.?js)?\b(?!\s*native)/i],
  ["React Native", /\breact[\s-]native\b/i],
  ["Next.js", /\bnext(?:\.?js)\b/i],
  ["Vue", /\bvue(?:\.?js)?\b/i],
  ["TypeScript", /\btypescript\b/i],
  ["JavaScript", /\bjavascript\b/i],
  ["HTML", /\bhtml5?\b/i],
  ["CSS", /\bcss3?\b/i],
  ["Tailwind", /\btailwind/i],
  ["Node.js", /\bnode(?:\.?js)\b/i],
  ["Express", /\bexpress(?:\.?js)?\b/i],
  ["Python", /\bpython3?\b/i],
  ["SQL", /\bsql\b/i],
  ["Rust", /\brust\b/i],
  ["OCaml", /\bocaml\b/i],
  ["Solidity", /\bsolidity\b/i],
  ["Web3", /\bweb3|blockchain|smart contracts?|dapps?\b/i],
  ["GraphQL", /\bgraphql\b/i],
  ["REST APIs", /\brest(?:ful)?\b/i],
  ["WebSockets", /\bweb\s?sockets?\b/i],
  ["Redux", /\bredux\b/i],
  ["Jest", /\bjest\b/i],
  ["Cypress", /\bcypress\b/i],
  ["Testing", /\b(?:unit|e2e|end-to-end|automated) test/i],
  ["Git", /\bgit\b/i],
  ["GitHub", /\bgithub\b/i],
  ["Open source", /\bopen[\s-]source\b/i],
  ["CI/CD", /\bci\/cd\b/i],
  ["Docker", /\bdocker\b/i],
  ["AWS", /\baws\b/i],
  ["Accessibility", /\baccessib|wcag\b/i],
  ["Code review", /\bcode reviews?\b/i],
  ["Debugging", /\bdebugg/i],
  ["Frontend", /\bfront[\s-]?end\b/i],
  ["Full-stack", /\bfull[\s-]?stack\b/i],
  ["Mobile", /\bmobile\b/i],
  ["UI/UX", /\bui\/ux|user interfaces?\b/i],
  ["Performance", /\bperformance optimi|web performance|lazy loading/i],
  ["Agile", /\bagile\b/i],
];

// Title signals. Strong = squarely your lane; general = software work you can do.
const STRONG_TITLE =
  /front[\s-]?end|react|next\.?js|javascript|typescript|\bweb\b|full[\s-]?stack|\bui\b|open[\s-]source|github|mobile/i;
const GENERAL_TITLE =
  /software engineer|\bswe\b|developer|coder|coding|\bcode\b|agent engineer|programm/i;
// Software roles that need a specialty the CV doesn't show.
const OFF_LANE_TITLE =
  /secur|cyber|\bcve\b|kernel|\bgpu\b|firmware|cad\b|mlops|devops|kubernetes|\bcloud\b|serverless|data scien|data analyst|machine learning|\bml\b|c#|\.net|\blean\b|customer success|interviewer|android|kotlin|\bios\b|swift|flutter|backend|back-end|\bjava\b|ruby|rails|\bphp\b|laravel|drupal|wordpress|shopify|golang|angular|principal|\bstaff\b|architect|competitive|puzzle|application users|\bindia\b|latam/i;
// A React Native title is in lane even when it also names iOS or Android.
const REACT_NATIVE_TITLE = /react[\s-]native|\bexpo\b/i;

const MOBILE_TITLE = /react[\s-]native|\bexpo\b|\bmobile\b|\bios\b|android|flutter/i;
const FRONTEND_TITLE =
  /front[\s-]?end|\breact|next\.?js|\bvue|javascript|typescript|\bweb3?\b|\bui\b|full[\s-]?stack/i;
const BUILDER_TITLE = /engineer|developer|\bdev\b|programmer|desarrollador|contributor|coder/i;
// Roles around engineering rather than in it.
const NOT_BUILDER_TITLE =
  /manager|director|head of|\bdesign|recruit|writer|marketing|sales|advocate|analyst|\bqa\b|tester|test automation|support|expression of interest/i;

export function jobTrack(job: Pick<Job, "title">): Track | null {
  const { title } = job;
  if (!BUILDER_TITLE.test(title) || NOT_BUILDER_TITLE.test(title)) return null;
  if (REACT_NATIVE_TITLE.test(title)) return "mobile";
  // "Frontend Engineer - React, Flutter" is a frontend role that mentions a mobile stack.
  if (/front[\s-]?end/i.test(title)) return "frontend";
  if (MOBILE_TITLE.test(title)) return "mobile";
  return FRONTEND_TITLE.test(title) ? "frontend" : null;
}

export function resumeSkills(resume: string) {
  return VOCAB.filter(([, re]) => re.test(resume)).map(([label]) => label);
}

// Sources that don't tag a domain are filtered on the title alone.
const SOFTWARE_TITLE =
  /software|front[\s-]?end|full[\s-]?stack|developer|\bcoding\b|\bcode\b|programm|\bweb\b|react|javascript|typescript|computer science/i;

export function isSoftwareJob(job: Job) {
  if (SOFTWARE_DOMAINS.has(job.domain)) return true;
  if (job.domain) return STRONG_TITLE.test(job.title) && /engineer|developer|contributor/i.test(job.title);
  return SOFTWARE_TITLE.test(job.title);
}

export function isEligible(job: Job) {
  if (job.ineligibleCountries.includes(HOME_COUNTRY)) return false;
  return (
    job.eligibleCountries.length === 0 ||
    job.eligibleCountries.some((c) => c === HOME_COUNTRY || HOME_COUNTRY_NAME.test(c))
  );
}

export function scoreJob(job: Job, mySkills: string[]) {
  const haystack = `${job.title}\n${job.skills.join(", ")}\n${job.description ?? ""}`;
  const matchedSkills = VOCAB.filter(
    ([label, re]) => mySkills.includes(label) && re.test(haystack),
  ).map(([label]) => label);

  let score = Math.min(matchedSkills.length * 5, 35);
  if (STRONG_TITLE.test(job.title)) score += 50;
  else if (GENERAL_TITLE.test(job.title)) score += 25;
  if (OFF_LANE_TITLE.test(job.title) && !REACT_NATIVE_TITLE.test(job.title)) score -= 30;
  score = Math.max(0, Math.min(100, score));

  const tier: Tier = score >= 55 ? "great" : score >= 30 ? "good" : "stretch";
  return { score, tier, matchedSkills };
}
