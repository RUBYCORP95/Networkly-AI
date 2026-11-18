import { requireActiveUser } from "./active-user";

export async function canAccessConsultantResources(supabase, userId, profile) {
  if (!profile) return false;
  if (profile.is_admin === true) return true;
  if (profile.account_status === "suspended") return false;

  const { data, error } = await supabase.from("lead_team_memberships").select("status")
    .eq("user_id", userId).maybeSingle();
  return !error && data?.status === "verified";
}

export async function requireConsultant(supabase) {
  const access = await requireActiveUser(supabase);
  if (!access.ok) return access;
  const allowed = await canAccessConsultantResources(supabase, access.user.id, access.profile);
  return allowed ? access : { ok: false, status: 403, error: "Compte consultant non validé" };
}
