"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@/components/UserContext";
import { Pill, buttonPrimary, buttonSecondary, card } from "@/components/ui";
import { getResume, importLocalFilesOnce, saveResume } from "@/lib/browser-store";
import { resumeSkills } from "@/lib/relevance";

export default function ResumePage() {
  const user = useUser();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (cancelled) return;
      const stored = getResume(user) ?? "";
      setText(stored);
      setSaved(stored);
      setSkills(resumeSkills(stored));
    };
    load();
    void importLocalFilesOnce(user).then((imported) => imported && load());
    return () => {
      cancelled = true;
    };
  }, [user]);

  function save() {
    setMessage(null);
    if (!text.trim()) {
      setMessage({ kind: "error", text: "The CV can't be empty." });
      return;
    }
    if (saveResume(user, text)) {
      setSaved(text);
      setSkills(resumeSkills(text));
      setMessage({ kind: "ok", text: "Saved in this browser. Job matching and tailoring now use this version." });
    } else {
      setMessage({ kind: "error", text: "This browser blocked saving. Turn off private browsing and try again." });
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/resume", { method: "POST", body: form });
    const body = await res.json();
    if (res.ok) {
      setText(body.text);
      setMessage({ kind: "ok", text: "PDF text loaded below. Check it, then save." });
    } else setMessage({ kind: "error", text: body.error ?? "Couldn't read that file." });
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  const dirty = text !== saved;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My CV</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            This is your master copy, saved in this browser. Every tailored CV is built only from
            what is written here, so keep it complete and accurate.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <button onClick={() => fileInput.current?.click()} disabled={busy} className={buttonSecondary}>
            Replace from PDF
          </button>
          <button onClick={save} disabled={busy || !dirty} className={buttonPrimary}>
            {dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-4 rounded-lg p-3 text-sm ${
            message.kind === "ok"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}

      {skills.length > 0 && (
        <div className={`${card} mt-4 p-4`}>
          <h2 className="text-sm font-semibold">Skills used to rank jobs</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <Pill key={skill} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {skill}
              </Pill>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="CV text"
        spellCheck={false}
        className={`${card} mt-4 h-[70vh] w-full resize-y p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-emerald-600`}
      />
    </div>
  );
}
