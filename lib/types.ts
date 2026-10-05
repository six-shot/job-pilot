/** AI-work platforms: expert networks that staff engineers onto AI-training projects. */
export const AI_SOURCES = ["mercor", "micro1", "handshake", "g2i"] as const;
/** General remote job boards, searched for frontend and mobile roles. */
export const BOARD_SOURCES = ["himalayas", "jobicy", "workingnomads", "weworkremotely", "remotive"] as const;
export const SOURCES = [...AI_SOURCES, ...BOARD_SOURCES] as const;
export type Source = (typeof SOURCES)[number];

export function isAiSource(source: Source) {
  return (AI_SOURCES as readonly string[]).includes(source);
}

/** Which tab a role belongs under; null when it is neither frontend nor mobile work. */
export type Track = "frontend" | "mobile";

export interface Job {
  key: string; // `${source}/${id}`
  source: Source;
  id: string;
  title: string;
  company: string;
  domain: string;
  /** Plain text. micro1 only has this after the detail page is fetched. */
  description: string | null;
  skills: string[];
  payMin: number | null;
  payMax: number | null;
  payUnit: string; // "hr", "task", "yr"...
  commitment: string | null;
  location: string;
  postedAt: string | null;
  /** Last edit to a still-open listing, when the source reports one. */
  updatedAt?: string | null;
  applyUrl: string;
  /** ISO-3166 alpha-3 codes, or a plain country/region name when that is all the source gives. Empty = open to everyone. */
  eligibleCountries: string[];
  ineligibleCountries: string[];
}

export type Tier = "great" | "good" | "stretch";

export interface ScoredJob extends Job {
  track: Track | null;
  score: number;
  tier: Tier;
  matchedSkills: string[];
  eligible: boolean;
  tailored: boolean;
  applied: boolean;
}

export interface ResumeExperience {
  company: string;
  role: string;
  dates: string;
  location: string;
  bullets: string[];
}

export interface TailoredResume {
  name: string;
  headline: string;
  contact: string[];
  summary: string;
  experience: ResumeExperience[];
  skills: { category: string; items: string[] }[];
  openSource: { project: string; dates: string; links: string[]; bullets: string[] }[];
  education: { title: string; institution: string; dates: string; details: string[] }[];
  certifications: string[];
  languages: string[];
}

export interface TailorResult {
  fitSummary: string;
  keywords: string[];
  changes: string[];
  gaps: string[];
  resume: TailoredResume;
}

export interface StoredTailor {
  jobKey: string;
  jobTitle: string;
  createdAt: string;
  model: string;
  /** What was found out about the employer before tailoring, when research ran. */
  companyBrief?: string | null;
  result: TailorResult;
}

export interface CoverLetter {
  greeting: string;
  paragraphs: string[];
  signOff: string;
}

export interface StoredLetter {
  jobKey: string;
  jobTitle: string;
  company: string;
  createdAt: string;
  companyBrief?: string | null;
  letter: CoverLetter;
}
