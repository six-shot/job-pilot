import type { ReactNode } from "react";
import type { TailoredResume } from "@/lib/types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="border-b border-zinc-300 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** Always renders dark-on-white so the preview matches what prints. */
export function ResumeView({ resume }: { resume: TailoredResume }) {
  return (
    <article className="bg-white font-sans text-[12.5px] leading-snug text-zinc-900">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{resume.name}</h1>
        <p className="mt-0.5 text-sm font-medium text-zinc-700">{resume.headline}</p>
        <p className="mt-1.5 text-xs break-words text-zinc-600">{resume.contact.join("  •  ")}</p>
      </header>

      <Section title="Summary">
        <p className="mt-2">{resume.summary}</p>
      </Section>

      {resume.experience.length > 0 && (
        <Section title="Professional Experience">
          {resume.experience.map((e, i) => (
            <div key={i} className="mt-3 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h3 className="font-semibold">
                  {e.company} — {e.role}
                </h3>
                <span className="text-xs text-zinc-600">{e.dates}</span>
              </div>
              {e.location && <p className="text-xs text-zinc-600">{e.location}</p>}
              <Bullets items={e.bullets} />
            </div>
          ))}
        </Section>
      )}

      {resume.skills.length > 0 && (
        <Section title="Technical Skills">
          <ul className="mt-2 space-y-0.5">
            {resume.skills.map((s, i) => (
              <li key={i}>
                <span className="font-semibold">{s.category}:</span> {s.items.join(", ")}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {resume.openSource.length > 0 && (
        <Section title="Open Source Contributions">
          {resume.openSource.map((o, i) => (
            <div key={i} className="mt-3 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h3 className="font-semibold">{o.project}</h3>
                <span className="text-xs text-zinc-600">{o.dates}</span>
              </div>
              {o.links.map((link) => (
                <p key={link} className="text-xs break-all text-zinc-600">
                  {link}
                </p>
              ))}
              <Bullets items={o.bullets} />
            </div>
          ))}
        </Section>
      )}

      {resume.education.length > 0 && (
        <Section title="Education">
          {resume.education.map((e, i) => (
            <div key={i} className="mt-3 break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <h3 className="font-semibold">
                  {[e.title, e.institution].filter(Boolean).join(" — ")}
                </h3>
                <span className="text-xs text-zinc-600">{e.dates}</span>
              </div>
              <Bullets items={e.details} />
            </div>
          ))}
        </Section>
      )}

      {resume.certifications.length > 0 && (
        <Section title="Certifications">
          <div className="mt-1">
            <Bullets items={resume.certifications} />
          </div>
        </Section>
      )}

      {resume.languages.length > 0 && (
        <Section title="Languages">
          <p className="mt-2">{resume.languages.join("  •  ")}</p>
        </Section>
      )}
    </article>
  );
}
