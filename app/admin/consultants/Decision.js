"use client";

import { useActionState, useState } from "react";
import { decide } from "./actions";

const messages = {
  invalid: "La confirmation est invalide.",
  error: "La décision n’a pas été enregistrée. Réessaie.",
  stale: "Cette demande a changé. Actualise la page avant de réessayer.",
  saved: "Décision enregistrée.",
};

export default function Decision({ request }) {
  const [decision, setDecision] = useState("");
  const [state, action, pending] = useActionState(decide, null);
  if (decision) return <form action={action}>
    <input type="hidden" name="user" value={request.user_id} />
    <input type="hidden" name="version" value={request.updated_at} />
    <input type="hidden" name="decision" value={decision} />
    <p>{decision === "verified" ? "Valider" : "Refuser"} la demande CHOGAN <strong>{request.consultant_identifier}</strong> ?</p>
    <input type="hidden" name="confirmed" value="yes" />
    {state && <p role="status">{messages[state.result]}</p>}
    <button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Confirmer"}</button>{" "}
    <button type="button" disabled={pending} onClick={() => setDecision("")}>Annuler</button>
  </form>;
  return <div>
    <button type="button" onClick={() => setDecision("verified")}>Valider</button>{" "}
    <button type="button" onClick={() => setDecision("rejected")}>Refuser</button>
  </div>;
}
