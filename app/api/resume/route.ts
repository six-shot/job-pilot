import { extractText } from "unpdf";
import { readLocalFiles } from "@/lib/store";
import { currentUser, isOwner, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * CV and tailored CVs saved as files on this computer, for a one-time import into the
 * browser. They belong to the owner, so nobody else gets them.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(isOwner(user) ? await readLocalFiles() : { text: "", tailored: [] });
}

/** Extracts text from an uploaded PDF. Nothing is saved until the user hits Save. */
export async function POST(request: Request) {
  if (!(await currentUser())) return unauthorized();
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file received." }, { status: 400 });
  }
  try {
    const { text } = await extractText(new Uint8Array(await file.arrayBuffer()), {
      mergePages: true,
    });
    if (!text.trim()) throw new Error("empty");
    return Response.json({ text: text.trim() });
  } catch {
    return Response.json(
      { error: "Couldn't read text from that PDF. Paste the CV text instead." },
      { status: 422 },
    );
  }
}
