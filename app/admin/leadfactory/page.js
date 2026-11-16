"use client";
import {useState} from "react";
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
 return <main className="adminpage"><div className="admincard"><p className="eyebrow">TESAMI LEADFACTORY</p><h1>Import Klaviyo</h1><p>Analyse des paniers abandonnés depuis au moins 60 jours, sans commande ultérieure.</p><p>Les contacts restent privés dans l'administration. Aucun prospect n'est attribué automatiquement aux consultants.</p>
 <div className="fields"><button type="button" disabled={busy} onClick={()=>run("leadfactory-klaviyo-status")}>Tester Klaviyo</button><button type="button" disabled={busy} onClick={()=>{reset();run("leadfactory-klaviyo-import")}}>Simuler le premier lot</button></div>
 {totals.batches>0&&<div className="pricepreview"><strong>Simulation cumulée — {totals.batches} lot(s)</strong><div className="fields"><div><small>Vérifiés</small><strong>{totals.checked}</strong></div><div><small>Éligibles techniques</small><strong>{totals.eligible}</strong></div><div><small>Exclus</small><strong>{totals.skipped}</strong></div></div></div>}
 {busy&&<p role="status">Vérification en cours…</p>}
 {error&&<p role="alert" className="notice">{error}</p>}
 {result&&<div className="pricepreview" aria-live="polite"><strong>{isBatch?"Dernier lot analysé":"État de la connexion"}</strong>{isBatch?<p>{result.checked} profils vérifiés, {result.eligible} éligibles, {result.skipped} exclus. Aucun contact importé.</p>:<p>{result.klaviyo_reachable?"Connexion Klaviyo opérationnelle (HTTP "+result.klaviyo_status+")":result.message||"Connexion à vérifier (HTTP "+result.klaviyo_status+")"}</p>}</div>}
 {isBatch&&cursor&&<button type="button" disabled={busy} onClick={()=>run("leadfactory-klaviyo-import",cursor)}>Analyser les 20 profils suivants</button>}
 {isBatch&&!cursor&&<p>Fin de la pagination disponible pour cette simulation.</p>}
 <p><small>Mode simulation uniquement : aucune donnée n'est enregistrée. Les résultats sont indicatifs et ne constituent pas une preuve de consentement à la prospection. Les données ne seront pas distribuées aux consultants sans vérification des droits et consentements applicables.</small></p><p><a href="/admin">Retour à l'administration</a> · <a href="/">Accueil TESAMI</a></p></div></main>
}