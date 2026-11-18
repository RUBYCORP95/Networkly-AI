import { redirect } from "next/navigation";
import { createServerSupabase } from "../../lib/supabase/server";
export const metadata = { title: "Replays de formations · TESAMI" };
export default async function Layout({children}) {
 const supabase = await createServerSupabase();
 const {data:{user}} = await supabase.auth.getUser();
 if(!user) redirect("/login?next=/formations");
 return children;
}
