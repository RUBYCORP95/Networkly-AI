import { requireConsultant } from "../../lib/auth/consultant";
import {redirect} from "next/navigation";
import {createServerSupabase} from "../../lib/supabase/server";
export const metadata={title:"Mon secteur · TESAMI"};
export default async function Layout({children}){const supabase=await createServerSupabase();const access = await requireConsultant(supabase);
  if (access.status === 401) redirect("/login?next=/secteur");
  if (!access.ok) redirect("/");return children;}
