import { notFound } from "next/navigation";
import { createAdminSupabase } from "../../../lib/supabase/admin";
import { validSlug } from "../../../lib/recruitment/model.mjs";
import Simulator from "./Simulator";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Découvrir l’activité Chogan · TESAMI",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function RecruitmentPage({ params }) {
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const { data, error } = await createAdminSupabase().rpc("recruitment_public_page", { p_slug: slug });
  if (error) throw new Error("Simulation temporairement indisponible.");
  if (!data) notFound();
  return <Simulator simulation={data} slug={slug} />;
}
