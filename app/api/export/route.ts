import { mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { currentUser, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

/** Where saved CVs and cover letters go: one folder per company inside this one. */
const exportRoot = () =>
  path.resolve(process.env.EXPORT_DIR?.replace(/^~/, os.homedir()) ?? path.join(process.cwd(), "exports"));

/** A single safe path segment: no separators, no leading dots, nothing a file system rejects. */
function segment(value: string | null, fallback: string) {
  let decoded = "";
  try {
    decoded = decodeURIComponent(value ?? "");
  } catch {
    // malformed header; use the fallback
  }
  const cleaned = decoded
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

/** Writes a PDF sent by the browser to exports/<Company>/<file>. */
export async function POST(request: Request) {
  if (!(await currentUser())) return unauthorized();
  const company = segment(request.headers.get("x-company"), "Unknown company");
  const name = segment(request.headers.get("x-file-name"), "document");
  const fileName = name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES || bytes.subarray(0, 5).toString() !== "%PDF-") {
    return Response.json({ error: "That isn't a PDF this app made." }, { status: 400 });
  }

  const root = exportRoot();
  const folder = path.join(root, company);
  try {
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, fileName), bytes);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Couldn't save the file on this computer." }, { status: 500 });
  }
  const shown = root.startsWith(os.homedir()) ? `~${root.slice(os.homedir().length)}` : root;
  return Response.json({ path: path.join(shown, company, fileName) });
}
