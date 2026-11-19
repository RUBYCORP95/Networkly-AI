"use client";

import { useState } from "react";
import { decide } from "./actions";

export default function Decision({ request }) {
  const [decision, setDecision] = useState("");
  if (decision) return <form action={decide}>
    <input type="hidden" name="user" value={request.user_id} />
    <input type="hidden" name="version" value={request.updated_at} />
    <input type="hidden" name="decision" value={decision} />
    <p>{decision === "verified" ? "Valider" : "Refuser"} la demande CHOGAN <strong>{request.consultant_identifier}</strong> ?</p>
    <button name="confirmed" value="yes">Confirmer</button>{" "}
    <button type="button" onClick={() => setDecision("")}>Annuler</button>
  </form>;
  return <div>
    <button type="button" onClick={() => setDecision("verified")}>Valider</button>{" "}
    <button type="button" onClick={() => setDecision("rejected")}>Refuser</button>
  </div>;
}
