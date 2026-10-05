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
    ["Himalayas", fetchHimalayas],
    ["Jobicy", fetchJobicy],
    ["Working Nomads", fetchWorkingNomads],
    ["We Work Remotely", fetchWeWorkRemotely],
    ["Remotive", fetchRemotive],
    ["LinkedIn", fetchLinkedIn],
    ["Hacker News", fetchHackerNews],
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
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
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

// ---------------------------------------------------------------------------
// Remote job boards
//
// These list every kind of role, so each one is queried for frontend and mobile
// work only; lib/jobs.ts then keeps the titles that really are one or the other.
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string) {
  return JSON.parse(await fetchText(url)) as T;
}

/** "LATAM,  UK,  USA" -> ["LATAM", "UK", "USA"] */
function splitRegions(value: string | null | undefined) {
  return (value ?? "")
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupe(jobs: Job[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => !seen.has(job.key) && seen.add(job.key));
}

const USD = (currency: string | null | undefined) => !currency || currency === "USD";

interface HimalayasJob {
  title: string;
  companyName: string;
  employmentType: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  salaryPeriod: string | null;
  currency: string | null;
  locationRestrictions: string[] | null;
  description: string | null;
  pubDate: number;
  applicationLink: string;
  guid: string;
}

const HIMALAYAS_QUERIES = ["frontend", "react", "react native", "mobile developer"];
const HIMALAYAS_PAGES = 5; // 20 per page
const HIMALAYAS_COUNTRY = (process.env.HOME_COUNTRY_ALPHA2 ?? "NG").toUpperCase();

async function fetchHimalayas(): Promise<Job[]> {
  // The country filter returns roles open to that country, worldwide ones included.
  const search = async (q: string) => {
    const found: HimalayasJob[] = [];
    for (let page = 1; page <= HIMALAYAS_PAGES; page++) {
      const data = await fetchJson<{ jobs: HimalayasJob[] }>(
        `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&country=${HIMALAYAS_COUNTRY}&sort=recent&page=${page}`,
      );
      found.push(...data.jobs);
      // A full page is 20, but pages can come back one short, so only stop well under that.
      if (data.jobs.length < 10) break;
    }
    return found;
  };
  const results = await Promise.allSettled(HIMALAYAS_QUERIES.map(search));
  const listings = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (listings.length === 0) {
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  }
  return dedupe(
    listings.map((j) => {
      // guid: https://himalayas.app/companies/<company>/jobs/<slug>
      const id = j.guid.replace(/^.*\/companies\//, "").replace("/jobs/", "~");
      return {
        key: `himalayas/${id}`,
        source: "himalayas" as const,
        id,
        title: j.title.trim(),
        company: j.companyName,
        domain: "",
        description: j.description ? htmlToText(j.description) : null,
        skills: [],
        payMin: USD(j.currency) ? j.minSalary : null,
        payMax: USD(j.currency) ? j.maxSalary : null,
        payUnit: j.salaryPeriod === "hourly" ? "hr" : j.salaryPeriod === "monthly" ? "mo" : "yr",
        commitment: j.employmentType?.toLowerCase() ?? null,
        location: j.locationRestrictions?.join(", ") || "Remote",
        postedAt: new Date(j.pubDate * 1000).toISOString(),
        applyUrl: j.applicationLink,
        eligibleCountries: j.locationRestrictions ?? [],
        ineligibleCountries: [],
      };
    }),
  );
}

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobType: string[] | null;
  jobGeo: string | null;
  jobDescription: string | null;
  pubDate: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
}

const JOBICY_TAGS = ["frontend", "react", "react native", "mobile"];
const JOBICY_PERIODS: Record<string, string> = { yearly: "yr", monthly: "mo", weekly: "wk", hourly: "hr" };

async function fetchJobicy(): Promise<Job[]> {
  const results = await Promise.allSettled(
    JOBICY_TAGS.map((tag) =>
      fetchJson<{ jobs?: JobicyJob[] }>(
        `https://jobicy.com/api/v2/remote-jobs?count=100&tag=${encodeURIComponent(tag)}`,
      ),
    ),
  );
  const listings = results.flatMap((r) => (r.status === "fulfilled" ? (r.value.jobs ?? []) : []));
  if (listings.length === 0) {
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  }
  return dedupe(
    listings.map((j) => {
      const paid = USD(j.salaryCurrency) && (j.salaryMin || j.salaryMax);
      return {
        key: `jobicy/${j.id}`,
        source: "jobicy" as const,
        id: String(j.id),
        title: htmlToText(j.jobTitle),
        company: htmlToText(j.companyName),
        domain: "",
        description: j.jobDescription ? htmlToText(j.jobDescription) : null,
        skills: [],
        payMin: paid ? (j.salaryMin ?? null) : null,
        payMax: paid ? (j.salaryMax ?? null) : null,
        payUnit: JOBICY_PERIODS[j.salaryPeriod ?? ""] ?? "yr",
        commitment: j.jobType?.join(", ").toLowerCase() || null,
        location: j.jobGeo ?? "Remote",
        postedAt: j.pubDate,
        applyUrl: j.url,
        eligibleCountries: splitRegions(j.jobGeo),
        ineligibleCountries: [],
      };
    }),
  );
}

interface WorkingNomadsJob {
  id: number;
  title: string;
  slug: string;
  company: string;
  description: string | null;
  position_type: string | null;
  tags: string[] | null;
  locations: string[] | null;
  pub_date: string;
  expired: boolean;
  annual_salary_usd: number | null;
}

const WORKING_NOMADS_TITLES =
  'frontend OR "front end" OR react OR "react native" OR mobile OR javascript OR typescript OR "full stack" OR fullstack OR web';
const WORKING_NOMADS_TYPES: Record<string, string> = { ft: "full-time", pt: "part-time", co: "contract" };

async function fetchWorkingNomads(): Promise<Job[]> {
  const data = await fetchJson<{ hits: { hits: { _source: WorkingNomadsJob }[] } }>(
    `https://www.workingnomads.com/jobsapi/_search?size=300&sort=pub_date:desc&q=${encodeURIComponent(
      `title:(${WORKING_NOMADS_TITLES})`,
    )}`,
  );
  return data.hits.hits
    .map((hit) => hit._source)
    .filter((j) => !j.expired)
    .map((j) => ({
      key: `workingnomads/${j.id}`,
      source: "workingnomads" as const,
      id: String(j.id),
      title: j.title.trim(),
      company: j.company,
      domain: "",
      description: j.description ? htmlToText(j.description) : null,
      skills: j.tags ?? [],
      payMin: j.annual_salary_usd,
      payMax: j.annual_salary_usd,
      payUnit: "yr",
      commitment: WORKING_NOMADS_TYPES[j.position_type ?? ""] ?? null,
      location: j.locations?.join(", ") || "Remote",
      postedAt: new Date(j.pub_date).toISOString(),
      applyUrl: `https://www.workingnomads.com/jobs/${j.slug}`,
      eligibleCountries: j.locations ?? [],
      ineligibleCountries: [],
    }));
}

const WWR_FEEDS = [
  "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
];

function xmlTag(item: string, tag: string) {
  const raw = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";
  return raw.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

async function fetchWeWorkRemotely(): Promise<Job[]> {
  const results = await Promise.allSettled(WWR_FEEDS.map(fetchText));
  const feeds = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (feeds.length === 0) throw (results[0] as PromiseRejectedResult).reason;
  const jobs: Job[] = [];
  for (const item of feeds.flatMap((xml) => xml.split("<item>").slice(1))) {
    const link = xmlTag(item, "link");
    const id = link.match(/remote-jobs\/([\w-]+)/)?.[1];
    // Titles read "Company: Role".
    const [, company, title] = htmlToText(xmlTag(item, "title")).match(/^(.*?):\s+(.*)$/) ?? [];
    if (!id || !title) continue;
    const region = htmlToText(xmlTag(item, "region"));
    const posted = new Date(xmlTag(item, "pubDate"));
    jobs.push({
      key: `weworkremotely/${id}`,
      source: "weworkremotely",
      id,
      title,
      company,
      domain: "",
      // The description is HTML that the feed escapes once more.
      description: htmlToText(htmlToText(xmlTag(item, "description"))) || null,
      skills: splitRegions(htmlToText(xmlTag(item, "skills")).replace(/,? and /, ", ")),
      payMin: null,
      payMax: null,
      payUnit: "",
      commitment: xmlTag(item, "type").toLowerCase() || null,
      location: region || "Remote",
      postedAt: Number.isNaN(posted.getTime()) ? null : posted.toISOString(),
      applyUrl: link,
      eligibleCountries: splitRegions(region),
      ineligibleCountries: [],
    });
  }
  return dedupe(jobs);
}

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  tags: string[] | null;
  job_type: string | null;
  publication_date: string;
  candidate_required_location: string | null;
  description: string | null;
}

async function fetchRemotive(): Promise<Job[]> {
  const { jobs } = await fetchJson<{ jobs: RemotiveJob[] }>("https://remotive.com/api/remote-jobs");
  return jobs.map((j) => ({
    key: `remotive/${j.id}`,
    source: "remotive" as const,
    id: String(j.id),
    title: j.title.trim(),
    company: j.company_name.trim(),
    domain: "",
    description: j.description ? htmlToText(j.description) : null,
    skills: j.tags ?? [],
    payMin: null,
    payMax: null,
    payUnit: "",
    commitment: j.job_type?.replace(/_/g, "-") ?? null,
    location: j.candidate_required_location || "Remote",
    postedAt: `${j.publication_date}Z`,
    applyUrl: j.url,
    eligibleCountries: splitRegions(j.candidate_required_location),
    ineligibleCountries: [],
  }));
}

// ---------------------------------------------------------------------------
// LinkedIn
//
// The public job search that LinkedIn shows to signed-out visitors, read as HTML.
// It is fetched gently (few pages, results kept for an hour) because LinkedIn
// blocks clients that ask too often.
// ---------------------------------------------------------------------------

const LINKEDIN_SEARCH = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const LINKEDIN_KEYWORDS = ["frontend developer", "react developer", "react native developer", "mobile developer"];
/** Jobs based in the home country, plus remote ones (f_WT=2) open across the wider region. */
const LINKEDIN_PLACES = [
  { location: process.env.HOME_COUNTRY_FULL_NAME ?? "Nigeria", remote: false, pages: 4 },
  { location: "Africa", remote: true, pages: 1 },
  { location: "EMEA", remote: true, pages: 1 },
]; // 10 results per page
const LINKEDIN_CACHE_MS = 60 * 60 * 1000;

let linkedInCache: { at: number; jobs: Job[] } | null = null;

function parseLinkedInCards(html: string, remote: boolean): Job[] {
  const jobs: Job[] = [];
  for (const card of html.split("<li>").slice(1)) {
    const pick = (re: RegExp) => htmlToText(card.match(re)?.[1] ?? "");
    const id = card.match(/urn:li:jobPosting:(\d+)/)?.[1];
    const title = pick(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/);
    if (!id || !title) continue;
    const location = pick(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/);
    const posted = card.match(/datetime="([^"]+)"/)?.[1];
    jobs.push({
      key: `linkedin/${id}`,
      source: "linkedin",
      id,
      title,
      company: pick(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/) || "Company on LinkedIn",
      domain: "",
      description: null, // fetched with the job's own page
      skills: [],
      payMin: null,
      payMax: null,
      payUnit: "",
      commitment: null,
      location: remote ? `${location} (remote)` : location,
      postedAt: posted ? new Date(posted).toISOString() : null,
      applyUrl: `https://www.linkedin.com/jobs/view/${id}`,
      // A LinkedIn "remote" role is still tied to the place it is listed in.
      eligibleCountries: location ? [location] : [],
      ineligibleCountries: [],
    });
  }
  return jobs;
}

