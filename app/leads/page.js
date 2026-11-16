"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
const contactLink={display:"inline-flex",alignItems:"center",padding:"8px 12px",border:"1px solid #ddd",borderRadius:8,textDecoration:"none"};
const sectors=[["coiffure","Coiffure"],["beaute","Beauté"],["barbier","Barbiers"],["spa","Spas"],["cadeaux","Cadeaux"],["hotel","Hôtels"]];
export default function Leads(){
 const [form,setForm]=useState({city:"",radius_km:25,daily_quota:5,sectors:["coiffure","beaute"]});
 const [expandedContact,setExpandedContact]=useState(null),[openingContact,setOpeningContact]=useState(null);
 const [leads,setLeads]=useState([]),[membership,setMembership]=useState(null),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch("/api/leads/team").then(r=>r.ok?r.json():null).then(d=>{if(d)setMembership(d.membership)}).catch(()=>{});
 fetch("/api/leads/preferences").then(r=>r.json()).then(d=>{if(d.preferences)setForm(d.preferences);else if(d.error)setNotice(d.error)}).catch(()=>setNotice("Connexion impossible"));
 fetch("/api/leads").then(r=>r.json()).then(d=>{if(d.leads)setLeads(d.leads);else if(d.error)setNotice(d.error)}).catch(()=>setNotice("Connexion impossible"));},[]);
 async function openContact(id){
  if(expandedContact===id){setExpandedContact(null);return}
  const current=leads.find(a=>a.id===id);if(!current)return;
  if(current.revealed_at){setExpandedContact(id);return}
  setOpeningContact(id);setNotice("");
  try{
   const response=await fetch("/api/leads/contact",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({assignment_id:id})});
   const data=await response.json();
   if(!response.ok){if(response.status===410)setLeads(items=>items.filter(a=>a.id!==id));throw new Error(data.error||"Impossible de débloquer les coordonnées")}
   setLeads(items=>items.map(a=>a.id===id?{...a,revealed_at:data.revealed_at,lead_organizations:{...a.lead_organizations,...data.contact}}:a));
   setExpandedContact(id);
  }catch(error){setNotice(error.message)}finally{setOpeningContact(null)}
 }
 async function updateStatus(id,status){setNotice("");try{const r=await fetch("/api/leads/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur");setLeads(previous=>previous.map(x=>x.id===id?{...x,status}:x))}catch(e){setNotice(e.message)}}
 async function save(e){e.preventDefault();setBusy(true);setNotice("");try{const r=await fetch("/api/leads/preferences",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const d=await r.json();setNotice(r.ok?"Préférences enregistrées. La collecte automatique sera disponible après configuration d'une source de données autorisée.":d.error||"Erreur")}catch{setNotice("Erreur réseau")}finally{setBusy(false)}}
 return <main style={{maxWidth:950,margin:"30px auto",padding:24,fontFamily:"sans-serif"}}><Link href="/">← Retour à TESAMI</Link><h1>TESAMI LeadFactory</h1><p>Prospection B2B : paramètres et contacts professionnels attribués à ton compte.</p><nav style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:20}}><Link href="/leads/team">Vérifier mon accès gratuit Chogan</Link><Link href="/leads/admin">Administration LeadFactory</Link></nav>{membership?.status==="verified"&&<p role="status">Accès gratuit équipe Chogan vérifié.</p>}{membership?.status==="pending"&&<p role="status">Validation de ton équipe Chogan en attente.</p>}{membership?.status==="rejected"&&<p role="status">Demande de vérification refusée. Tu peux faire une nouvelle demande.</p>}{membership?.status==="revoked"&&<p role="status">Accès gratuit révoqué. Tu peux solliciter une nouvelle vérification.</p>}
 <form onSubmit={save} style={{display:"grid",gap:14,padding:20,border:"1px solid #ddd",borderRadius:14}}>
 <label>Ville <input required maxLength={120} value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label>
 <label>Rayon (km) <input type="number" min="1" max="100" value={form.radius_km} onChange={e=>setForm({...form,radius_km:Number(e.target.value)})}/></label>
 <label>Objectif quotidien <input type="number" min="1" max="20" value={form.daily_quota} onChange={e=>setForm({...form,daily_quota:Number(e.target.value)})}/></label>
 <fieldset><legend>Secteurs</legend>{sectors.map(([id,name])=><label key={id} style={{display:"inline-block",margin:8}}><input type="checkbox" checked={form.sectors.includes(id)} onChange={e=>setForm({...form,sectors:e.target.checked?[...form.sectors,id]:form.sectors.filter(s=>s!==id)})}/>{name}</label>)}</fieldset>
 <button disabled={busy||!form.sectors.length} type="submit">{busy?"Enregistrement…":"Enregistrer mes préférences"}</button></form>
 {notice&&<p role="status">{notice}</p>}<h2>Mes prospects ({leads.length})</h2>
 {!leads.length&&<p>Aucun prospect attribué pour le moment. La recherche automatique n'est pas encore activée.</p>}
 {leads.map(a=>{
 const x=a.lead_organizations||{},unlocked=Boolean(a.revealed_at);
 const hoursRemaining=Math.max(0,Math.ceil((new Date(a.contact_deadline).getTime()-Date.now())/3600000));
 const links=[
  x.email&&<a key="email" style={contactLink} href={"mailto:"+x.email}>Email</a>,
  x.phone&&<a key="phone" style={contactLink} href={"tel:"+x.phone.replace(/[^+0-9]/g,"")}>Appeler : {x.phone}</a>,
  ...["whatsapp","instagram","facebook"].filter(n=>typeof x.socials?.[n]==="string"&&/^https:\/\//i.test(x.socials[n])).map(n=><a key={n} style={contactLink} href={x.socials[n]} target="_blank" rel="noopener noreferrer">{n}</a>)
 ].filter(Boolean);
 return <article key={a.id} style={{border:"1px solid #ddd",borderRadius:12,padding:16,marginBottom:12}}>
  <h3>{x.name}</h3><p>{x.sector} · {x.city}</p>
  <p style={{fontSize:13}}>{unlocked?"Coordonnées débloquées : prospect conservé dans votre liste.":"Téléphone masqué : "+hoursRemaining+" h pour appuyer sur « Contacter », sinon le prospect est retiré."}</p>
  <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
   <label>Suivi : <select aria-label={"Statut de "+x.name} value={a.status} onChange={e=>updateStatus(a.id,e.target.value)}><option value="new">Nouveau</option><option value="contacted">Contacté</option><option value="interested">Intéressé</option><option value="converted">Client</option><option value="closed">Clôturé</option></select></label>
   <button type="button" disabled={openingContact===a.id} aria-expanded={expandedContact===a.id} aria-controls={"contact-"+a.id} onClick={()=>openContact(a.id)} style={{padding:"8px 14px",borderRadius:8,cursor:"pointer"}}>{openingContact===a.id?"Ouverture…":unlocked?"Contacter":"Contacter · voir le téléphone"}</button>
  </div>
  <div id={"contact-"+a.id} hidden={expandedContact!==a.id} style={{display:expandedContact===a.id?"flex":"none",gap:8,flexWrap:"wrap",marginTop:12}}>{links.length?links:<span>Aucune coordonnée disponible.</span>}</div>
  {unlocked&&x.email&&<p>Email : {x.email}</p>}
  {unlocked&&x.phone&&<p>Téléphone : {x.phone}</p>}
  {x.website&&<p><a href={x.website} target="_blank" rel="noopener noreferrer">Site internet</a></p>}
  <p><small>Source : {x.source_url} · Vérification : {x.verified_at?new Date(x.verified_at).toLocaleDateString("fr-FR"):"non vérifiée"}</small></p>
 </article>})}
 </main>;
}
