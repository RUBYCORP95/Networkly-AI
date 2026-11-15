"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
const sectors=[["coiffure","Coiffure"],["beaute","Beauté"],["barbier","Barbiers"],["spa","Spas"],["cadeaux","Cadeaux"],["hotel","Hôtels"]];
export default function Leads(){
 const [form,setForm]=useState({city:"",radius_km:25,daily_quota:5,sectors:["coiffure","beaute"]});
 const [leads,setLeads]=useState([]),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch("/api/leads/preferences").then(r=>r.json()).then(d=>{if(d.preferences)setForm(d.preferences);else if(d.error)setNotice(d.error)}).catch(()=>setNotice("Connexion impossible"));
 fetch("/api/leads").then(r=>r.json()).then(d=>{if(d.leads)setLeads(d.leads);else if(d.error)setNotice(d.error)}).catch(()=>setNotice("Connexion impossible"));},[]);
 async function updateStatus(id,status){setNotice("");try{const r=await fetch("/api/leads/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur");setLeads(previous=>previous.map(x=>x.id===id?{...x,status}:x))}catch(e){setNotice(e.message)}}
 async function save(e){e.preventDefault();setBusy(true);setNotice("");try{const r=await fetch("/api/leads/preferences",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const d=await r.json();setNotice(r.ok?"Préférences enregistrées. La collecte automatique sera disponible après configuration d'une source de données autorisée.":d.error||"Erreur")}catch{setNotice("Erreur réseau")}finally{setBusy(false)}}
 return <main style={{maxWidth:950,margin:"30px auto",padding:24,fontFamily:"sans-serif"}}><Link href="/">← Retour à TESAMI</Link><h1>TESAMI LeadFactory</h1><p>Prospection B2B : paramètres et contacts professionnels attribués à ton compte.</p>
 <form onSubmit={save} style={{display:"grid",gap:14,padding:20,border:"1px solid #ddd",borderRadius:14}}>
 <label>Ville <input required maxLength={120} value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label>
 <label>Rayon (km) <input type="number" min="1" max="100" value={form.radius_km} onChange={e=>setForm({...form,radius_km:Number(e.target.value)})}/></label>
 <label>Objectif quotidien <input type="number" min="1" max="20" value={form.daily_quota} onChange={e=>setForm({...form,daily_quota:Number(e.target.value)})}/></label>
 <fieldset><legend>Secteurs</legend>{sectors.map(([id,name])=><label key={id} style={{display:"inline-block",margin:8}}><input type="checkbox" checked={form.sectors.includes(id)} onChange={e=>setForm({...form,sectors:e.target.checked?[...form.sectors,id]:form.sectors.filter(s=>s!==id)})}/>{name}</label>)}</fieldset>
 <button disabled={busy||!form.sectors.length} type="submit">{busy?"Enregistrement…":"Enregistrer mes préférences"}</button></form>
 {notice&&<p role="status">{notice}</p>}<h2>Mes prospects ({leads.length})</h2>
 {!leads.length&&<p>Aucun prospect attribué pour le moment. La recherche automatique n'est pas encore activée.</p>}
 {leads.map(a=>{const x=a.lead_organizations||{};return <article key={a.id} style={{border:"1px solid #ddd",borderRadius:12,padding:16,marginBottom:12}}><h3>{x.name}</h3><p>{x.sector} · {x.city}</p><label>Suivi : <select aria-label={"Statut de "+x.name} value={a.status} onChange={e=>updateStatus(a.id,e.target.value)}><option value="new">Nouveau</option><option value="contacted">Contacté</option><option value="interested">Intéressé</option><option value="converted">Client</option><option value="closed">Clôturé</option></select></label>{x.email&&<p>Email : {x.email}</p>}{x.phone&&<p>Téléphone : {x.phone}</p>}
 {x.website&&<p><a href={x.website} target="_blank" rel="noopener noreferrer">Site internet</a></p>}
 {Object.entries(x.socials||{}).map(([network,url])=>typeof url==="string"&&/^https:\/\//i.test(url)?<a key={network} href={url} target="_blank" rel="noopener noreferrer" style={{marginRight:12}}>{network}</a>:null)}
 <p><small>Source : {x.source_url} · Vérification : {x.verified_at?new Date(x.verified_at).toLocaleDateString("fr-FR"):"non vérifiée"}</small></p></article>})}
 </main>;
}
