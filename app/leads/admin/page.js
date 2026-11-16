"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
const labels={pending:"En attente",verified:"Vérifié",rejected:"Refusé",revoked:"Révoqué"};
export default function LeadAdmin(){
 const [members,setMembers]=useState([]),[organizations,setOrganizations]=useState([]),[selected,setSelected]=useState({}),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  const [mr,or]=await Promise.all([fetch("/api/leads/admin/team"),fetch("/api/leads/admin/organizations")]);
  const m=await mr.json(),o=await or.json();
  if(!mr.ok||!or.ok)throw new Error(m.error||o.error||"Accès impossible");
  setMembers(m.members||[]);setOrganizations(o.organizations||[]);
 },[]);
 useEffect(()=>{load().catch(e=>setNotice(e.message)).finally(()=>setLoading(false))},[load]);
 async function action(url,body,method="POST"){
  setBusy(true);setNotice("");
  try{const r=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur");setNotice("Modification enregistrée.");await load()}
  catch(e){setNotice(e.message)}finally{setBusy(false)}
 }
 const eligible=members.filter(m=>m.status==="verified");
 return <main style={{maxWidth:1100,margin:"32px auto",padding:24,fontFamily:"sans-serif"}}><Link href="/leads">← LeadFactory</Link><h1>Administration LeadFactory</h1><p><Link href="/leads/admin/klaviyo" style={{display:"inline-block",padding:"10px 16px",background:"#6945c0",color:"#fff",borderRadius:9,textDecoration:"none"}}>Importer des clients Klaviyo (privé)</Link></p><p>Vérifie les membres de ton équipe Chogan, puis attribue manuellement les prospects disponibles. Chaque entreprise ne peut être attribuée qu'une fois.</p>
 {notice&&<p role="status">{notice}</p>}{loading&&<p>Chargement…</p>}
 <section><h2>Consultants ({members.length})</h2>{members.length===0&&!loading&&<p>Aucune demande de vérification.</p>}
 <div style={{display:"grid",gap:10}}>{members.map(m=><article key={m.user_id} style={{border:"1px solid #ddd",borderRadius:10,padding:14}}><strong>{m.consultant_identifier||"Identifiant absent"}</strong> · {labels[m.status]||m.status}<p style={{fontSize:12,overflowWrap:"anywhere"}}>Compte : {m.user_id}</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{["verified","rejected","revoked"].filter(s=>s!==m.status).map(s=><button key={s} disabled={busy} onClick={()=>action("/api/leads/admin/team",{user_id:m.user_id,status:s},"PATCH")}>{s==="verified"?"Valider":s==="rejected"?"Refuser":"Révoquer"}</button>)}</div></article>)}</div></section>
 <section style={{marginTop:32}}><h2>Prospects ({organizations.length})</h2>{organizations.length===0&&!loading&&<p>Aucun prospect importé ou généré.</p>}
 <div style={{display:"grid",gap:10}}>{organizations.map(o=>{const assignment=o.lead_assignments?.[0];return <article key={o.id} style={{border:"1px solid #ddd",borderRadius:10,padding:14}}><strong>{o.name}</strong><p>{o.sector} · {o.city} {o.website&&<a href={o.website} target="_blank" rel="noopener noreferrer">Site</a>}</p>{assignment?<p>Déjà attribué au compte {assignment.user_id}</p>:<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><select aria-label={"Attribuer "+o.name} value={selected[o.id]||""} onChange={e=>setSelected(s=>({...s,[o.id]:e.target.value}))}><option value="">Choisir un membre vérifié</option>{eligible.map(m=><option key={m.user_id} value={m.user_id}>{m.consultant_identifier||m.user_id}</option>)}</select><button disabled={busy||!selected[o.id]} onClick={()=>action("/api/leads/admin/assign",{organization_id:o.id,user_id:selected[o.id]})}>Attribuer</button></div>}</article>})}</div></section>
 </main>;
}
