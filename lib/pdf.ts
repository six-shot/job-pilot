"use client";

import { jsPDF } from "jspdf";
import { plainDashes } from "./format";
import type { CoverLetter, TailoredResume } from "./types";

export interface PdfFile {
  name: string;
  blob: Blob;
}

const MARGIN = 48;
const INK = 24;
const MUTED = 90;

/** The built-in PDF fonts only cover Latin text; anything else would print as garbage. */
function clean(text: string) {
  return plainDashes(text)
    .replace(/\u2192/g, "->")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0a\x20-\x7e\u00a1-\u00ff\u2018\u2019\u201c\u201d\u2022\u2026\u20ac]/g, "")
    .trim();
}

/** A top-to-bottom text writer that wraps lines and starts a new page when one fills up. */
class Page {
  readonly doc = new jsPDF({ unit: "pt", format: "a4" });
  readonly width = this.doc.internal.pageSize.getWidth() - MARGIN * 2;
  private readonly bottom = this.doc.internal.pageSize.getHeight() - MARGIN;
  y = MARGIN;

  private room(height: number) {
    if (this.y + height > this.bottom) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  gap(points: number) {
    this.y += points;
  }

  text(
    value: string,
    { size = 10, bold = false, gray = INK, indent = 0, leading = 1.35 } = {},
  ) {
    const text = clean(value);
    if (!text) return;
    this.doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(gray);
    const lineHeight = size * leading;
    for (const line of this.doc.splitTextToSize(text, this.width - indent) as string[]) {
      this.room(lineHeight);
      this.doc.text(line, MARGIN + indent, this.y + size * 0.8);
      this.y += lineHeight;
    }
  }

  /** Bold text on the left with a muted note (dates) right-aligned on the same line. */
  row(left: string, right: string) {
    const size = 10.5;
    const note = clean(right);
    this.doc.setFont("helvetica", "normal").setFontSize(9);
    const noteWidth = note ? this.doc.getTextWidth(note) + 12 : 0;
    this.doc.setFont("helvetica", "bold").setFontSize(size).setTextColor(INK);
    const lines = this.doc.splitTextToSize(clean(left), this.width - noteWidth) as string[];
    // Keep a heading with at least the first line beneath it.
    this.room(size * 1.35 * lines.length + 14);
    if (note) {
      this.doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(MUTED);
      this.doc.text(note, MARGIN + this.width, this.y + size * 0.8, { align: "right" });
    }
    this.doc.setFont("helvetica", "bold").setFontSize(size).setTextColor(INK);
    for (const line of lines) {
      this.doc.text(line, MARGIN, this.y + size * 0.8);
      this.y += size * 1.35;
    }
  }

  bullets(items: string[]) {
    for (const item of items) {
      const text = clean(item);
      if (!text) continue;
      this.doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(INK);
      const lines = this.doc.splitTextToSize(text, this.width - 14) as string[];
      lines.forEach((line, i) => {
        this.room(13.5);
        if (i === 0) this.doc.text("•", MARGIN + 3, this.y + 8);
        this.doc.text(line, MARGIN + 14, this.y + 8);
        this.y += 13.5;
      });
    }
  }

  section(title: string) {
    this.gap(12);
    this.room(40);
    this.doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(60);
    this.doc.text(title.toUpperCase(), MARGIN, this.y + 7, { charSpace: 1.1 });
    this.y += 12;
    this.doc.setDrawColor(190).setLineWidth(0.6).line(MARGIN, this.y, MARGIN + this.width, this.y);
    this.y += 5;
  }

  header(name: string, headline: string, contact: string[]) {
    this.text(name, { size: 20, bold: true, leading: 1.2 });
    this.text(headline, { size: 11, gray: 60 });
    this.gap(2);
    this.text(contact.join("  •  "), { size: 9, gray: MUTED });
  }
}

const fileName = (...parts: string[]) =>
  `${parts.map((part) => clean(part).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).join(" - ")}.pdf`;

export function resumePdf(resume: TailoredResume, company: string): PdfFile {
  const page = new Page();
  page.header(resume.name, resume.headline, resume.contact);

  page.section("Summary");
  page.text(resume.summary);

  if (resume.experience.length) {
    page.section("Professional Experience");
    resume.experience.forEach((e, i) => {
      if (i) page.gap(7);
      page.row(`${e.company}, ${e.role}`, e.dates);
      page.text(e.location, { size: 9, gray: MUTED });
      page.bullets(e.bullets);
    });
  }
  if (resume.skills.length) {
    page.section("Technical Skills");
    for (const s of resume.skills) page.text(`${s.category}: ${s.items.join(", ")}`);
  }
  if (resume.openSource.length) {
    page.section("Open Source Contributions");
    resume.openSource.forEach((o, i) => {
      if (i) page.gap(7);
      page.row(o.project, o.dates);
      for (const link of o.links) page.text(link, { size: 9, gray: MUTED });
      page.bullets(o.bullets);
    });
  }
  if (resume.education.length) {
    page.section("Education");
    resume.education.forEach((e, i) => {
      if (i) page.gap(7);
      page.row([e.title, e.institution].filter(Boolean).join(", "), e.dates);
      page.bullets(e.details);
    });
  }
  if (resume.certifications.length) {
    page.section("Certifications");
    page.bullets(resume.certifications);
  }
  if (resume.languages.length) {
    page.section("Languages");
    page.text(resume.languages.join("  •  "));
  }
  return { name: fileName(resume.name, "CV", company), blob: page.doc.output("blob") };
}

/** The letter carries the same name and contact line as the CV it goes with. */
export function letterPdf(
  letter: CoverLetter,
  from: Pick<TailoredResume, "name" | "headline" | "contact">,
  job: { title: string; company: string },
): PdfFile {
  const page = new Page();
  page.header(from.name, from.headline, from.contact);
  page.gap(28);
  page.text(
    new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    { size: 11, gray: MUTED },
  );
  page.gap(4);
  page.text(`Re: ${job.title}, ${job.company}`, { size: 11, bold: true });
  page.gap(16);
  page.text(letter.greeting, { size: 11, leading: 1.5 });
  for (const paragraph of letter.paragraphs) {
    page.gap(9);
    page.text(paragraph, { size: 11, leading: 1.5 });
  }
  page.gap(16);
  page.text(letter.signOff, { size: 11, leading: 1.5 });
  page.gap(4);
  page.text(from.name, { size: 11, bold: true });
  return {
    name: fileName(from.name, "Cover Letter", job.company),
    blob: page.doc.output("blob"),
  };
}

export function letterToText(letter: CoverLetter, name: string) {
  return [letter.greeting, ...letter.paragraphs, `${letter.signOff}\n${name}`].join("\n\n");
}

/**
 * Saves the PDF into this computer's exports folder, under a folder named after the
 * company, so every application's files sit together. Where that isn't possible
 * (a hosted copy has no disk to keep them on) it falls back to a normal browser download.
 */
export async function savePdf(file: PdfFile, company: string): Promise<string> {
  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-Company": encodeURIComponent(company),
        "X-File-Name": encodeURIComponent(file.name),
      },
      body: file.blob,
    });
    if (res.ok) return `Saved to ${((await res.json()) as { path: string }).path}`;
  } catch {
    // fall through to the browser download
  }
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
  return `Downloaded ${file.name}`;
}
