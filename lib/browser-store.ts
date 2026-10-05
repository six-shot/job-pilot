"use client";

import { deepPlainDashes } from "./format";
import type { StoredAnswer, StoredLetter, StoredTailor } from "./types";

/**
 * Each person's CV, tailored CVs and applied list live in their own browser,
 * namespaced by username so two people sharing a browser stay separate.
 * Every access is guarded: storage can be unavailable (private windows, blocked site data).
 */
const key = (user: string, name: string) => `jobpilot:${user}:${name}`;

function read<T>(user: string, name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(user, name));
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(user: string, name: string, value: unknown) {
  try {
    localStorage.setItem(key(user, name), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const getResume = (user: string) => read<string | null>(user, "resume", null);
export const saveResume = (user: string, text: string) => write(user, "resume", text);

// CVs and letters saved before dashes were banned are cleaned as they are read.
export const getAllTailored = (user: string) =>
  deepPlainDashes(read<Record<string, StoredTailor>>(user, "tailored", {}));
export const getTailored = (user: string, jobKey: string) => getAllTailored(user)[jobKey] ?? null;
export function saveTailored(user: string, entry: StoredTailor) {
  return write(user, "tailored", { ...getAllTailored(user), [entry.jobKey]: entry });
}

export const getLetter = (user: string, jobKey: string) =>
  deepPlainDashes(read<Record<string, StoredLetter>>(user, "letters", {})[jobKey] ?? null);
export function saveLetter(user: string, entry: StoredLetter) {
  const all = read<Record<string, StoredLetter>>(user, "letters", {});
  return write(user, "letters", { ...all, [entry.jobKey]: entry });
}

export const getAnswers = (user: string, jobKey: string) =>
  read<Record<string, StoredAnswer[]>>(user, "answers", {})[jobKey] ?? [];
export function saveAnswers(user: string, jobKey: string, answers: StoredAnswer[]) {
  const all = read<Record<string, StoredAnswer[]>>(user, "answers", {});
  return write(user, "answers", { ...all, [jobKey]: answers });
}

export const getApplied = (user: string) => read<Record<string, string>>(user, "applied", {});
export function setApplied(user: string, jobKey: string, applied: boolean) {
  const all = getApplied(user);
  if (applied) all[jobKey] = new Date().toISOString();
  else delete all[jobKey];
  write(user, "applied", all);
}

/** Pulls in a CV and tailored CVs saved as files on this computer, the first time only. */
export async function importLocalFilesOnce(user: string) {
  if (getResume(user) !== null) return false;
  try {
    const res = await fetch("/api/resume");
    if (!res.ok) return false;
    const body = (await res.json()) as { text: string; tailored: StoredTailor[] };
    if (!body.text) return false;
    saveResume(user, body.text);
    for (const entry of body.tailored) saveTailored(user, entry);
    return true;
  } catch {
    return false;
  }
}
