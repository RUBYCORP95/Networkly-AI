"use server";

import { redirect } from "next/navigation";
import { requireConsultant } from "../../../lib/auth/consultant";
import { parseCents } from "../../../lib/crm/money.mjs";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { createServerSupabase } from "../../../lib/supabase/server";

const path = "/consultant/catalogue";

export async function configureCatalogue(form) {
  const client = await createServerSupabase();
  const access = await requireConsultant(client);
  if (!access.ok) redirect("/");
  const { data: seller } = await client.from("crm_seller_profiles").select("owner_id").eq("owner_id", access.user.id).maybeSingle();
  if (!seller) redirect(path + "?result=seller");

  const db = createAdminSupabase();
  const id = access.user.id;
  const catalogue = db.from("public_catalogues");
  const initialize = form.get("initialize") === "yes";
  const shipping = parseCents(form.get("shipping"));
  if (!initialize && !Number.isSafeInteger(shipping)) redirect(path + "?result=invalid");
  const { error } = initialize
    ? await catalogue.upsert({ owner_id: id }, { onConflict: "owner_id", ignoreDuplicates: true })
    : await catalogue.update({ shipping_cents: shipping }).eq("owner_id", id);
  redirect(path + (error ? "?result=failed" : "?result=saved"));
}
