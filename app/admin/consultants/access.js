import "server-only";
import { redirect } from "next/navigation";
import { requireActiveUser } from "../../../lib/auth/active-user";
import { createServerSupabase } from "../../../lib/supabase/server";

export async function requireConsultantAdmin() {
  const access = await requireActiveUser(await createServerSupabase());
  if (access.status === 401) redirect("/login?next=/admin/consultants");
  if (!access.ok || access.profile.is_admin !== true || access.profile.account_status === "suspended") redirect("/");
  return access.user.id;
}