async function fetchLinkedIn(): Promise<Job[]> {
  if (linkedInCache && Date.now() - linkedInCache.at < LINKEDIN_CACHE_MS) return linkedInCache.jobs;
  const found: Job[] = [];
  let failure: unknown = null;
  // One search at a time: parallel requests are what gets a client blocked.
  for (const place of LINKEDIN_PLACES) {
    for (const keywords of LINKEDIN_KEYWORDS) {
      for (let page = 0; page < place.pages; page++) {
        const query = new URLSearchParams({
          keywords,
          location: place.location,
          f_TPR: "r2592000", // posted in the last 30 days
          sortBy: "DD",
          start: String(page * 10),
          ...(place.remote ? { f_WT: "2" } : {}),
        });
        try {
          const cards = parseLinkedInCards(await fetchText(`${LINKEDIN_SEARCH}?${query}`), place.remote);
          found.push(...cards);
          if (cards.length < 10) break;
        } catch (error) {
          failure = error;
          break;
        }
      }
    }
  }
  if (found.length === 0) {
    // Blocked or down: keep showing the last good set rather than nothing.
    if (linkedInCache) return linkedInCache.jobs;
    if (failure) throw failure;
  }
  linkedInCache = { at: Date.now(), jobs: dedupe(found) };
  return linkedInCache.jobs;
}

