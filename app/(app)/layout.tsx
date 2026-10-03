import { redirect } from "next/navigation";
import { UserProvider } from "@/components/UserContext";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignedInLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <UserProvider user={user}>{children}</UserProvider>;
}
