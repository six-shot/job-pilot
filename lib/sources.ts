import type { Job } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const MERCOR_URL = "https://aws.api.mercor.com/work/listings-explore-page";
const MICRO1_API = "https://prod-api.micro1.ai/api/v1/job/portal";
const MICRO1_PAGE_SIZE = 100;

const CACHE_MS = 10 * 60 * 1000;

interface MercorListing {
  listingId: string;
  title: string;
  description: string | null;
  commitment: string | null;
  rateMin: number | null;
  rateMax: number | null;
  payRateFrequency: string | null;
  location: string | null;
  eligibleLocation: string[] | null;
  eligibleResidenceLocation: string[] | null;
  ineligibleLocation: string[] | null;
  ineligibleResidenceLocation: string[] | null;
  companyName: string | null;
  postedAt: string | null;
  listingDomain: string | null;
  disableApplications: boolean;
}

interface Micro1Job {
  job_id: string;
  job_name: string;
  company_name: string | null;
  ideal_hourly_rate: { min?: number; max?: number } | null;
  engagement_type: string | null;
  location_type: string | null;
  date_posted: string | null;
  skills: string[] | null;
  domain_slug: string | null;
  apply_url: string | null;
}

const PAY_UNITS: Record<string, string> = {
  hourly: "hr",
  "per-task": "task",
  "one-time": "one-time",
  yearly: "yr",
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchMercor(): Promise<Job[]> {
  const res = await fetch(MERCOR_URL, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`Mercor responded ${res.status}`);
  const data = (await res.json()) as { listings: MercorListing[] };
  return data.listings
    .filter((l) => !l.disableApplications)
    .map((l) => ({
      key: `mercor/${l.listingId}`,
      source: "mercor" as const,
      id: l.listingId,
      title: l.title.trim(),
      company: l.companyName ?? "Mercor",
      domain: l.listingDomain ?? "",
      description: l.description,
      skills: [],
      payMin: l.rateMin,
      payMax: l.rateMax,
      payUnit: PAY_UNITS[l.payRateFrequency ?? ""] ?? l.payRateFrequency ?? "",
      commitment: l.commitment,
      location: l.location ?? "Remote",
      postedAt: l.postedAt,
      applyUrl: `https://work.mercor.com/jobs/${l.listingId}/${slugify(l.title)}`,
      eligibleCountries: [
        ...new Set([...(l.eligibleLocation ?? []), ...(l.eligibleResidenceLocation ?? [])]),
      ],
      ineligibleCountries: [
        ...new Set([...(l.ineligibleLocation ?? []), ...(l.ineligibleResidenceLocation ?? [])]),
      ],
    }));
}

async function fetchMicro1Page(page: number) {
  const res = await fetch(`${MICRO1_API}?page=${page}&limit=${MICRO1_PAGE_SIZE}&keyword=`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ action: "get_all_jobs", filters: { type: ["EXPERT"] } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`micro1 responded ${res.status}`);
  return (await res.json()) as { total: number; data: Micro1Job[] };
}

async function fetchMicro1(): Promise<Job[]> {
  const first = await fetchMicro1Page(1);
  const pages = Math.ceil(first.total / MICRO1_PAGE_SIZE);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => fetchMicro1Page(i + 2)),
  );
  const all = [first, ...rest].flatMap((p) => p.data ?? []);
  const seen = new Set<string>();
  return all
    .filter((j) => !seen.has(j.job_id) && seen.add(j.job_id))
    .map((j) => ({
      key: `micro1/${j.job_id}`,
      source: "micro1" as const,
      id: j.job_id,
      title: j.job_name.trim(),
      company: j.company_name ?? "micro1",
      domain: j.domain_slug ?? "",
      description: null,
      skills: j.skills ?? [],
      payMin: j.ideal_hourly_rate?.min ?? null,
      payMax: j.ideal_hourly_rate?.max ?? null,
      payUnit: "hr",
      commitment: j.engagement_type,
      location: j.location_type ?? "Remote",
      postedAt: j.date_posted ? j.date_posted.replace(" ", "T") : null,
      applyUrl: j.apply_url ?? `https://jobs.micro1.ai/post/${j.job_id}`,
      eligibleCountries: [],
      ineligibleCountries: [],
    }));
}

