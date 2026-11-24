import "server-only";
import { createServerSupabase } from "../supabase/server";
import { createAdminSupabase } from "../supabase/admin";
import { requireActiveUser } from "../auth/active-user";

export const reply = (body, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function recruitmentSession(admin = false) {
  const db = await createServerSupabase();
  const account = await requireActiveUser(db);
  if (!account.ok) return { response: reply({ error: account.error }, account.status) };
  if (admin) {
    if (!account.profile.is_admin) return { response: reply({ error: "Accès administrateur requis." }, 403) };
  } else {
    const { data, error } = await db.rpc("can_use_recruitment");
    if (error) return { response: reply({ error: "Accès temporairement indisponible." }, 503) };
    if (!data) return { response: reply({ error: "Accès au recrutement intelligent désactivé." }, 403) };
  }
  return { db, service: createAdminSupabase(), user: account.user };
}
