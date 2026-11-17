"use client";
import {useCallback,useEffect,useState} from "react";
import {createClient} from "../../lib/supabase/client";

export default function LeadFactoryPage(){
 const [state,setState]=useState({loading:true,error:"",status:null,cards:[],revealed:{}});
 const [busy,setBusy]=useState(null);
 const [cityQuery,setCityQuery]=useState("");
 const [cities,setCities]=useState([]);
 const [selectedCity,setSelectedCity]=useState(null);
 const [radius,setRadius]=useState(25);
 const [savingSector,setSavingSector]=useState(false);
 const [sectorMessage,setSectorMessage]=useState("");
 const [searchingCities,setSearchingCities]=useState(false);
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
   const {data:pref}=await supabase.from("lead_preferences").select("city,radius_km,latitude,longitude").eq("user_id",session.user.id).maybeSingle();
   if(pref){setCityQuery(pref.city||"");setRadius(pref.radius_km||25);if(pref.latitude!=null&&pref.longitude!=null)setSelectedCity({name:pref.city,latitude:pref.latitude,longitude:pref.longitude});}
   setState(s=>({...s,loading:false,error:"",status,cards:cards||[]}));
  }catch(e){setState(s=>({...s,loading:false,error:e.message||"Erreur de chargement"}));}
 },[]);
 useEffect(()=>{load()},[load]);
 async function searchCities(){
  setSearchingCities(true);setSectorMessage("");
  try{const res=await fetch("/api/leadfactory/cities?q="+encodeURIComponent(cityQuery));const data=await res.json();if(!res.ok)throw new Error(data.error||"Recherche impossible");setCities(data.cities||[]);if(!data.cities?.length)setSectorMessage("Aucune ville trouvée. Essaie une autre orthographe ou un code postal.");}
  catch(e){setSectorMessage(e.message||"Recherche impossible");}finally{setSearchingCities(false);}
 }
 async function saveSector(){
  if(!selectedCity||selectedCity.name!==cityQuery){setSectorMessage("Choisis une ville dans les résultats avant d'enregistrer.");return;}
  if(radius<5||radius>50){setSectorMessage("Le rayon doit être compris entre 5 et 50 km.");return;}
  setSavingSector(true);setSectorMessage("");
  try{
   const supabase=createClient();const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw new Error("Connecte-toi pour enregistrer ton secteur.");
   const {error}=await supabase.from("lead_preferences").upsert({user_id:user.id,city:selectedCity.name,radius_km:radius,latitude:selectedCity.latitude,longitude:selectedCity.longitude,updated_at:new Date().toISOString()},{onConflict:"user_id"});
   if(error)throw error;
   setSectorMessage("Secteur enregistré : "+selectedCity.name+" · "+radius+" km.");
   await load();
  }catch(e){setSectorMessage(e.message||"Enregistrement impossible");}finally{setSavingSector(false);}
 }
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
  {s&&<section style={{padding:20,border:"1px solid #d9d9e3",borderRadius:16,marginBottom:24,maxWidth:640}}>
   <h2>Mon secteur géographique</h2>
   <p>Choisis ta ville et ton rayon de prospection. Les coordonnées sont enregistrées pour ton compte uniquement.</p>
   <label htmlFor="lf-city">Ville ou code postal</label>
   <div style={{display:"flex",gap:8,flexWrap:"wrap",margin:"8px 0 12px"}}><input id="lf-city" value={cityQuery} onChange={e=>{setCityQuery(e.target.value);setSelectedCity(null);setCities([]);}} onKeyDown={e=>{if(e.key==="Enter")searchCities();}} placeholder="Ex. Viarmes ou 95270" style={{padding:11,borderRadius:8,border:"1px solid #b9bfd0",flex:"1 1 190px"}}/><button onClick={searchCities} disabled={searchingCities||cityQuery.trim().length<2} style={{padding:"10px 14px",borderRadius:8}}>{searchingCities?"Recherche…":"Rechercher"}</button></div>
   {cities.length>0&&<div role="listbox" aria-label="Villes trouvées" style={{display:"grid",gap:6,marginBottom:14}}>{cities.map((city,i)=><button key={city.code+"-"+i} onClick={()=>{setSelectedCity(city);setCityQuery(city.name);setCities([]);setSectorMessage("Ville sélectionnée : "+city.name+(city.postcode?" ("+city.postcode+")":""));}} style={{textAlign:"left",padding:10,borderRadius:8,border:"1px solid #d9d9e3",background:"#fff",color:"#142044"}}>{city.name}{city.postcode?" · "+city.postcode:""}</button>)}</div>}
   <label htmlFor="lf-radius">Rayon : <strong>{radius} km</strong></label>
   <input id="lf-radius" type="range" min="5" max="50" step="5" value={radius} onChange={e=>setRadius(Number(e.target.value))} style={{display:"block",width:"100%",maxWidth:400,margin:"12px 0"}}/>
   <button onClick={saveSector} disabled={savingSector||!selectedCity} style={{padding:"12px 18px",borderRadius:10,background:"#34238b",color:"white",border:0,cursor:"pointer"}}>{savingSector?"Enregistrement…":"Enregistrer mon secteur"}</button>
   {sectorMessage&&<p role="status" style={{fontSize:14}}>{sectorMessage}</p>}
  </section>}
  {s&&<section style={{padding:20,border:"1px solid #d9d9e3",borderRadius:16,marginBottom:24,maxWidth:640}}>
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
