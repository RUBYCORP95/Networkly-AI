import Link from "next/link";
import { Briefcase, CalendarDays, FileText, GraduationCap, MapPin, Sparkles, Users } from "lucide-react";
import styles from "./consultant.module.css";

export const metadata = { title: "Espace Consultant · TESAMI" };

const sections = [
  { title: "Clients", links: [
    ["/consultant/clients", "Mes clients et rappels", "Gère tes fiches, anniversaires et relances.", Users],
  ] },
  { title: "Prospection", links: [
    ["/leadfactory", "LeadFactory", "Trouve et suis tes prospects.", Users],
    ["/consultant/rendez-vous", "Calendrier des rendez-vous", "Planifie tes échanges avec tes prospects.", CalendarDays],
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

export default function ConsultantPage() {
  return (
    <main className={styles.page}>
      <Link href="/">← Tableau de bord</Link>
      <h1>Espace Consultant</h1>
      {sections.map(section => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <div className={styles.cards}>
            {section.links.map(([href, title, description, Icon]) => (
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
