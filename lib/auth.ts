import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

/**
 * Accounts are fixed and set by the owner in JOBPILOT_USERS, e.g.
 * "okhuomon:first-password;friend:second-password". There is no sign-up.
 * When it is unset (running locally for yourself) sign-in is switched off.
 */
const COOKIE = "jobpilot_session";
const SESSION_DAYS = 30;

function accounts() {
  const users = new Map<string, string>();
  for (const entry of (process.env.JOBPILOT_USERS ?? "").split(";")) {
    const at = entry.indexOf(":");
    if (at > 0) users.set(entry.slice(0, at).trim().toLowerCase(), entry.slice(at + 1).trim());
  }
  return users;
}

export const authEnabled = () => accounts().size > 0;

/** The first account listed is the owner. */
export const isOwner = (username: string) =>
  !authEnabled() || [...accounts().keys()][0] === username;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (authEnabled()) throw new Error("SESSION_SECRET must be set when JOBPILOT_USERS is set.");
  return "unused";
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Returns the canonical username when the password matches, else null. */
export function checkPassword(username: string, password: string) {
  const name = username.trim().toLowerCase();
  const expected = accounts().get(name);
  return expected !== undefined && safeEqual(password, expected) ? name : null;
}

export async function startSession(username: string) {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  const payload = `${username}.${expires}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in username; "me" when sign-in is switched off; null when signed out. */
export async function currentUser(): Promise<string | null> {
  if (!authEnabled()) return "me";
  const value = (await cookies()).get(COOKIE)?.value ?? "";
  const lastDot = value.lastIndexOf(".");
  const payload = value.slice(0, lastDot);
  const [username, expires] = payload.split(".");
  if (!username || !expires || !safeEqual(value.slice(lastDot + 1), sign(payload))) return null;
  if (Number(expires) < Date.now() || !accounts().has(username)) return null;
  return username;
}

export const unauthorized = () =>
  Response.json({ error: "Please sign in again." }, { status: 401 });