let cache: { at: number; jobs: Job[]; errors: string[] } | null = null;

export async function getAllJobs(force = false) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache;
  const sources: [name: string, load: () => Promise<Job[]>][] = [
    ["Mercor", fetchMercor],
    ["micro1", fetchMicro1],
    ["Handshake AI", fetchHandshake],
    ["G2i", fetchG2i],
  ];
  const results = await Promise.allSettled(sources.map(([, load]) => load()));
  const jobs: Job[] = [];
  const errors: string[] = [];
  results.forEach((result, i) => {
    if (result.status === "fulfilled") jobs.push(...result.value);
    else errors.push(`${sources[i][0]}: ${String(result.reason?.message ?? result.reason)}`);
  });
  // Keep serving the last good copy if every source is down.
  if (jobs.length === 0 && cache) return { ...cache, errors };
  cache = { at: Date.now(), jobs, errors };
  return cache;
}

function htmlToText(html: string) {
  return html
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/ul|\/ol)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const descriptionCache = new Map<string, string>();

/**
 * micro1's list API has no description. The public job page embeds it in the
 * Next.js flight payload, either inline or as a `$<id>` reference to a text
 * chunk (`<id>:T<hex byte length>,<content>`).
 */
export async function getMicro1Description(id: string): Promise<string | null> {
  const hit = descriptionCache.get(id);
  if (hit) return hit;
  const res = await fetch(`https://jobs.micro1.ai/post/${id}`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const html = await res.text();
  let payload = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) {
    try {
      payload += JSON.parse(`"${m[1]}"`);
    } catch {
      // skip a chunk we can't decode
    }
  }
  const field = payload.match(/"job_description":"((?:[^"\\]|\\.)*)"/);
  if (!field) return null;
  let raw: string;
  const ref = field[1].match(/^\$([0-9a-f]+)$/);
  if (ref) {
    const marker = payload.match(new RegExp(`\\b${ref[1]}:T([0-9a-f]+),`));
    if (!marker || marker.index === undefined) return null;
    const start = marker.index + marker[0].length;
    const bytes = Buffer.from(payload.slice(start), "utf8");
    raw = bytes.subarray(0, parseInt(marker[1], 16)).toString("utf8");
  } else {
    raw = JSON.parse(`"${field[1]}"`);
  }
  const text = htmlToText(raw);
  if (text) descriptionCache.set(id, text);
  return text || null;
}

// ---------------------------------------------------------------------------
// Handshake AI
//
// The public opportunities page is a Framer site. Its listings sit in a binary
// CMS chunk whose URL changes on every publish, so we resolve it each time:
// page HTML -> collection module -> chunk URL.
// ---------------------------------------------------------------------------

const HANDSHAKE_PAGE = "https://joinhandshake.com/ai/opportunities/";
const HANDSHAKE_COLLECTION = "AsbR2Q9Rd";
// CMS field ids of the opportunities collection.
const HS = {
  title: "Hi7WvygoG",
  slug: "Vt3dK5Eel",
  payMax: "WFQUwsB06",
  location: "Sw8QukdCp",
  description: "GRpdg1g2G",
  applyUrl: "YP6SW58rm",
  postedAt: "W1qkijmje",
};

type CmsValue = string | number | boolean | null | CmsValue[];

