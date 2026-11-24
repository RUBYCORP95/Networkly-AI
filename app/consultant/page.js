import Link from "next/link";
import { Briefcase, ChartNoAxesCombined, CalendarDays, FileText, Gift, GraduationCap, MapPin, Sparkles, Users } from "lucide-react";
import { createServerSupabase } from "../../lib/supabase/server";
import styles from "./consultant.module.css";

export const metadata = { title: "Espace Consultant · TESAMI" };

const sections = [
  { title: "Clients", links: [
    ["/consultant/clients", "Mes clients et rappels", "Gère tes fiches, anniversaires et relances.", Users],
    ["/consultant/factures", "Toutes mes factures", "Importe, classe et exporte tes factures.", FileText],
    ["/consultant/analytique", "Analytique & Finances", "Suis tes ventes, tes dépenses et tes commissions Chogan.", ChartNoAxesCombined],
  ] },
  { title: "Hôte / Hôtesse", links: [
    ["/consultant/hotes", "Hôte / Hôtesse", "Gère les réunions et mallettes, les commandes et les cadeaux.", Users],
  ] },
  { title: "Prospection", links: [
    ["/consultant/recrutement", "Recrutement intelligent", "Crée et suis des simulations personnalisées pour tes prospects.", Sparkles],
    ["/leadfactory", "Trouver des clients", "Recherche des clients CHOGAN et des prospects professionnels.", Users],
    ["/consultant/rendez-vous", "Calendrier des rendez-vous", "Planifie tes échanges avec tes prospects.", CalendarDays],
  ] },
  { title: "Merch", links: [
    ["/consultant/merch", "Objets personnalisables", "Découvre les vêtements et accessoires à personnaliser avec ton logo ou ton prénom.", Gift],
  ] },
  { title: "Ressources", links: [
    ["/documents", "Documents", "Consulte les documents partagés par ton équipe.", FileText],
    ["/formations", "Formations", "Retrouve les vidéos et les replays par thème.", GraduationCap],
  ] },
  { title: "Mon secteur", links: [
    ["/secteur", "Déclarer mon secteur", "Enregistre les villes dans lesquelles tu exerces.", MapPin],
  ] },
  { title: "Outils", links: [
    ["/consultant/mallettes", "Mallettes voyageuses", "Planifie les déplacements et vérifie les disponibilités.", Briefcase],
    ["/expert-parfums", "Expert Parfums", "Explore les notes et trouve des parfums à recommander.", Sparkles],
  ] },
];

export default async function ConsultantPage() {
  const { data: recruitmentAccess } = await (await createServerSupabase()).rpc("can_use_recruitment");
  return (
    <main className={styles.page}>
      <Link href="/">← Tableau de bord</Link>
      <h1>Espace Consultant</h1>
      {sections.map(section => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <div className={styles.cards}>
            {section.links.filter(([href]) => href !== "/consultant/recrutement" || recruitmentAccess).map(([href, title, description, Icon]) => (
              <Link className={styles.card} href={href} key={href}>
                <Icon size={22} aria-hidden="true" />
                <strong>{title}</strong>
                <span>{description}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
