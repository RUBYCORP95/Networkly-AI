import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveUser } from "../../../lib/auth/active-user";
import { createServerSupabase } from "../../../lib/supabase/server";
import styles from "../../recrutement/recruitment.module.css";
import Settings from "./Settings";

export const metadata = { title: "Administration du recrutement · TESAMI" };

export default async function Page() {
  const account = await requireActiveUser(await createServerSupabase());
  if (account.status === 401) redirect("/login?next=/admin/recrutement");
  if (!account.ok || !account.profile.is_admin) redirect("/");
  return <main className={styles.workspace}>
    <Link href="/admin">← Administration</Link>
    <h1>Recrutement intelligent</h1>
    <Settings />
  </main>;
}
