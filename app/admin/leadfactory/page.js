"use client";
import {useState} from "react";
import styles from "./leadfactory.module.css";
import {createClient} from "../../../lib/supabase/client";
export default function LeadFactoryAdmin(){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState("");
 const [cursor,setCursor]=useState(null),[totals,setTotals]=useState({checked:0,eligible:0,skipped:0,batches:0});
 async function run(name,nextCursor=null){
  setBusy(true);setError("");setResult(null);
  try{
   const supabase=createClient();
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError||!session?.access_token)throw new Error("Connecte-toi avec ton compte administrateur TESAMI.");
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/"+name;
   const isImport=name==="leadfactory-klaviyo-import";
   const response=await fetch(url,{method:isImport?"POST":"GET",headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json","apikey":process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY},...(isImport?{body:JSON.stringify({commit:false,...(nextCursor?{cursor:nextCursor}:{})})}:{})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||data.message||"Erreur "+response.status);
   setResult(data);
   if(isImport){setCursor(data.next_cursor||null);setTotals(t=>({checked:t.checked+(data.checked||0),eligible:t.eligible+(data.eligible||0),skipped:t.skipped+(data.skipped||0),batches:t.batches+1}));}
  }catch(e){setError(e.message||"Erreur inconnue")}finally{setBusy(false)}
 }
 function reset(){setCursor(null);setTotals({checked:0,eligible:0,skipped:0,batches:0});setResult(null);setError("")}
 const isBatch=result&&typeof result.checked==="number";
 return <main className={styles.page}><div className={styles.wrap}>
 <header className={styles.top}><div><p className={styles.eyebrow}>TESAMI / LEADFACTORY</p><h1 className={styles.heading}>Import Klaviyo</h1><p className={styles.sub}>Retrouvez et analysez les paniers abandonnés depuis au moins 60 jours, sans commande ultérieure.</p></div><a className={styles.back} href="/">← Tableau de bord TESAMI</a></header>
 <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Connexion et simulation</h2><p className={styles.muted}>Vérifiez votre connexion Klaviyo puis analysez vos contacts, lot par lot.</p></div><span className={styles.status}><span className={styles.dot}></span>Mode simulation sécurisé</span></div>
 <div className={styles.actions}><button className={styles.button+" "+styles.secondary} type="button" disabled={busy} onClick={()=>run("leadfactory-klaviyo-status")}>Tester la connexion Klaviyo</button><button className={styles.button} type="button" disabled={busy} onClick={()=>{reset();run("leadfactory-klaviyo-import")}}>Simuler les 20 premiers profils</button></div>
 {busy&&<p role="status" className={styles.muted} style={{marginTop:16}}>Analyse en cours…</p>}{error&&<p role="alert" className={styles.notice}>{error}</p>}
 {result&&!isBatch&&<p className={styles.info} aria-live="polite">{result.klaviyo_reachable?"✓ Connexion Klaviyo opérationnelle (HTTP "+result.klaviyo_status+")":result.message||"Connexion à vérifier (HTTP "+result.klaviyo_status+")"}</p>}
 </section>
 <section aria-label="Statistiques de simulation"><div className={styles.stats}><div className={styles.stat}><p className={styles.statLabel}>Profils vérifiés</p><p className={styles.statNumber}>{totals.checked}</p></div><div className={styles.stat}><p className={styles.statLabel}>Éligibles techniques</p><p className={styles.statNumber+" "+styles.purple}>{totals.eligible}</p></div><div className={styles.stat}><p className={styles.statLabel}>Profils exclus</p><p className={styles.statNumber}>{totals.skipped}</p></div></div></section>
 <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Progression de l'analyse</h2><p className={styles.muted}>{totals.batches===0?"Lancez une simulation pour afficher les résultats.":totals.batches+" lot(s) analysé(s) • "+totals.checked+" profils examinés"}</p></div>{totals.batches>0&&<span className={styles.status}>Aucun contact importé</span>}</div>
 {isBatch&&<div style={{marginTop:20}}><p className={styles.muted}>Dernier lot : <strong>{result.checked} vérifiés</strong> · {result.eligible} éligibles · {result.skipped} exclus</p></div>}
 {isBatch&&cursor&&<div className={styles.actions}><button className={styles.button} type="button" disabled={busy} onClick={()=>run("leadfactory-klaviyo-import",cursor)}>Analyser les 20 profils suivants →</button></div>}
 {isBatch&&!cursor&&<p className={styles.info}>Tous les lots disponibles ont été parcourus.</p>}
 <div className={styles.info}>🔒 Simulation uniquement : aucune donnée personnelle n'est enregistrée ou distribuée. L'éligibilité technique ne constitue pas un consentement à la prospection par des consultants.</div>
 </section><footer className={styles.foot}><a href="/admin">Administration</a><a href="/">Accueil TESAMI</a></footer>
 </div></main>
}