/** Reads one typed value at `pos`; returns null on a type we don't know. */
function readCmsValue(buf: Buffer, pos: number): { value: CmsValue; next: number } | null {
  const type = buf[pos++];
  switch (type) {
    case 0x00:
      return { value: null, next: pos };
    case 0x01: {
      const count = buf.readUInt16BE(pos);
      pos += 2;
      const items: CmsValue[] = [];
      for (let i = 0; i < count; i++) {
        const item = readCmsValue(buf, pos);
        if (!item) return null;
        items.push(item.value);
        pos = item.next;
      }
      return { value: items, next: pos };
    }
    case 0x02:
      return { value: buf[pos] === 1, next: pos + 1 };
    case 0x04:
      return { value: Number(buf.readBigInt64BE(pos)), next: pos + 8 };
    case 0x08:
      return { value: buf.readDoubleBE(pos), next: pos + 8 };
    case 0x05:
    case 0x06:
    case 0x07:
    case 0x0c: {
      const len = buf.readUInt32BE(pos);
      return { value: buf.toString("utf8", pos + 4, pos + 4 + len), next: pos + 4 + len };
    }
    case 0x0b: {
      const len = buf.readUInt32BE(pos + 1);
      return { value: buf.toString("utf8", pos + 5, pos + 5 + len), next: pos + 5 + len };
    }
    default:
      return null;
  }
}

/** Every record starts with an `id` string field, preceded by a u16 field count. */
function parseFramerCms(buf: Buffer) {
  const marker = Buffer.from([0, 0, 0, 2, 0x69, 0x64, 0x0c, 0, 0, 0, 9]);
  const records: Record<string, CmsValue>[] = [];
  for (let at = buf.indexOf(marker); at !== -1; at = buf.indexOf(marker, at + 1)) {
    if (at < 2) continue;
    const fieldCount = buf.readUInt16BE(at - 2);
    const record: Record<string, CmsValue> = {};
    let pos = at;
    try {
      for (let i = 0; i < fieldCount; i++) {
        const keyLen = buf.readUInt32BE(pos);
        if (keyLen > 64) break;
        const key = buf.toString("utf8", pos + 4, pos + 4 + keyLen);
        const parsed = readCmsValue(buf, pos + 4 + keyLen);
        if (!parsed) break;
        record[key] = parsed.value;
        pos = parsed.next;
      }
    } catch {
      // ran off the end of the buffer; keep what we have
    }
    records.push(record);
  }
  return records;
}

/** Framer rich text is nested arrays: [4, tag, attrs, ...children] and [5, text]. */
function richTextToPlain(json: string) {
  let out = "";
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (node[0] === 5) {
      out += String(node[1] ?? "");
    } else if (node[0] === 4) {
      const tag = node[1];
      if (tag === "li") out += "\n- ";
      node.slice(3).forEach(walk);
      if (tag === "p" || /^h[1-6]$/.test(tag) || tag === "ul" || tag === "ol") out += "\n";
    } else {
      node.slice(1).forEach(walk);
    }
  };
  try {
    walk(JSON.parse(json));
  } catch {
    return "";
  }
  return out
    .replace(/\n- \n?/g, "\n- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} responded ${res.status}`);
  return res.text();
}

