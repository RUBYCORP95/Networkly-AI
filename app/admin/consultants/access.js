import "server-only";
import { redirect } from "next/navigation";
import { requireActiveUser } from "../../../lib/auth/active-user";
import { createServerSupabase } from "../../../lib/supabase/server";

export async function getConsultantAdmin() {
  const access = await requireActiveUser(await createServerSupabase());
  if (access.status === 401) return { status: 401 };
  if (!access.ok || access.profile.is_admin !== true || access.profile.account_status === "suspended") {
    return { status: 403 };
  }
  return { status: 200, actor: access.user.id };
}

export async function requireConsultantAdmin() {
  const { status, actor } = await getConsultantAdmin();
  if (status === 401) redirect("/login?next=/admin/consultants");
  if (status !== 200) redirect("/");
  return actor;
}