const linkedInDetails = new Map<string, Pick<Job, "description" | "commitment">>();

/** The description and employment type, which only the posting's own page carries. */
export async function getLinkedInDetail(id: string) {
  const hit = linkedInDetails.get(id);
  if (hit) return hit;
  const html = await fetchText(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`);
  const description = htmlToText(
    html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "",
  );
  if (!description) return null;
  const criteria = [...html.matchAll(/description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/g)].map(
    (m) => htmlToText(m[1]),
  );
  const detail = {
    description,
    commitment: criteria.find((c) => /time|contract|temporary|intern/i.test(c))?.toLowerCase() ?? null,
  };
  linkedInDetails.set(id, detail);
  return detail;
}

// ---------------------------------------------------------------------------
// Hacker News "Who is hiring?"
//
// A monthly thread where each top-level comment is one company's posting,
// usually headed "Company | Role | Location | Remote". Read through the Algolia API.
// ---------------------------------------------------------------------------

interface HnComment {
  objectID: string;
  author: string;
  comment_text: string | null;
  created_at: string;
  parent_id: number;
}

const HN_API = "https://hn.algolia.com/api/v1/search_by_date";
const HN_ROLE = /engineer|developer|\bdev\b|programmer/i;
const HN_OPEN_TO_ALL = /worldwide|global|anywhere|\bafrica\b|\bemea\b|nigeria/i;

async function fetchHackerNews(): Promise<Job[]> {
  const threads = await fetchJson<{ hits: { objectID: string; title: string }[] }>(
    `${HN_API}?tags=story,author_whoishiring&hitsPerPage=6`,
  );
  const thread = threads.hits.find((hit) => /who is hiring/i.test(hit.title));
  if (!thread) return [];
  const { hits } = await fetchJson<{ hits: HnComment[] }>(
    `${HN_API}?tags=comment,story_${thread.objectID}&hitsPerPage=1000`,
  );
  const jobs: Job[] = [];
  for (const comment of hits) {
    // Replies to a posting are not postings.
    if (String(comment.parent_id) !== thread.objectID || !comment.comment_text) continue;
    const text = htmlToText(comment.comment_text.replace(/<p>/g, "\n\n"));
    const parts = text.split("\n")[0].split("|").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    // A header can list several roles; take the one in the candidate's lane if there is one.
    const roles = parts.slice(1).filter((part) => HN_ROLE.test(part) && part.length < 90);
    const title =
      roles.find((role) => /front|react|web|mobile|full[\s-]?stack|\bui\b/i.test(role)) ?? roles[0];
    if (!title) continue;
    const where = parts.find((part) => /remote|onsite|on-site|hybrid/i.test(part) && part !== title) ?? "";
    const remote = /remote/i.test(text) && !/no remote|not remote/i.test(text);
    jobs.push({
      key: `hackernews/${comment.objectID}`,
      source: "hackernews",
      id: comment.objectID,
      title,
      company: parts[0].replace(/\s*\(.*$/, "").slice(0, 60),
      domain: "",
      description: text,
      skills: [],
      payMin: null,
      payMax: null,
      payUnit: "",
      commitment: /full[\s-]?time/i.test(text) ? "full-time" : /contract/i.test(text) ? "contract" : null,
      location: where || (remote ? "Remote" : "See posting"),
      postedAt: comment.created_at,
      applyUrl: `https://news.ycombinator.com/item?id=${comment.objectID}`,
      // Most postings are remote within a country or onsite; only clearly global ones count as open.
      eligibleCountries:
        remote && HN_OPEN_TO_ALL.test(parts.join(" ")) ? [] : [where || "Location in posting"],
      ineligibleCountries: [],
    });
  }
  return jobs;
}
