"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {createClient} from "../../lib/supabase/client";
import styles from "./leadfactory.module.css";

async function findCities(query) {
 const response=await fetch("/api/leadfactory/cities?q="+encodeURIComponent(query),{signal:AbortSignal.timeout(12000)});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||"Recherche impossible.");
 return data.cities||[];
}

async function consultantAction(action,allocationId){
 const {data:{session}}=await createClient().auth.getSession();
 if(!session?.access_token)throw new Error("Reconnecte-toi à TESAMI.");
 const request={
  method:"POST",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+session.access_token},
  body:JSON.stringify({action,allocationId})
 };
 const send=()=>fetch("/api/leadfactory/consultant-action",{...request,signal:AbortSignal.timeout(12000)});
 let response;
 try{
  response=await send().catch(()=>null);
  // Claiming the same contact again returns the existing allocation.
  if(!response||[502,503,504].includes(response.status))response=await send();
 }catch{
  throw new Error("La connexion à LeadFactory a été interrompue. Tu peux réessayer sur la même fiche.");
 }
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data)throw new Error(data?.error||"LeadFactory est momentanément indisponible.");
 return data;
}

export default function LeadFactoryPage(){
 const [state,setState]=useState({loading:true,error:"",status:null,cards:[],revealed:{},limited:false});
 const [busy,setBusy]=useState(null);
 const [demo,setDemo]=useState(false);
 const [adviceOpen,setAdviceOpen]=useState(false);
 const [adviceType,setAdviceType]=useState("partnership");
 const [adviceCopied,setAdviceCopied]=useState(false);
 const [cityQuery,setCityQuery]=useState("");
 const [sectorTab,setSectorTab]=useState("professional");
 const [prospectSearchMessage,setProspectSearchMessage]=useState("");
 const [prospectAvailability,setProspectAvailability]=useState(null);
 const [contactRevealBusy,setContactRevealBusy]=useState(null);
 const [contactReveal,setContactReveal]=useState(null);
 const contactDetails=useRef(null);
 useEffect(()=>{
  const details=contactDetails.current;
  if(!contactReveal||!details)return;
  details.focus({preventScroll:true});
  details.scrollIntoView({block:"nearest",inline:"nearest"});
 },[contactReveal]);
 const [usage,setUsage]=useState(null);

 const [searchingProspects,setSearchingProspects]=useState(false);
 const [cities,setCities]=useState([]);
 const [selectedCity,setSelectedCity]=useState(null);
 const [radius,setRadius]=useState(25);
 const [savingSector,setSavingSector]=useState(false);
 const [sectorMessage,setSectorMessage]=useState("");
 const [searchingCities,setSearchingCities]=useState(false);
 const citySearchVersion=useRef(0);
 const load=useCallback(async()=>{
  try{
   const supabase=createClient();
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw new Error("Connecte-toi à TESAMI pour consulter tes prospects.");
   const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/leadfactory-daily-status",{
    signal:AbortSignal.timeout(12000),
    headers:{Authorization:"Bearer "+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}
   });
   const status=await response.json();
   if(!response.ok){if(response.status===403){setState(s=>({...s,loading:false,error:"",status:null,cards:[],limited:true}));return;}throw new Error(status.error||"Statut indisponible");}
   const {data:pref,error:prefError}=await supabase.from("lead_preferences").select("city,radius_km,latitude,longitude").eq("user_id",session.user.id).maybeSingle().abortSignal(AbortSignal.timeout(12000));
   if(prefError)throw prefError;
   if(pref){setCityQuery(pref.city||"");setRadius(pref.radius_km||25);if(pref.latitude!=null&&pref.longitude!=null)setSelectedCity({name:pref.city,latitude:pref.latitude,longitude:pref.longitude});}
   // Le secteur est prêt avant d'afficher les commandes.
   setState(s=>({...s,loading:false,error:"",status,cards:s.cards,limited:false}));
   const {data:cards,error}=await Promise.race([
     supabase.rpc("my_lead_allocation_cards_with_names"),
     new Promise((_,reject)=>setTimeout(()=>reject(new Error("Le chargement des contacts prend trop de temps. Réessaie.")),12000))
   ]);
   if(error)throw error;
   setState(s=>({...s,loading:false,error:"",status,cards:cards||[],limited:false}));
  }catch(e){setState(s=>({...s,loading:false,error:e.name==="TimeoutError"?"Le chargement prend trop de temps. Réessaie.":e.message||"Erreur de chargement"}));}
 },[]);
 useEffect(()=>{load()},[load]);
 function selectCity(city){
  setSelectedCity(city);
  setCityQuery(city.name);
  setCities([]);
 }
 async function findMatchingCity(query){
  const results=await findCities(query.trim());
  const exact=results.filter(city=>city.name.localeCompare(query.trim(),"fr",{sensitivity:"base"})===0);
  const match=results.length===1?results[0]:exact.length===1?exact[0]:null;
  return {results,match};
 }
 async function searchCities(){
  const version=++citySearchVersion.current;
  setSearchingCities(true);setSectorMessage("");
  try{
   const {results,match}=await findMatchingCity(cityQuery);
   if(version!==citySearchVersion.current)return;
   if(match)selectCity(match);
   else setCities(results);
   setSectorMessage(match?"Ville sélectionnée : "+match.name+(match.postcode?" ("+match.postcode+")":""):results.length?"Choisis ta commune dans la liste.":"Aucune ville trouvée. Essaie un autre code postal.");
  }catch(error){if(version===citySearchVersion.current)setSectorMessage(error.message||"Recherche impossible.");}
  finally{setSearchingCities(false);}
 }
 async function saveSector(){
  if(radius<5||radius>50){setSectorMessage("Le rayon doit être compris entre 5 et 50 km.");return false;}
  setSavingSector(true);setSectorMessage("");
  try{
   let city=selectedCity;
   if(!city||city.name!==cityQuery){
    const {results,match}=await findMatchingCity(cityQuery);
    if(!match){
     setCities(results);
     throw new Error(results.length?"Choisis ta commune dans la liste.":"Aucune ville trouvée. Vérifie ta saisie.");
    }
    city=match;
    selectCity(city);
   }
   const supabase=createClient();
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError||!user)throw new Error("Connecte-toi pour enregistrer ton secteur.");
   const {error}=await supabase.from("lead_preferences").upsert({user_id:user.id,city:city.name,radius_km:radius,latitude:city.latitude,longitude:city.longitude,updated_at:new Date().toISOString()},{onConflict:"user_id"});
   if(error)throw error;
   setState(current=>current.status?{...current,status:{...current.status,sector:{...current.status.sector,city:city.name,radius_km:radius}}}:current);
   setSectorMessage("Secteur enregistré : "+city.name+" · "+radius+" km.");
   setProspectSearchMessage("");
   setProspectAvailability(null);
   return true;
  }catch(error){setSectorMessage(error.message||"Enregistrement impossible.");return false;}
  finally{setSavingSector(false);}
 }
 async function searchProspectsInSector(){
  if(!(await saveSector()))return;
  setSearchingProspects(true);
  try{
   const result=await consultantAction("search_"+sectorTab);
   setProspectAvailability({kind:sectorTab,results:result.results});
   setUsage(result);
   setProspectSearchMessage(result.results.length?"Choisis une fiche pour afficher le numéro.":"Aucun contact éligible dans ce rayon.");
  }catch(error){setProspectAvailability(null);setProspectSearchMessage(error.message||"Recherche impossible.");}
  finally{setSearchingProspects(false);}
 }

 async function claimCandidate(candidate,kind){
  if(contactRevealBusy)return;
  setContactRevealBusy(candidate.contact_id);
  try{
   const contact=await consultantAction("claim_"+kind,candidate.contact_id);
   setContactReveal({name:[contact.first_name,contact.last_name].filter(Boolean).join(" ")||candidate.company,phone:contact.phone,email:contact.email});
   setState(current=>({...current,revealed:{...current.revealed,[contact.allocation_id]:contact}}));
   setProspectAvailability(current=>current?{...current,results:current.results.filter(item=>item.contact_id!==candidate.contact_id)}:current);
   if(contact.newly_revealed)setUsage(current=>current?{...current,[kind+"_used"]:current[kind+"_used"]+1}:current);
   await load();
  }catch(error){setProspectSearchMessage(error.message||"Contact indisponible.");}
  finally{setContactRevealBusy(null);}
 }
 async function reveal(id){
  setBusy(id);
  try{
   const contact=await consultantAction("reveal",id);
   setState(s=>({...s,revealed:{...s.revealed,[id]:contact}}));
   if(contact.newly_revealed)setUsage(current=>current?{...current,[contact.kind+"_used"]:current[contact.kind+"_used"]+1}:current);
   await load();
  }catch(e){setState(s=>({...s,error:e.message||"Impossible de révéler le contact"}));}
  finally{setBusy(null);}
 }
 const adviceTemplates={partnership:{title:"Proposer un partenariat",tip:"Commence par comprendre les besoins de l’établissement et propose un échange sans engagement.",message:"Bonjour, je suis consultant indépendant Chogan et j’accompagne des professionnels qui souhaitent découvrir de nouvelles possibilités de partenariat autour des parfums et des produits du quotidien. Votre établissement m’a intéressé. Seriez-vous disponible pour un court échange afin de voir si une collaboration pourrait avoir du sens pour vous ?"},products:{title:"Présenter les produits",tip:"Propose une découverte adaptée à l’activité, sans affirmer de résultats non vérifiés.",message:"Bonjour, je suis consultant indépendant Chogan. Je propose une gamme de parfums et de produits pour le quotidien qui pourrait éventuellement intéresser votre établissement ou votre clientèle. Est-ce que je peux vous présenter quelques références adaptées à votre activité ?"},consultant:{title:"Devenir consultant",tip:"Présente l’activité comme une possibilité, jamais comme une garantie de revenus.",message:"Bonjour, je suis consultant indépendant Chogan. En complément de votre activité professionnelle, il existe aussi la possibilité de devenir consultant pour découvrir et proposer les produits à votre rythme. Si cela vous intéresse, je peux vous expliquer le fonctionnement, les conditions et le temps à prévoir, sans engagement."}};
 const currentAdvice=adviceTemplates[adviceType];
 const s=state.status;
 const klaviyo=s?.quotas?.klaviyo||0, professional=s?.quotas?.professional||0;
 const visibleCards=state.cards; // Existing allocations remain owned by the consultant even if their saved sector changes.
 if(state.limited)return <main className={styles.page}>
   <h1>LeadFactory</h1><p>Pour accéder aux quotas gratuits, envoie ta demande d’accès consultant CHOGAN.</p>
   <a className={styles.button} href="/demande-consultant">Demander ou suivre mon accès consultant</a>
 </main>;

 return <div className={styles.page}>
  <a href="/consultant" style={{display:"inline-block",marginBottom:16}}>← Retour à l’espace Consultant</a>
  <div className={styles.hero}>
   <div><div className={styles.eyebrow}>TESAMI · Espace consultant</div><h1>LeadFactory</h1><p>Développe ton réseau local, découvre tes prospects et prépare des prises de contact professionnelles avec les bons outils.</p></div>
   <div className={styles.heroBadge}>✦ Prospection de proximité <button type="button" className={styles.heroDemoButton} onClick={()=>setDemo(v=>!v)}>{demo?"Fermer la démo":"Essayer la démo"}</button></div>
  </div>
  <div className={styles.stats}>
   <div className={styles.stat}><div className={styles.statLabel}>Mon abonnement</div><div className={styles.statValue}>{s?.plan||"—"}</div><div className={styles.statNote}>Formule actuelle</div><a className={styles.planChange} href="/plans">↻ Changer d’abonnement</a></div>
   <div className={styles.stat}><div className={styles.statLabel}>Contacts CHOGAN / jour</div><div className={styles.statValue}>{s?klaviyo:"—"}</div><div className={styles.statNote}>Quota maximum</div></div>
   <div className={styles.stat}><div className={styles.statLabel}>Prospects pros / jour</div><div className={styles.statValue}>{s?professional:"—"}</div><div className={styles.statNote}>Quota maximum</div></div>
   <div className={styles.stat}><div className={styles.statLabel}>Mes contacts</div><div className={styles.statValue}>{visibleCards.length}</div><div className={styles.statNote}>Actuellement attribués</div></div>
  </div>
  <section className={styles.panel} aria-labelledby="leadfactory-contact-notice" style={{marginBottom:20}}>
   <h2 id="leadfactory-contact-notice">Important avant de contacter un prospect</h2>
   <p>Les contacts CHOGAN proposés sont des clients potentiels. Certains peuvent toutefois être déjà consultants CHOGAN ou avoir laissé leurs coordonnées par erreur.</p>
   <p>Privilégiez un premier contact courtois par e-mail ou SMS, uniquement lorsque vous êtes autorisé à les solliciter. Présentez-vous clairement, indiquez l’origine réelle de leurs coordonnées et laissez-leur la possibilité de refuser tout nouveau contact.</p>
   <p><strong>Exemple de premier message</strong></p>
   <p>« Bonjour, je suis conseiller(ère) indépendant(e) CHOGAN dans votre région. Vous aviez commencé une commande de produits CHOGAN il y a quelque temps sans la finaliser. Je me permets de vous proposer mon aide si vous avez des questions ou souhaitez des renseignements. Si vous ne souhaitez pas être recontacté(e), dites-le-moi simplement. Belle journée ! »</p>
  </section>
  {state.loading&&<div className={styles.panel} role="status">Chargement de ton espace LeadFactory…</div>}
  {state.error&&<div className={styles.alert} role="alert"><p>{state.error}</p><button type="button" className={styles.button} onClick={load}>Réessayer le chargement</button>{state.error.includes("Connecte-toi")&&<a className={styles.loginLink} href="/login?next=%2Fleadfactory">Se connecter à TESAMI</a>}</div>}
  {state.limited&&<div className={styles.betaNotice} role="status"><strong>Bienvenue dans la bêta publique !</strong><p>Tu peux tester gratuitement les dix contacts fictifs, les conseils de prospection et l’interface. Les vrais contacts CHOGAN et professionnels ne sont pas accessibles aux comptes bêta non autorisés.</p><a href="/login?next=%2Fleadfactory">Gérer mon compte</a></div>}
  {(s||state.limited)&&<div className={styles.layout}>
   <div className={styles.panel}>
    <h2>📍 Choisir mon secteur</h2><p className={styles.muted}>Choisis une commune et un rayon pour retrouver tes prospects professionnels et tes contacts clients CHOGAN au même endroit. Les contacts non attribués restent privés.</p>
    <div role="tablist" aria-label="Type de prospects" className={styles.sectorTabs}>
      <button type="button" role="tab" aria-selected={sectorTab==="professional"} className={sectorTab==="professional"?styles.button:styles.buttonSecondary} onClick={()=>setSectorTab("professional")}>🏢 Prospects professionnels</button>
      <button type="button" role="tab" aria-selected={sectorTab==="klaviyo"} className={sectorTab==="klaviyo"?styles.button:styles.buttonSecondary} onClick={()=>setSectorTab("klaviyo")}>👤 Clients CHOGAN</button>
    </div>
    <p className={styles.muted}>{sectorTab==="professional"?"Recherche des professionnels dans le rayon sélectionné.":"Recherche des clients CHOGAN dans le rayon sélectionné. Le premier affichage d’un numéro compte dans ton quota."}</p>
    <label className={styles.label} htmlFor="lf-city">Ville ou code postal</label>
    <div className={styles.searchRow}><input className={styles.input} id="lf-city" value={cityQuery} disabled={savingSector} onChange={e=>{citySearchVersion.current++;setCityQuery(e.target.value);setSelectedCity(null);setCities([]);setSectorMessage("");}} onKeyDown={e=>{if(e.key==="Enter"&&!searchingCities&&cityQuery.trim().length>=2)searchCities();}} placeholder="Ex. Viarmes ou 95270"/><button className={styles.buttonSecondary} onClick={searchCities} disabled={searchingCities||cityQuery.trim().length<2}>{searchingCities?"Recherche…":"Rechercher"}</button></div>
    {cities.length>0&&<div style={{marginTop:12}}><label className={styles.label} htmlFor="lf-city-results">Sélectionner une commune ({cities.length} résultat{cities.length>1?"s":""})</label><select id="lf-city-results" className={styles.input} defaultValue="" onChange={e=>{const city=cities[Number(e.target.value)];if(!city)return;selectCity(city);setSectorMessage("Ville sélectionnée : "+city.name+(city.postcode?" ("+city.postcode+")":""));}}><option value="" disabled>Choisir une ville dans la liste…</option>{cities.map((city,i)=><option key={city.code+"-"+i} value={i}>{city.name}{city.postcode?" · "+city.postcode:""}</option>)}</select></div>}
    <label className={styles.label} htmlFor="lf-radius">Rayon de prospection : {radius} km</label>
    <input className={styles.range} id="lf-radius" type="range" min="5" max="50" step="5" value={radius} disabled={savingSector} onChange={e=>setRadius(Number(e.target.value))}/>
    <div className={styles.rangeLabels}><span>5 km</span><span>25 km</span><span>50 km</span></div>
    <div className={styles.sectorActions}>
      <button type="button" className={styles.button} onClick={searchProspectsInSector} disabled={savingSector||searchingCities||searchingProspects||!!contactRevealBusy||cityQuery.trim().length<2}>{searchingProspects?"Recherche en cours…":sectorTab==="professional"?"Rechercher des professionnels":"Rechercher des clients CHOGAN"}</button>
      <button type="button" className={styles.buttonSecondary} onClick={saveSector} disabled={savingSector||searchingCities||searchingProspects||cityQuery.trim().length<2}>{savingSector?"Enregistrement…":"Enregistrer mon secteur"}</button>
    </div>
    {sectorMessage&&<p className={styles.message} role="status">{sectorMessage}</p>}
    {prospectAvailability?.kind===sectorTab&&<div className={styles.panel} style={{marginTop:18}}>
      <h3>Résultats de recherche</h3>
      <p role="status">{prospectSearchMessage}</p>
      <div className={styles.cards}>
        {prospectAvailability.results.map(candidate=><article className={styles.leadCard} key={candidate.contact_id}>
          <h3>{candidate.company||(sectorTab==="klaviyo"?"Client potentiel CHOGAN":"Prospect professionnel")}</h3>
          <p>{[candidate.city,candidate.department].filter(Boolean).join(" · ")} · {candidate.distance_km.toFixed(1)} km</p>
          <button type="button" className={styles.button} disabled={!!contactRevealBusy||busy!==null} onClick={()=>claimCandidate(candidate,sectorTab)}>{contactRevealBusy===candidate.contact_id?"Ouverture…":"Contacter"}</button>
        </article>)}
      </div>
    </div>}
    {!prospectAvailability&&prospectSearchMessage&&<p role="status">{prospectSearchMessage}</p>}
    {sectorTab==="klaviyo"&&<div className={styles.panel} role="tabpanel" style={{marginTop:18}}>
      <h3>Mes clients CHOGAN attribués ({visibleCards.filter(card=>card.contact_kind==="klaviyo").length})</h3>
      <p className={styles.muted}>Ces contacts sont déjà attribués à ton compte. Ils ne sont pas encore filtrés par le rayon choisi.</p>
      {visibleCards.filter(card=>card.contact_kind==="klaviyo").length===0?<p>Aucun client CHOGAN attribué pour le moment.</p>:<div className={styles.cards}>{visibleCards.filter(card=>card.contact_kind==="klaviyo").map(card=><article className={styles.leadCard} key={card.allocation_id}><strong>{card.display_name||"Client CHOGAN"}</strong><p>{[card.city,card.department].filter(Boolean).join(" · ")||"Localisation non renseignée"}</p><button type="button" className={styles.buttonSecondary} onClick={()=>reveal(card.allocation_id)} disabled={busy===card.allocation_id}>{busy===card.allocation_id?"Ouverture…":"Contacter"}</button>{state.revealed[card.allocation_id]?.phone&&<p><a href={"tel:"+state.revealed[card.allocation_id].phone}>{state.revealed[card.allocation_id].phone}</a></p>}{state.revealed[card.allocation_id]?.email&&<p><a href={"mailto:"+state.revealed[card.allocation_id].email}>{state.revealed[card.allocation_id].email}</a></p>}</article>)}</div>}
    </div>}
   </div>
   <div className={styles.panel}>
    {contactReveal&&<section ref={contactDetails} tabIndex={-1} aria-labelledby="leadfactory-contact-details" className={styles.panel} style={{position:"sticky",top:16,zIndex:1,marginBottom:16,overflowWrap:"anywhere"}}>
      <h2 id="leadfactory-contact-details">{contactReveal.name||"Coordonnées du contact"}</h2>
      {contactReveal.phone&&<p>Téléphone <a href={"tel:"+contactReveal.phone}>{contactReveal.phone}</a></p>}
      {contactReveal.email&&<p>E-mail <a href={"mailto:"+contactReveal.email}>{contactReveal.email}</a></p>}
      <button className={styles.buttonSecondary} type="button" onClick={()=>setContactReveal(null)}>Fermer</button>
    </section>}
    <h2>🎯 Mes quotas du jour</h2><p className={styles.muted}>Retrouve ici tes quotas et le statut de ta demande quotidienne.</p>
    <div className={styles.quota}><span>Contacts CHOGAN</span><strong>{klaviyo}</strong></div>
    <div className={styles.quota}><span>Prospects professionnels</span><strong>{professional}</strong></div>
    <p className={styles.muted}>Secteur : <strong>{s?.sector?.city||"Non renseigné"}</strong> · Rayon : <strong>{s?.sector?.radius_km||"—"} km</strong></p>
    <p className={styles.muted}>Les recherches sont libres. Le premier affichage du numéro de chaque fiche utilise une place dans la catégorie correspondante.</p>
    {usage&&<p role="status">Numéros ouverts aujourd’hui : {usage.klaviyo_used}/{klaviyo} clients CHOGAN · {usage.professional_used}/{professional} professionnels</p>}
   </div>
  </div>}
  <div id="lf-my-prospects" className={styles.sectionHeading}><h2>Mes prospects — Google Sheets et CHOGAN</h2><button className={styles.buttonSecondary} onClick={()=>setAdviceOpen(v=>!v)}>{adviceOpen?"Masquer les conseils":"💬 Conseils pour contacter un pro"}</button></div>
  {s&&<p><a href="/consultant/rendez-vous#nouveau" className={styles.buttonSecondary}>Planifier un rendez-vous</a></p>}
  {s&&visibleCards.length>0&&<div className={styles.cards}>
    {visibleCards.map(card=>{
      const contact=state.revealed[card.allocation_id];
      return <article key={card.allocation_id} className={styles.leadCard}>
        <h3>{card.contact_kind==="klaviyo"?(card.display_name||"Contact CHOGAN"):"Prospect professionnel"}</h3>
        <p>{[card.city,card.department].filter(Boolean).join(" · ")}</p>
        <button type="button" className={styles.buttonSecondary} onClick={()=>reveal(card.allocation_id)} disabled={busy===card.allocation_id}>
          {busy===card.allocation_id?"Ouverture…":"Contacter"}
        </button>
        {(contact||card.contact_revealed)&&<p><a href={"/consultant/rendez-vous?lead="+encodeURIComponent(card.allocation_id)+"#nouveau"}>Planifier un rendez-vous</a></p>}
        {contact?.phone&&<p><a href={"tel:"+contact.phone}>{contact.phone}</a></p>}
        {contact?.email&&<p><a href={"mailto:"+contact.email}>{contact.email}</a></p>}
      </article>;
    })}
  </div>}
  {adviceOpen&&<div id="leadfactory-advice" className={styles.advice}><h2>Comment démarrer la discussion ?</h2><p className={styles.muted}>Sélectionne une approche et personnalise le texte selon l’activité du professionnel.</p><div className={styles.adviceTabs}>{Object.entries(adviceTemplates).map(([key,item])=><button key={key} className={adviceType===key?styles.tab+" "+styles.tabActive:styles.tab} onClick={()=>{setAdviceType(key);setAdviceCopied(false);}} aria-pressed={adviceType===key}>{item.title}</button>)}</div><h3>{currentAdvice.title}</h3><p>{currentAdvice.tip}</p><div className={styles.script}>{currentAdvice.message}</div><div style={{marginTop:14}}><button className={styles.button} onClick={async()=>{try{await navigator.clipboard.writeText(currentAdvice.message);setAdviceCopied(true);}catch{setAdviceCopied(false);}}}>{adviceCopied?"Message copié !":"Copier le message"}</button></div><p className={styles.footnote}>Respecte les règles de prospection professionnelle, les refus et les demandes d’opposition. Ne promets pas de revenus.</p></div>}
  {demo&&<div className={styles.demoPanel} role="region" aria-label="Démonstration avec prospects fictifs"><strong>🧪 Simulation bêta — données 100 % fictives</strong><p>Voici un aperçu de cinq contacts clients CHOGAN et cinq prospects professionnels. Aucun vrai contact n’est attribué, aucun quota n’est consommé et aucune coordonnée personnelle n’est révélée.</p><div className={styles.demoGrid}>{Array.from({length:10},(_,i)=><div className={styles.demoItem} key={i}><strong>{i<5?"Client CHOGAN":"Professionnel"} · Démo {i%5+1}</strong><span>{i<5?"Panier abandonné fictif":"Entreprise fictive"} · Exemple uniquement</span><button className={styles.buttonSecondary} type="button" onClick={()=>{setAdviceOpen(true);setAdviceType(i<5?"products":"partnership");setAdviceCopied(false);}}>Préparer un message</button></div>)}</div></div>}


 </div>;
}
