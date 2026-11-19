import { NextResponse } from "next/server";
import { createAdminSupabase } from "../../../../lib/supabase/admin";
import { getConsultantAdmin } from "../access";

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) {
    return new Response("Origine de la demande invalide.", { status: 403 });
  }

  const { status, actor } = await getConsultantAdmin();
  if (status !== 200) {
    const path = status === 401 ? "/login?next=/admin/consultants" : "/";
    return NextResponse.redirect(new URL(path, request.url), 303);
  }
  const destination = new URL("/admin/consultants", request.url);
  const finish = result => {
    destination.searchParams.set("result", result);
    return NextResponse.redirect(destination, 303);
  };

  try {
    const form = await request.formData();
    const user = form.get("user");
    const version = form.get("version");
    const decision = form.get("decision");
    if (typeof user !== "string" || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(user) ||
        typeof version !== "string" || !Number.isFinite(Date.parse(version)) ||
        !["verified", "rejected"].includes(decision) || form.get("confirmed") !== "yes") {
      return finish("invalid");
    }
    const { data, error } = await createAdminSupabase().rpc("review_lead_team_membership", {
      actor_id: actor, member_id: user, expected_updated_at: version, decision,
    });
    if (error) {
      console.error("Consultant review failed", { code: error.code });
      return finish("error");
    }
    return finish(data ? "saved" : "stale");
  } catch {
    return finish("error");
  }
}
