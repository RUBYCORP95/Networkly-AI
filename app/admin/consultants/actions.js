"use server";

import { redirect } from "next/navigation";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { requireConsultantAdmin } from "./access";

export async function decide(form) {
  const actor = await requireConsultantAdmin();
  const user = form.get("user");
  const version = form.get("version");
  const decision = form.get("decision");
  if (typeof user !== "string" || !/^[0-9a-f-]{36}$/i.test(user) ||
      typeof version !== "string" || !Number.isFinite(Date.parse(version)) ||
      !["verified", "rejected"].includes(decision) || form.get("confirmed") !== "yes") {
    redirect("/admin/consultants?result=invalid");
  }
  const { data, error } = await createAdminSupabase().rpc("review_lead_team_membership", {
    actor_id: actor, member_id: user, expected_updated_at: version, decision,
  });
  redirect("/admin/consultants?result=" + (error ? "error" : data ? "saved" : "stale"));
}
