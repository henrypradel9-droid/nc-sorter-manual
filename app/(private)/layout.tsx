import { redirect } from "next/navigation";
import { authorize, HttpError } from "@/lib/auth";
import { configured } from "@/lib/supabase";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!configured()) redirect("/login");
  const { profile, mustChangePassword } = await authorize(undefined, { allowPasswordChange: true }).catch((e) => {
    if (e instanceof HttpError) redirect("/login");
    throw e;
  });
  if (mustChangePassword) return <main className="mx-auto max-w-2xl p-6">{children}</main>;
  return <Shell profile={profile}>{children}</Shell>;
}
