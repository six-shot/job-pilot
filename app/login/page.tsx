"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary, card } from "@/components/ui";

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-zinc-700";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? "Something went wrong. Try again.");
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-bold tracking-tight">Sign in to JobPilot</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Accounts are set up by the owner. Ask them for your username and password.
      </p>
      <form onSubmit={submit} className={`${card} mt-6 space-y-4 p-5`}>
        <label className="block text-sm font-medium">
          Username
          <input name="username" required autoComplete="username" autoCapitalize="none" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
