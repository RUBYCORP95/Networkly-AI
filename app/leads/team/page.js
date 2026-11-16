"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
export default function TeamVerification(){
 const [identifier,setIdentifier]=useState(""),[membership,setMembership]=useState(null),[members,setMembers]=useState(null),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 async function load(){
  const [mine,admin]=await Promise.all([fetch("/api/leads/team"),fetch("/api/leads/admin/team")]);
  const m=await mine.json();if(mine.ok)setMembership(m.membership);else setNotice(m.error||"Erreur");
  if(admin.ok){const a=await admin.json();setMembers(a.members||[])}
 }
 useEffect(()=>{load().catch(()=>setNotice("Chargement impossible"))},[]);
 async function submit(e){e.preventDefault();setBusy(true);setNotice("");
  try{const r=await fetch("/api/leads/team",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({consultant_identifier:identifier})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur");setNotice("Demande transmise. Validation nécessaire avant accès gratuit.");await load()}catch(e){setNotice(e.message)}finally{setBusy(false)}
 }
 async function decide(user_id,status){setBusy(true);setNotice("");
  try{const r=await fetch("/api/leads/admin/team",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({user_id,status})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Erreur");setNotice("Statut mis à jour.");await load()}catch(e){setNotice(e.message)}finally{setBusy(false)}
 }
 return <main style={{maxWidth:900,margin:"30px auto",padding:24,fontFamily:"sans-serif"}}><Link href="/leads">← LeadFactory</Link><h1>Équipe Chogan · Accès gratuit</h1><p>L'accès gratuit à LeadFactory est réservé aux membres de l'équipe vérifiés par l'administrateur. Les autres fonctions TESAMI restent indépendantes.</p><p>Mon statut : <strong>{membership?.status||"Non inscrit"}</strong></p>
 {membership?.status!=="verified"&&<form onSubmit={submit} style={{display:"flex",gap:12,flexWrap:"wrap"}}><label>Identifiant consultant Chogan <input required minLength={3} maxLength={80} value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label><button disabled={busy}>Demander la vérification</button></form>}
 {notice&&<p role="status">{notice}</p>}
 {members!==null&&<section><h2>Administration · Membres ({members.length})</h2>{members.map(m=><article key={m.user_id} style={{padding:12,border:"1px solid #ddd",borderRadius:8,marginBottom:8}}><p><strong>{m.consultant_identifier||"Sans identifiant"}</strong> · {m.status}</p><small>{m.user_id}</small><div style={{display:"flex",gap:8,marginTop:8}}>{["verified","rejected","revoked"].filter(s=>s!==m.status).map(s=><button key={s} disabled={busy} onClick={()=>decide(m.user_id,s)}>{s==="verified"?"Approuver":s==="rejected"?"Refuser":"Révoquer"}</button>)}</div></article>)}</section>}
 </main>;
}
