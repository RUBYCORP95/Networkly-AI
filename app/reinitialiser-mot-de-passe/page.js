"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createRecoveryClient } from "../../lib/supabase/recovery";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPassword() {
  const [token, setToken] = useState(undefined);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const recoveryAuth = useRef(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("token_hash"));
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!token || status === "saving") return;
    if (password !== confirmation) {
      setMessage("Les deux mots de passe doivent être identiques.");
      return;
    }
    setStatus("saving");
    setMessage("");

    try {
      if (!recoveryAuth.current) {
        const { auth } = createRecoveryClient();
        const { data, error } = await auth.verifyOtp({ token_hash: token, type: "recovery" });
        if (error?.name === "AuthRetryableFetchError" || error?.status === 429) throw error;
        if (error || !data.session) {
          setStatus("invalid");
          return;
        }
        recoveryAuth.current = auth;
        window.history.replaceState(null, "", window.location.pathname);
      }

      const { error } = await recoveryAuth.current.updateUser({ password });
      if (error) {
        if (error.status === 401 || error.code === "session_not_found") {
          setStatus("invalid");
          return;
        }
        const messages = {
          weak_password: "Choisis un mot de passe plus difficile à deviner.",
          same_password: "Choisis un mot de passe différent de l’ancien.",
        };
        setMessage(messages[error.code] ?? "Impossible d’enregistrer le mot de passe. Réessaie dans un instant.");
        setStatus("idle");
        return;
      }
      const auth = recoveryAuth.current;
      recoveryAuth.current = null;
      void auth.signOut({ scope: "local" }).catch(() => {});
      setToken(null);
      setPassword("");
      setConfirmation("");
      setStatus("success");
    } catch {
      setMessage("Service indisponible. Réessaie dans un instant.");
      setStatus("idle");
    }
  }

  const invalid = token === null || status === "invalid";

  return (
    <main className="authwrap">
      <div className="authbox">
        <div className="brand dark"><img src="/tesami-logo.svg" alt="TESAMI" width="104" height="78" /></div>
        <h1>Nouveau mot de passe</h1>
        {status === "success" ? (
          <p className="notice" role="status">Ton mot de passe a été modifié. Tu peux maintenant te reconnecter.</p>
        ) : invalid ? (
          <>
            <p role="alert">Ce lien est manquant, a expiré ou a déjà été utilisé.</p>
            <Link className="linkbtn" href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
          </>
        ) : token ? (
          <>
            <p>Choisis un mot de passe d’au moins {MIN_PASSWORD_LENGTH} caractères.</p>
            <form onSubmit={submit}>
              <label htmlFor="new-password">Nouveau mot de passe
                <input id="new-password" type="password" autoComplete="new-password" required
                  minLength={MIN_PASSWORD_LENGTH} value={password} onChange={event => setPassword(event.target.value)} />
              </label>
              <label htmlFor="password-confirmation">Confirme le mot de passe
                <input id="password-confirmation" type="password" autoComplete="new-password" required
                  minLength={MIN_PASSWORD_LENGTH} value={confirmation}
                  onChange={event => setConfirmation(event.target.value)} />
              </label>
              <button className="generate" type="submit" disabled={status === "saving"}>
                {status === "saving" ? "Enregistrement…" : "Enregistrer le mot de passe"}
              </button>
            </form>
          </>
        ) : <p role="status">Chargement…</p>}
        {message && <p className="notice" role="alert">{message}</p>}
        <Link className="linkbtn" href="/login">Retour à la connexion</Link>
      </div>
    </main>
  );
}