async function fetchHandshake(): Promise<Job[]> {
  const page = await fetchText(HANDSHAKE_PAGE);
  const moduleUrl = page.match(
    new RegExp(`https://framerusercontent\\.com/sites/[\\w-]+/${HANDSHAKE_COLLECTION}\\.[\\w-]+\\.mjs`),
  )?.[0];
  if (!moduleUrl) throw new Error("Handshake AI page layout changed (no collection module)");
  const moduleSource = await fetchText(moduleUrl);
  const ref = moduleSource.match(
    new RegExp("new URL\\(`(\\./" + HANDSHAKE_COLLECTION + "-chunk-[^`]+)`,`([^`]+)`\\)"),
  );
  if (!ref) throw new Error("Handshake AI page layout changed (no data chunk)");
  // The module lives under /modules/ but the chunk is served from /cms/.
  const chunkUrl = new URL(ref[1], ref[2]).href.replace("/modules/", "/cms/");
  const res = await fetch(chunkUrl, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`Handshake AI data responded ${res.status}`);
  const records = parseFramerCms(Buffer.from(await res.arrayBuffer()));

  const jobs: Job[] = [];
  for (const r of records) {
    const title = typeof r[HS.title] === "string" ? (r[HS.title] as string).trim() : "";
    let applyUrl = typeof r[HS.applyUrl] === "string" ? (r[HS.applyUrl] as string) : "";
    try {
      applyUrl = JSON.parse(applyUrl); // link fields are JSON-encoded strings
    } catch {
      // already a bare URL
    }
    const id = applyUrl.match(/hai_job_id=(\d+)/)?.[1];
    if (!title || !id) continue;
    // Region-specific projects carry the country in the title, e.g. "Physics Expert (India)".
    const country = title.match(/\(([A-Z][A-Za-z .]+)\)\s*$/)?.[1];
    const payMax = typeof r[HS.payMax] === "number" ? (r[HS.payMax] as number) : null;
    const posted = (r[HS.postedAt] ?? r.createdAt) as number | null;
    // Many projects are long-running pools, so the last edit says more than the post date.
    const updated = typeof r.updatedAt === "number" ? r.updatedAt : null;
    jobs.push({
      key: `handshake/${id}`,
      source: "handshake",
      id,
      title,
      company: "Handshake AI",
      domain: "",
      description:
        typeof r[HS.description] === "string" ? richTextToPlain(r[HS.description] as string) : null,
      skills: [],
      payMin: payMax,
      payMax,
      payUnit: "hr",
      commitment: "project-based",
      location: (r[HS.location] as string) || "Remote",
      postedAt: typeof posted === "number" ? new Date(posted).toISOString() : null,
      updatedAt: updated ? new Date(updated).toISOString() : null,
      applyUrl,
      eligibleCountries: country ? [country] : [],
      ineligibleCountries: [],
    });
  }
  return jobs;
}

// ---------------------------------------------------------------------------
// G2i (Ashby job board API)
// ---------------------------------------------------------------------------

interface AshbyJob {
  id: string;
  title: string;
  location: string | null;
  employmentType: string | null;
  isRemote: boolean | null;
  publishedAt: string | null;
  jobUrl: string;
  descriptionPlain: string | null;
  compensation?: {
    summaryComponents?: {
      compensationType: string;
      interval: string;
      minValue: number | null;
      maxValue: number | null;
    }[];
  };
}

const ASHBY_INTERVALS: Record<string, string> = {
  "1 HOUR": "hr",
  "1 YEAR": "yr",
  "1 MONTH": "mo",
};

async function fetchG2i(): Promise<Job[]> {
  const body = await fetchText(
    "https://api.ashbyhq.com/posting-api/job-board/g2i?includeCompensation=true",
  );
  const { jobs } = JSON.parse(body) as { jobs: AshbyJob[] };
  return jobs.map((j) => {
    const pay = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary");
    // "Remote" means anywhere; anything else is the country or region the role is limited to.
    const region = j.location && !/^remote$/i.test(j.location.trim()) ? j.location.trim() : null;
    return {
      key: `g2i/${j.id}`,
      source: "g2i" as const,
      id: j.id,
      title: j.title.trim(),
      company: "G2i",
      domain: "",
      description: j.descriptionPlain?.trim() || null,
      skills: [],
      payMin: pay?.minValue ?? null,
      payMax: pay?.maxValue ?? null,
      payUnit: pay ? (ASHBY_INTERVALS[pay.interval] ?? "") : "",
      commitment: j.employmentType === "FullTime" ? "full-time" : (j.employmentType?.toLowerCase() ?? null),
      location: j.location ?? "Remote",
      postedAt: j.publishedAt,
      applyUrl: j.jobUrl,
      eligibleCountries: region ? [region] : [],
      ineligibleCountries: [],
    };
  });
}
