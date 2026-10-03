# JobPilot

Pulls live software roles from Mercor, micro1, Handshake AI and G2i, keeps the ones that fit your CV, and tailors the CV to any role with Claude.

## Run

```bash
npm run dev
```

Open http://localhost:3000 (or whatever port the dev server prints).

## Accounts

Only the people listed in `JOBPILOT_USERS` can sign in; there is no sign-up page. Set it in `.env.local` (or in your host's environment variables when deployed):

```
JOBPILOT_USERS=okhuomon:your-password;friend:his-password
SESSION_SECRET=any-long-random-string
```

Restart the dev server after editing. Each person's CV, tailored CVs and applied list are saved in their own browser.

## CV tailoring

With `ANTHROPIC_API_KEY` set, tailoring uses API credits. Without it, the app calls Claude Code on this computer, which runs on your Claude subscription (sign it in once):

```bash
"$(ls -d ~/Library/Application\ Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude | tail -1)" auth login
```

A hosted copy has no Claude Code, so it needs the API key.

## Where things live

- `lib/sources.ts` – one fetcher per platform. Add a platform by writing a function that returns `Job[]` and listing it in `getAllJobs`.
- `lib/relevance.ts` – which jobs count as software roles, the fit score, and the country check (`HOME_COUNTRY`, default `NGA`).
- `lib/tailor.ts` – the Claude prompt and output schema.
- `lib/browser-store.ts` – what is saved in each person's browser.
- `data/` – files from the original single-user version; the owner's browser imports them once.
