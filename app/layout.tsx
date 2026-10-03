import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SignOut } from "@/components/SignOut";
import { authEnabled, currentUser } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JobPilot",
  description: "Software roles on Mercor, micro1, Handshake AI and G2i, with a CV tailored to each one.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = authEnabled() ? await currentUser() : null;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-zinc-200 bg-white print:hidden dark:border-zinc-800 dark:bg-zinc-900">
          <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:gap-6">
            <Link href="/" className="text-base font-bold tracking-tight">
              JobPilot
            </Link>
            <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">
              Jobs
            </Link>
            <Link href="/resume" className="text-sm text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">
              My CV
            </Link>
            {user && <SignOut user={user} />}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 print:max-w-none print:p-0">
          {children}
        </main>
      </body>
    </html>
  );
}
