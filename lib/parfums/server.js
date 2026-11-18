import { redirect } from "next/navigation";
import { createServerSupabase } from "../supabase/server";
import { requireActiveUser } from "../auth/active-user";
import { catalogueFields } from "./expert.mjs";

export async function perfumeSession(admin = false) {
  const supabase = await createServerSupabase();
  const session = await requireActiveUser(supabase);
  if (session.status === 401) redirect("/login");
  if (!session.ok || (admin && !session.profile.is_admin)) redirect("/");
  return { supabase, ...session };
}

export async function loadCatalogue(supabase, includeDrafts = false) {
  const catalogue = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    let query = supabase.from("expert_parfums_catalogue").select(catalogueFields).order("reference");
    if (!includeDrafts) query = query.eq("publie", true);
    const { data, error } = await query.range(start, start + pageSize - 1);
    if (error) return { catalogue: [], unavailable: true };
    catalogue.push(...data);
    if (data.length < pageSize) return { catalogue, unavailable: false };
  }
}
