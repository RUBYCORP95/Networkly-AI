"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import styles from "../consultant/consultant.module.css";

const extensions = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);

export default function TeamVisualUpload() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();

  async function upload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("image");
    const title = String(values.get("title") ?? "").trim();
    const extension = extensions.get(file?.type);
    if (!extension || !file.size || file.size > 5 * 1024 * 1024 || !title) {
      setMessage("Choisis une image JPG, PNG ou WebP de 5 Mo maximum et ajoute un titre.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const slug = title.normalize("NFD").replace(/\p{M}/gu, "")
        .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug) {
        setMessage("Ajoute un titre contenant au moins une lettre ou un chiffre.");
        return;
      }
      const { error } = await createClient().storage.from("team-visuals")
        .upload(crypto.randomUUID() + "_" + slug + "." + extension, file);
      if (error) {
        setMessage("L’import a échoué. Vérifie le fichier, puis réessaie.");
        return;
      }
      form.reset();
      setMessage("Visuel ajouté.");
      router.refresh();
    } catch {
      setMessage("L’import a échoué. Réessaie dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className={styles.form} onSubmit={upload}>
        <label>Titre<input name="title" maxLength={80} required /></label>
        <label>Image<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label>
        <button disabled={busy}>{busy ? "Import en cours…" : "Importer un visuel"}</button>
      </form>
      {message && <p role="status">{message}</p>}
    </>
  );
}
