import { parisDate } from "../../../lib/crm/dates.mjs";
import BirthDateFields from "./BirthDateFields";
import styles from "../consultant.module.css";

export default function PublicCustomerFields({ host, requirePhone }) {
  return <>
    <label>Prénom<input name="first_name" autoComplete="given-name" maxLength={60} required /></label>
    <label>Nom<input name="last_name" autoComplete="family-name" maxLength={59} required /></label>
    <BirthDateFields name="customer_birth" max={parisDate()} required />
    <label>E-mail<input name="customer_email" type="email" autoComplete="email" maxLength={254} required /></label>
    <label>{requirePhone ? "Téléphone" : "Téléphone (facultatif)"}
      <input name="customer_phone" type="tel" autoComplete="tel" maxLength={40} required={requirePhone} />
    </label>
    <label className={styles.invoiceConfirmation}><input name="consent" type="checkbox" required />
      <span>J’accepte que mon consultant conserve mes coordonnées et ma date de naissance dans TESAMI
        pour retrouver ma fiche et gérer mes commandes{host ? ", et rattache ma fiche à cet événement" : ""}.
        Mon adresse e-mail est ajoutée à la liste « Compte client TESAMI » dans Klaviyo pour la gestion de ma fiche.</span>
    </label>
  </>;
}
