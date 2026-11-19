import { redirect } from "next/navigation";
import { requireConsultant } from "../../lib/auth/consultant";
import { createServerSupabase } from "../../lib/supabase/server";

export default async function ConsultantLayout({ children }) {
  const access = await requireConsultant(await createServerSupabase());
  if (access.status === 401) redirect("/login?next=/consultant");
  if (!access.ok) redirect("/");
  return children;
}
