"use client";
import {useCallback,useEffect,useState} from "react";
import {createClient} from "../../lib/supabase/client";
import styles from "./leadfactory.module.css";

export default function LeadFactoryPage(){
 const [state,setState]=useState({loading:true,error:"",status:null,cards:[],revealed:{},limited:false});
 const [busy,setBusy]=useState(null);
 const [demo,setDemo]=useState(false);
 const [generatingReal,setGeneratingReal]=useState(false);
 const [generationMessage,setGenerationMessage]=useState("");
 const [adviceOpen,setAdviceOpen]=useState(false);
 const [adviceType,setAdviceType]=useState("partnership");
 const [adviceCopied,setAdviceCopied]=useState(false);
 const [cityQuery,setCityQuery]=useState("");
 const [prospectSearchMessage,setProspectSearchMessage]=useState("");
 const [prospectAvailability,setProspectAvailability]=useState(null);
 const [searchingProspects,setSearchingProspects]=useState(false);
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
   if(!response.ok){if(response.status===403){setState(s=>({...s,loading:false,error:"",status:null,cards:[],limited:true}));return;}throw new Error(status.error||"Statut indisponible");}
   const {data:cards,error}=await supabase.rpc("my_lead_allocation_cards");
   if(error)throw error;
   const {data:pref}=await supabase.from("lead_preferences").select("city,radius_km,latitude,longitude").eq("user_id",session.user.id).maybeSingle();
   if(pref){setCityQuery(pref.city||"");setRadius(pref.radius_km||25);if(pref.latitude!=null&&pref.longitude!=null)setSelectedCity({name:pref.city,latitude:pref.latitude,longitude:pref.longitude});}
   setState(s=>({...s,loading:false,error:"",status,cards:cards||[],limited:false}));
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
  if(radius<5||radius>50){setSectorMessage("Le rayon doit être compris entre 5 et 50 km.");return false;}
  setSavingSector(true);setSectorMessage("");
  try{
   const supabase=createClient();const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw new Error("Connecte-toi pour enregistrer ton secteur.");
   const {error}=await supabase.from("lead_preferences").upsert({user_id:user.id,city:selectedCity.name,radius_km:radius,latitude:selectedCity.latitude,longitude:selectedCity.longitude,updated_at:new Date().toISOString()},{onConflict:"user_id"});
   if(error)throw error;
   setSectorMessage("Secteur enregistré : "+selectedCity.name+" · "+radius+" km.");
   setProspectSearchMessage("");
   setProspectAvailability(null);
   if(!state.limited)await load();
   return true;
  }catch(e){setSectorMessage(e.message||"Enregistrement impossible");return false;}finally{setSavingSector(false);}
 }
 async function searchProspectsInSector(){
  if(!selectedCity||selectedCity.name!==cityQuery){setSectorMessage("Sélectionne une commune dans le menu déroulant.");return;}
  if(radius<5||radius>50){setSectorMessage("Choisis un rayon entre 5 et 50 km.");return;}
  const saved=await saveSector();
  if(!saved)return;
  setSearchingProspects(true);
  try{
   const {data:{session}}=await createClient().auth.getSession();
   if(!session?.access_token)throw new Error("Connexion requise");
   const response=await fetch("/api/leadfactory/prospect-availability",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Recherche indisponible");
   setProspectAvailability(data);
   setProspectSearchMessage(data.available>0?data.available+" prospect(s) professionnel(s) éligible(s) détecté(s) dans un rayon de "+data.radius_km+" km. Aucun contact n'est encore attribué.": "Aucun prospect professionnel validé dans ce rayon pour le moment. Les fiches importées attendent la géolocalisation et la validation.");
  }catch(error){setProspectAvailability(null);setProspectSearchMessage(error.message||"Recherche impossible");}
  finally{setSearchingProspects(false);}
  document.getElementById("lf-my-prospects")?.scrollIntoView({behavior:"smooth",block:"start"});
 }
 async function generateRealLeads(){
  if(state.limited||!state.status||state.status.today?.requested||generatingReal)return;
  setGeneratingReal(true);setGenerationMessage("");
  try{
   const supabase=createClient();
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw new Error("Connecte-toi pour générer tes prospects.");
   const {data:pref,error:prefError}=await supabase.from("lead_preferences").select("radius_km,latitude,longitude").eq("user_id",user.id).maybeSingle();
   if(prefError||!pref||!Number.isFinite(pref.latitude)||!Number.isFinite(pref.longitude))throw new Error("Enregistre d'abord ta ville et ton rayon.");
   const {data:started,error:startError}=await supabase.rpc("start_my_lead_daily_request");
   if(startError)throw startError;
   const {data:granted,error:allocateError}=await supabase.rpc("allocate_my_daily_leads");
   if(allocateError)throw allocateError;
   const result=granted?.[0]||{};
   setGenerationMessage("Attribution terminée : "+(result.professional_count||0)+" professionnel(s) et "+(result.klaviyo_count||0)+" contact(s) Klaviyo. Les coordonnées se révèlent uniquement en cliquant sur Contacter.");
   await load();
  }catch(e){setGenerationMessage(e.message||"Impossible de générer les prospects. Réessaie plus tard.");await load();}
  finally{setGeneratingReal(false);}
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
 const adviceTemplates={partnership:{title:"Proposer un partenariat",tip:"Commence par comprendre les besoins de l’établissement et propose un échange sans engagement.",message:"Bonjour, je suis consultant indépendant Chogan et j’accompagne des professionnels qui souhaitent découvrir de nouvelles possibilités de partenariat autour des parfums et des produits du quotidien. Votre établissement m’a intéressé. Seriez-vous disponible pour un court échange afin de voir si une collaboration pourrait avoir du sens pour vous ?"},products:{title:"Présenter les produits",tip:"Propose une découverte adaptée à l’activité, sans affirmer de résultats non vérifiés.",message:"Bonjour, je suis consultant indépendant Chogan. Je propose une gamme de parfums et de produits pour le quotidien qui pourrait éventuellement intéresser votre établissement ou votre clientèle. Est-ce que je peux vous présenter quelques références adaptées à votre activité ?"},consultant:{title:"Devenir consultant",tip:"Présente l’activité comme une possibilité, jamais comme une garantie de revenus.",message:"Bonjour, je suis consultant indépendant Chogan. En complément de votre activité professionnelle, il existe aussi la possibilité de devenir consultant pour découvrir et proposer les produits à votre rythme. Si cela vous intéresse, je peux vous expliquer le fonctionnement, les conditions et le temps à prévoir, sans engagement."}};
 const currentAdvice=adviceTemplates[adviceType];
 const s=state.status;
 const klaviyo=s?.quotas?.klaviyo||0, professional=s?.quotas?.professional||0;
 const visibleCards=state.cards; // Existing allocations remain owned by the consultant even if their saved sector changes.
 return <div className={styles.page}>
  <div className={styles.hero}>
   <div><div className={styles.eyebrow}>TESAMI · Espace consultant</div><h1>LeadFactory</h1><p>Développe ton réseau local, découvre tes prospects et prépare des prises de contact professionnelles avec les bons outils.</p></div>
   <div className={styles.heroBadge}>✦ Prospection de proximité <button type="button" className={styles.heroDemoButton} onClick={()=>setDemo(v=>!v)}>{demo?"Fermer la démo":"Essayer la démo"}</button></div>
  </div>
  <div className={styles.stats}>
   <div className={styles.stat}><div className={styles.statLabel}>Mon abonnement</div><div className={styles.statValue}>{s?.plan||"—"}</div><div className={styles.statNote}>Formule actuelle</div><a className={styles.planChange} href="/plans">↻ Changer d’abonnement</a></div>
   <div className={styles.stat}><div className={styles.statLabel}>Contacts Klaviyo / jour</div><div className={styles.statValue}>{s?klaviyo:"—"}</div><div className={styles.statNote}>Quota maximum</div></div>
   <div className={styles.stat}><div className={styles.statLabel}>Prospects pros / jour</div><div className={styles.statValue}>{s?professional:"—"}</div><div className={styles.statNote}>Quota maximum</div></div>
   <div className={styles.stat}><div className={styles.statLabel}>Mes contacts</div><div className={styles.statValue}>{visibleCards.length}</div><div className={styles.statNote}>Actuellement attribués</div></div>
  </div>
  {state.loading&&<div className={styles.panel} role="status">Chargement de ton espace LeadFactory…</div>}
  {state.error&&<div className={styles.alert} role="alert"><p>{state.error}</p>{state.error.includes("Connecte-toi")&&<a className={styles.loginLink} href="/login?next=%2Fleadfactory">Se connecter à TESAMI</a>}</div>}
  {state.limited&&<div className={styles.betaNotice} role="status"><strong>Bienvenue dans la bêta publique !</strong><p>Tu peux tester gratuitement les dix contacts fictifs, les conseils de prospection et l’interface. Les vrais contacts Klaviyo et professionnels ne sont pas accessibles aux comptes bêta non autorisés.</p><a href="/login?next=%2Fleadfactory">Gérer mon compte</a></div>}
  {(s||state.limited)&&<div className={styles.layout}>
   <div className={styles.panel}>
    <h2>📍 Choisir mon secteur</h2><p className={styles.muted}>Choisis une commune et un rayon, puis recherche tes prospects dans cette zone. Seuls les contacts déjà attribués à ton compte sont visibles.</p>
    <label className={styles.label} htmlFor="lf-city">Ville ou code postal</label>
    <div className={styles.searchRow}><input className={styles.input} id="lf-city" value={cityQuery} onChange={e=>{setCityQuery(e.target.value);setSelectedCity(null);setCities([]);}} onKeyDown={e=>{if(e.key==="Enter")searchCities();}} placeholder="Ex. Viarmes ou 95270"/><button className={styles.buttonSecondary} onClick={searchCities} disabled={searchingCities||cityQuery.trim().length<2}>{searchingCities?"Recherche…":"Rechercher"}</button></div>
    {cities.length>0&&<div style={{marginTop:12}}><label className={styles.label} htmlFor="lf-city-results">Sélectionner une commune ({cities.length} résultat{cities.length>1?"s":""})</label><select id="lf-city-results" className={styles.input} defaultValue="" onChange={e=>{const city=cities[Number(e.target.value)];if(!city)return;setSelectedCity(city);setCityQuery(city.name);setCities([]);setSectorMessage("Ville sélectionnée : "+city.name+(city.postcode?" ("+city.postcode+")":""));}}><option value="" disabled>Choisir une ville dans la liste…</option>{cities.map((city,i)=><option key={city.code+"-"+i} value={i}>{city.name}{city.postcode?" · "+city.postcode:""}</option>)}</select></div>}
    <label className={styles.label} htmlFor="lf-radius">Rayon de prospection : {radius} km</label>
    <input className={styles.range} id="lf-radius" type="range" min="5" max="50" step="5" value={radius} onChange={e=>setRadius(Number(e.target.value))}/>
    <div className={styles.rangeLabels}><span>5 km</span><span>25 km</span><span>50 km</span></div>
    <div style={{marginTop:22,display:"flex",gap:10,flexWrap:"wrap"}}><button className={styles.button} onClick={searchProspectsInSector} disabled={savingSector||searchingProspects||!selectedCity}>{savingSector||searchingProspects?"Recherche en cours…":"🔎 Rechercher mes prospects"}</button><button className={styles.buttonSecondary} onClick={saveSector} disabled={savingSector||!selectedCity}>Enregistrer mon secteur</button></div>
    {sectorMessage&&<p className={styles.message} role="status">{sectorMessage}</p>}
   </div>
   <div className={styles.panel}>
    <h2>🎯 Mes prospects du jour</h2><p className={styles.muted}>Retrouve ici tes quotas et le statut de ta demande quotidienne.</p>
    <div className={styles.quota}><span>Contacts Klaviyo</span><strong>{klaviyo}</strong></div>
    <div className={styles.quota}><span>Prospects professionnels</span><strong>{professional}</strong></div>
    <p className={styles.muted}>Secteur : <strong>{s?.sector?.city||"Non renseigné"}</strong> · Rayon : <strong>{s?.sector?.radius_km||"—"} km</strong></p>
    <p className={styles.muted}>{s?.today?.requested?"Demande du jour : "+s.today.status:"Aucune demande aujourd’hui."}</p> 
    {!state.limited&&s&&<div style={{margin:"14px 0"}}><button className={styles.button} type="button" disabled={generatingReal||!!s.today?.requested||!prospectAvailability?.available} onClick={generateRealLeads}>{generatingReal?"Attribution en cours…":s.today?.requested?"Génération déjà effectuée aujourd'hui":"Générer mes vrais prospects"}</button><p className={styles.muted}>{!prospectAvailability?.available?"Recherche ton secteur : le bouton sera disponible lorsque des prospects professionnels validés y seront présents.":"La génération utilise les quotas de ton abonnement et ne peut être demandée qu'une fois par jour."}</p>{generationMessage&&<p className={styles.message} role="status">{generationMessage}</p>}</div>}
    <button className={styles.button} type="button" onClick={()=>setDemo(v=>!v)}>{demo?"Masquer la démonstration":"Tester la génération (mode démo)"}</button>
    <p className={styles.disabledNote}>Mode bêta : cette démonstration utilise uniquement des contacts fictifs. La distribution de vrais prospects reste désactivée pendant les vérifications.</p>
   </div>
  </div>}
  <div id="lf-my-prospects" className={styles.sectionHeading}><h2>Mes prospects — Google Sheets et Klaviyo</h2><button className={styles.buttonSecondary} onClick={()=>setAdviceOpen(v=>!v)}>{adviceOpen?"Masquer les conseils":"💬 Conseils pour contacter un pro"}</button></div>
  {adviceOpen&&<div id="leadfactory-advice" className={styles.advice}><h2>Comment démarrer la discussion ?</h2><p className={styles.muted}>Sélectionne une approche et personnalise le texte selon l’activité du professionnel.</p><div className={styles.adviceTabs}>{Object.entries(adviceTemplates).map(([key,item])=><button key={key} className={adviceType===key?styles.tab+" "+styles.tabActive:styles.tab} onClick={()=>{setAdviceType(key);setAdviceCopied(false);}} aria-pressed={adviceType===key}>{item.title}</button>)}</div><h3>{currentAdvice.title}</h3><p>{currentAdvice.tip}</p><div className={styles.script}>{currentAdvice.message}</div><div style={{marginTop:14}}><button className={styles.button} onClick={async()=>{try{await navigator.clipboard.writeText(currentAdvice.message);setAdviceCopied(true);}catch{setAdviceCopied(false);}}}>{adviceCopied?"Message copié !":"Copier le message"}</button></div><p className={styles.footnote}>Respecte les règles de prospection professionnelle, les refus et les demandes d’opposition. Ne promets pas de revenus.</p></div>}
  {demo&&<div className={styles.demoPanel} role="region" aria-label="Démonstration avec prospects fictifs"><strong>🧪 Simulation bêta — données 100 % fictives</strong><p>Voici un aperçu de cinq contacts clients Klaviyo et cinq prospects professionnels. Aucun vrai contact n’est attribué, aucun quota n’est consommé et aucune coordonnée personnelle n’est révélée.</p><div className={styles.demoGrid}>{Array.from({length:10},(_,i)=><div className={styles.demoItem} key={i}><strong>{i<5?"Client Klaviyo":"Professionnel"} · Démo {i%5+1}</strong><span>{i<5?"Panier abandonné fictif":"Entreprise fictive"} · Exemple uniquement</span><button className={styles.buttonSecondary} type="button" onClick={()=>{setAdviceOpen(true);setAdviceType(i<5?"products":"partnership");setAdviceCopied(false);}}>Préparer un message</button></div>)}</div></div>}
  {prospectSearchMessage&&<div className={styles.panel} style={{marginBottom:18}} role="status"><strong>{prospectAvailability?prospectAvailability.available+" professionnels disponibles dans mon secteur":"Résultat de la recherche"}</strong><p>{prospectSearchMessage}</p><p className={styles.muted}>La recherche ne réserve aucun contact. La génération réelle reste désactivée pendant les vérifications.</p>{prospectAvailability?.adminPreview&&prospectAvailability.preview?.length>0&&<div className={styles.cards} style={{marginTop:14}}>{prospectAvailability.preview.map((pro,i)=><article className={styles.leadCard} key={i}><h3>{pro.company||"Entreprise"}</h3><p>{pro.sector||"Activité non précisée"}</p><p>📍 {pro.city}{pro.department?" · "+pro.department:""} · {pro.distance_km} km</p><p>{pro.validated?"Validé pour attribution":"En attente de validation"}</p><p>📞 {pro.phone?<a href={"tel:"+pro.phone}>{pro.phone}</a>:"Téléphone non renseigné"}</p><p>✉ {pro.email?<a href={"mailto:"+pro.email}>{pro.email}</a>:"E-mail non renseigné"}</p><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>{pro.phone?<a className={styles.button} href={"tel:"+pro.phone} style={{textDecoration:"none",display:"inline-flex",alignItems:"center"}}><span aria-hidden="true" style={{color:"#fff",filter:"grayscale(1) brightness(0) invert(1)",marginRight:6}}>📞</span>Contacter</a>:pro.email?<a className={styles.button} href={"mailto:"+pro.email} style={{textDecoration:"none",display:"inline-flex",alignItems:"center"}}>✉ Contacter</a>:<span className={styles.muted}>Aucun contact disponible</span>}{pro.phone&&pro.email&&<a className={styles.buttonSecondary} href={"mailto:"+pro.email} style={{textDecoration:"none",display:"inline-flex",alignItems:"center"}}>Envoyer un e-mail</a>}</div></article>)}</div>}</div>}

 </div>;
}
