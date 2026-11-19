"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import styles from "../consultant.module.css";

function normalize(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export default function CustomerList({ customers }) {
  const [search, setSearch] = useState("");
  const words = normalize(search).trim().split(/\s+/).filter(Boolean);
  const results = customers.filter(({ name, email }) => {
    const value = normalize(`${name} ${email ?? ""}`);
    return words.every(word => value.includes(word));
  });
  return <section className={styles.crmDirectory} aria-labelledby="customer-list-title">
    <h2 id="customer-list-title">Fichier clients</h2>
    <label className={styles.crmSearch}>
      <span>Rechercher un client</span>
      <span><Search size={18} aria-hidden="true" />
        <input type="search" placeholder="Nom ou e-mail" value={search} onChange={event => setSearch(event.target.value)} />
      </span>
    </label>
    <p role="status" className={styles.muted}>{customers.length === 0 ? "Aucune fiche client." :
      results.length === 0 ? "Aucun client ne correspond à la recherche." : `${results.length} fiche(s)`}</p>
    {results.length > 0 && <ul className={styles.crmClientList}>
      {results.map(customer => {
        const initials = customer.name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join("").toUpperCase();
        return <li key={customer.id}>
          <Link href={"?client=" + customer.id} className={styles.crmClient}>
            <span className={styles.crmAvatar} aria-hidden="true">{initials}</span>
            <span><strong>{customer.name}</strong>{customer.email && <small>{customer.email}</small>}</span>
            <ChevronRight size={19} aria-hidden="true" />
          </Link>
        </li>;
      })}
    </ul>}
  </section>;
}
