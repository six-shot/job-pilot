"use client";

import { useRouter } from "next/navigation";

export function SignOut({ user }: { user: string }) {
  const router = useRouter();
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <span className="ml-auto flex items-center gap-4">
      <span className="hidden text-sm text-zinc-500 sm:inline">{user}</span>
      <button
        onClick={signOut}
        className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
      >
        Sign out
      </button>
    </span>
  );
}
