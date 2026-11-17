"use client";
import {useCallback,useEffect,useState} from "react";
import {createClient} from "../../lib/supabase/client";

export default function LeadFactoryPage(){
 const [state,setState]=useState({loading:true,error:"",status:null,cards:[],revealed:{}});
 const [busy,setBusy]=useState(null);
 const load=useCallback(async()=>{
  try{
   const supabase=createClient();
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Connecte-toi à TESAMI pour consulter tes prospects.");
   const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/leadfactory-daily-status",{
    headers:{Authorization:"Bearer "+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
   });
   const status=await response.json();
   if(!response.ok)throw new Error(status.error||"Statut indisponible");
   const {data:cards,error}=await supabase.rpc("my_lead_allocation_cards");
   if(error)throw error;
   setState(s=>({...s,loading:false,error:"",status,cards:cards||[]}));
  }catch(e){setState(s=>({...s,loading:false,error:e.message||"Erreur de chargement"}));}
 },[]);
 useEffect(()=>{load()},[load]);
 async function reveal(id){
  setBusy(id);
  try{
   const {data,error}=await createClient().rpc("reveal_my_daily_allocation",{p_allocation_id:id});
   if(error)throw error;
   if(!data?.length)throw new Error("Coordonnées indisponibles.");
   setState(s=>({...s,revealed:{...s.revealed,[id]:data[0]}}));
   await load();
  }catch(e){setState(s=>({...s,error:e.message||"Impossible de révéler le contact"}));}
  finally{setBusy(null);}
 }
 const s=state.status;
 return <main style={{maxWidth:1050,margin:"0 auto",padding:"32px 20px",fontFamily:"inherit"}}>
  <h1>TESAMI LeadFactory</h1>
  <p>Retrouve tes prospects de proximité. Les coordonnées sont visibles uniquement après avoir cliqué sur « Contacter ».</p>
  {state.loading&&<p>Chargement…</p>}
  {state.error&&<p role="alert" style={{color:"#b42318"}}>{state.error}</p>}
  {s&&<section style={{padding:20,border:"1px solid #d9d9e3",borderRadius:16,marginBottom:24}}>
   <h2>Mes prospects du jour</h2>
   <p>Formule : <strong>{s.plan}</strong> · Secteur : {s.sector?.city||"Non renseigné"} · Rayon : {s.sector?.radius_km||"—"} km</p>
   <p>Jusqu’à <strong>{s.quotas?.klaviyo||0}</strong> contacts Klaviyo et <strong>{s.quotas?.professional||0}</strong> prospects professionnels par jour, selon les disponibilités dans ton secteur.</p>
   <p>{s.today?.requested?"Demande du jour : "+s.today.status:"Aucune demande aujourd’hui."}</p>
   <button disabled style={{padding:"12px 18px",borderRadius:10,cursor:"not-allowed"}} title="La génération sera activée après validation des contrôles de conformité">Générer mes prospects</button>
   <p style={{fontSize:13,opacity:.75}}>Génération temporairement désactivée pendant les vérifications de conformité et les tests.</p>
  </section>}
  <h2>Mes contacts attribués</h2>
  {!state.loading&&state.cards.length===0&&<p>Aucun contact attribué pour le moment.</p>}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
  {state.cards.map(c=><article key={c.allocation_id} style={{border:"1px solid #d9d9e3",borderRadius:14,padding:18}}>
   <h3>{c.contact_kind==="klaviyo"?"Contact Klaviyo":"Prospect professionnel"}</h3>
   <p>{[c.postal_code,c.city,c.department].filter(Boolean).join(" · ")}</p>
   <p>Distance approximative : {c.distance_km??"—"} km</p>
   <p>À réclamer avant le {new Date(c.expires_at).toLocaleString("fr-FR")}</p>
   {state.revealed[c.allocation_id]?<div><p>Téléphone : {state.revealed[c.allocation_id].phone||"Non renseigné"}</p><p>E-mail : {state.revealed[c.allocation_id].email||"Non renseigné"}</p></div>:<button onClick={()=>reveal(c.allocation_id)} disabled={busy===c.allocation_id} style={{padding:"10px 16px",borderRadius:10}}>{busy===c.allocation_id?"Chargement…":"Contacter"}</button>}
  </article>)}
  </div>
 </main>;
}
