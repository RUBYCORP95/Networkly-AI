"use client";

import Link from "next/link";
import { useState } from "react";
import { createRecoveryClient } from "../../lib/supabase/recovery";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");

  async function submit(event) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");

    try {
      const { error } = await createRecoveryClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "https://app.tesami.fr/reinitialiser-mot-de-passe",
      });

      // Use the same confirmation even when the address has no associated account.
      setStatus(error?.name === "AuthRetryableFetchError" ? "unavailable" : "sent");
    } catch {
      setStatus("unavailable");
    }
  }

  return (
    <main className="authwrap">
      <div className="authbox">
        <div className="brand dark"><img src="/tesami-logo.svg" alt="TESAMI" width="104" height="78" /></div>
        <h1>Mot de passe oublié ?</h1>
        {status === "sent" ? (
          <div className="notice" role="status">
            <p>Si un compte TESAMI est associé à cette adresse, tu recevras un lien pour réinitialiser ton mot de passe.</p>
            <p>Tu ne vois pas l’e-mail ? Vérifie le dossier <strong>Spams ou Courriers indésirables</strong>.</p>
          </div>
        ) : (
          <>
            <p>Indique l’adresse e-mail de ton compte TESAMI.</p>
            <form onSubmit={submit}>
              <label htmlFor="recovery-email">E-mail
                <input id="recovery-email" type="email" autoComplete="email" required value={email}
                  onChange={event => setEmail(event.target.value)} placeholder="toi@exemple.fr" />
              </label>
              <button className="generate" type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Envoi en cours…" : "Envoyer le lien"}
              </button>
            </form>
          </>
        )}
        {status === "unavailable" && <p className="notice" role="alert">Service indisponible. Réessaie dans un instant.</p>}
        <Link className="linkbtn" href="/login">Retour à la connexion</Link>
      </div>
    </main>
  );
}
