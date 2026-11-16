"use client";
import {useEffect,useState} from "react";
import Link from "next/link";

const panel={padding:20,border:"1px solid #e3dff0",borderRadius:16,background:"#fff",marginBottom:18};
export default function KlaviyoImport(){
 const [json,setJson]=useState(""),[parsed,setParsed]=useState(null),[report,setReport]=useState(null),[existing,setExisting]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function load(){
  const r=await fetch("/api/leads/admin/klaviyo",{cache:"no-store"});
  const d=await r.json();if(!r.ok)throw new Error(d.error||"Accès impossible");setExisting(d);
 }
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 function rows(){
  const value=JSON.parse(json);
  if(!Array.isArray(value))throw new Error("Le fichier doit contenir un tableau JSON de contacts.");
  if(value.length<1||value.length>200)throw new Error("Prépare un lot de 1 à 200 contacts.");
  return value;
 }
 async function process(mode){
  setBusy(true);setError("");
  try{
   const data=rows();
   const r=await fetch("/api/leads/admin/klaviyo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,rows:data})});
   const result=await r.json();
   if(!r.ok)throw new Error(result.error||"Impossible de traiter le lot");
   setParsed(data);setReport({...result,mode});
   if(mode==="import")await load();
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function fileChanged(file){
  setReport(null);setParsed(null);setError("");
  if(!file)return;
  if(file.size>2*1024*1024){setError("Fichier trop volumineux (2 Mo maximum)");return}
  setJson(await file.text());
 }
 return <main style={{maxWidth:1000,margin:"30px auto",padding:20,fontFamily:"sans-serif",color:"#2a2141",background:"#f8f7fc",minHeight:"100vh"}}>
  <Link href="/leads/admin">← Administration LeadFactory</Link>
  <h1>Import privé Klaviyo</h1>
  <p>Importer uniquement les clients dont le panier est abandonné depuis au moins 60 jours et qui n'ont passé aucune nouvelle commande.</p>
  <section style={panel}><h2>Conditions obligatoires</h2>
   <ul><li>Email valide</li><li>Numéro de téléphone (8 chiffres minimum)</li><li>Ville <strong>ou</strong> département</li><li>Date du dernier panier abandonné datant d'au moins 60 jours</li><li>Historique des commandes revérifié au cours des 24 dernières heures, sans commande postérieure au panier</li></ul>
   <p><strong>Confidentialité :</strong> les fiches restent dans une table privée réservée à l'administrateur et ne sont jamais ajoutées à la distribution automatique de prospects.</p>
  </section>
  <section style={panel}>
   <h2>Charger un lot (JSON)</h2>
   <p>Utilise des lignes provenant d'un export Klaviyo enrichi des dates d'événements vérifiées. Un export de profils classique ne suffit pas à vérifier l'absence de commande.</p>
   <input aria-label="Fichier JSON de contacts" type="file" accept=".json,application/json" onChange={e=>fileChanged(e.target.files?.[0])}/>
   <details style={{marginTop:12}}><summary>Format attendu</summary><pre style={{fontSize:12,whiteSpace:"pre-wrap"}}>{JSON.stringify([{klaviyo_profile_id:"ID_PROFIL",email:"contact@example.com",phone:"+33612345678",city:"Lyon",department:"69",last_abandoned_at:"2026-08-01T11:00:00Z",last_order_at:null,orders_checked_at:"2026-11-16T09:00:00Z",consent_status:"unknown"}],null,2)}</pre></details>
   <textarea aria-label="Contenu JSON" value={json} onChange={e=>{setJson(e.target.value);setReport(null)}} placeholder="Colle ici un tableau JSON de contacts..." rows={6} style={{width:"100%",marginTop:12,boxSizing:"border-box",border:"1px solid #c5bbdf",borderRadius:10,padding:12}}/>
   <div style={{display:"flex",gap:10,marginTop:12,flexWrap:"wrap"}}>
    <button type="button" disabled={busy||!json.trim()} onClick={()=>process("preview")} style={{padding:"12px 16px",border:"1px solid #6945c0",borderRadius:10,background:"#fff",color:"#6945c0",cursor:"pointer"}}>Vérifier l'éligibilité</button>
    <button type="button" disabled={busy||!report||report.mode!=="preview"||!report.eligible||JSON.stringify(parsed)!==JSON.stringify((()=>{try{return rows()}catch{return null}})())} onClick={()=>process("import")} style={{padding:"12px 16px",border:0,borderRadius:10,background:"#6945c0",color:"#fff",cursor:"pointer"}}>Importer les contacts admissibles</button>
   </div>
  </section>
  {error&&<p role="alert" style={{color:"#ad2438"}}>{error}</p>}
  {report&&<section style={panel}><h2>Résultat {report.mode==="preview"?"de la vérification":"de l'import"}</h2>
   <p><strong>{report.mode==="preview"?report.eligible:report.imported}</strong> contacts {report.mode==="preview"?"admissibles":"importés dans la base privée"} · {report.rejected?.length||0} rejetés.</p>
   {report.rejected?.length>0&&<details><summary>Motifs des rejets</summary><ul>{report.rejected.slice(0,50).map((x,i)=><li key={i}>Ligne {x.row} : {x.reason}</li>)}</ul></details>}
  </section>}
  <section style={panel}><h2>Contacts privés déjà enregistrés : {existing?.count??"—"}</h2>
   <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}><thead><tr><th>Nom</th><th>Ville / Département</th><th>Téléphone</th><th>Email</th></tr></thead><tbody>{(existing?.contacts||[]).map(c=><tr key={c.id}><td style={{padding:8}}>{[c.first_name,c.last_name].filter(Boolean).join(" ")||"—"}</td><td style={{padding:8}}>{[c.city,c.department].filter(Boolean).join(" · ")}</td><td style={{padding:8}}>{c.phone}</td><td style={{padding:8}}>{c.email}</td></tr>)}</tbody></table></div>
   {!existing?.count&&<p>Aucun client importé pour le moment.</p>}
  </section>
 </main>;
}
