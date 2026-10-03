import { checkPassword, startSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as { username?: string; password?: string };
  const username = checkPassword(body.username ?? "", body.password ?? "");
  if (!username) {
    return Response.json({ error: "Wrong username or password." }, { status: 401 });
  }
  await startSession(username);
  return Response.json({ ok: true });
}
