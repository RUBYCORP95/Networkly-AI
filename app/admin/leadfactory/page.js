"use client";
import {useState,useRef} from "react";
import styles from "./leadfactory.module.css";
import {createClient} from "../../../lib/supabase/client";
export default function LeadFactoryAdmin(){
 const stopImport=useRef(false);const [importProgress,setImportProgress]=useState(null);const [importing,setImporting]=useState(false);
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState("");
 const [contacts,setContacts]=useState([]),[contactTotal,setContactTotal]=useState(0),[contactPage,setContactPage]=useState(0),[search,setSearch]=useState(""),[contactLoading,setContactLoading]=useState(false);const [cursor,setCursor]=useState(null),[totals,setTotals]=useState({checked:0,eligible:0,skipped:0,batches:0});
 async function run(name,nextCursor=null,commit=false){
  setBusy(true);setError("");setResult(null);
  try{
   const supabase=createClient();
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError||!session?.access_token)throw new Error("Connecte-toi avec ton compte administrateur TESAMI.");
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/"+name;
   const isImport=name==="leadfactory-klaviyo-import";
   const response=await fetch(url,{method:isImport?"POST":"GET",headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json","apikey":process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY},...(isImport?{body:JSON.stringify({commit,...(nextCursor?{cursor:nextCursor}:{})})}:{})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||data.message||"Erreur "+response.status);
   setResult(data);
   if(isImport){setCursor(data.next_cursor||null);if(!commit)setTotals(t=>({checked:t.checked+(data.checked||0),eligible:t.eligible+(data.eligible||0),skipped:t.skipped+(data.skipped||0),batches:t.batches+1}));if(commit)await loadContacts(0,search);}
  }catch(e){setError(e.message||"Erreur inconnue")}finally{setBusy(false)}
 }
 async function importAll(){
  if(!window.confirm("Importer tous les profils techniquement éligibles depuis Klaviyo dans l’administration privée ? Les consultants n’y auront pas accès et aucun contact ne sera sollicité."))return;
  stopImport.current=false;setImporting(true);setBusy(true);setError("");
  let next=null,seen=new Set(),checked=0,eligible=0,imported=0,excluded=0,batches=0;
  try{
   const supabase=createClient();
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError||!session?.access_token)throw new Error("Connexion administrateur requise.");
   do{
    if(stopImport.current)break;
    if(next&&seen.has(next))throw new Error("Pagination Klaviyo répétée : import interrompu pour éviter une boucle.");
    if(next)seen.add(next);
    const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/leadfactory-klaviyo-import",{
     method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json",apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY},
     body:JSON.stringify({commit:true,...(next?{cursor:next}:{})})
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||data.message||"Erreur d'importation "+response.status);
    checked+=data.checked||0;eligible+=data.eligible||0;excluded+=data.skipped||0;
    imported+=data.imported??data.saved??data.upserted??0;
    batches++;
    next=data.next_cursor||null;
    setImportProgress({checked,eligible,excluded,imported,batches,done:!next});
    if(batches>=1000&&next)throw new Error("Limite de sécurité de 1 000 lots atteinte.");
   }while(next);
   await loadContacts(0,"");
   setSearch("");
  }catch(e){setError((e.message||"Erreur d'importation")+" — les lots précédents restent enregistrés. Vous pouvez relancer l'import sans doublons.");}
  finally{setImporting(false);setBusy(false);}
 }
 async function loadContacts(page=0,q=search){setContactLoading(true);setError("");try{const supabase=createClient();const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Connexion administrateur requise");const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/leadfactory-private-contacts?page="+page+"&search="+encodeURIComponent(q),{headers:{Authorization:"Bearer "+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}});const data=await response.json();if(!response.ok)throw new Error(data.error||"Erreur de chargement");setContacts(data.contacts||[]);setContactTotal(data.total||0);setContactPage(page);}catch(e){setError(e.message||"Erreur de chargement")}finally{setContactLoading(false)}}

 const [auditBusy,setAuditBusy]=useState(false),[audit,setAudit]=useState(null),[auditError,setAuditError]=useState("");
 async function runProfessionalAudit(){
  setAuditBusy(true);setAuditError("");
  try{
   const {data:{session}}=await createClient().auth.getSession();
   if(!session?.access_token)throw new Error("Connexion administrateur requise");
   const res=await fetch("/api/leadfactory/professional-audit",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
   const data=await res.json();if(!res.ok)throw new Error(data.error||"Vérification impossible");
   setAudit(data);
  }catch(e){setAuditError(e.message||"Erreur de vérification")}finally{setAuditBusy(false)}
 }
 const [sheetBusy,setSheetBusy]=useState(false),[sheetResult,setSheetResult]=useState(null),[sheetError,setSheetError]=useState("");
 async function synchronizeSheet(){
  setSheetBusy(true);setSheetResult(null);setSheetError("");
  try{
   const {data:{session}}=await createClient().auth.getSession();
   if(!session?.access_token)throw new Error("Connexion administrateur requise.");
   const response=await fetch("/api/leadfactory/google-sheets-sync",{method:"POST",headers:{Authorization:"Bearer "+session.access_token}});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Synchronisation impossible");
   setSheetResult(data);
  }catch(error){setSheetError(error.message||"Erreur de synchronisation");}
  finally{setSheetBusy(false);}
 }
 const [geoBusy,setGeoBusy]=useState(false),[geoResult,setGeoResult]=useState(null),[geoError,setGeoError]=useState("");
 const [geoOffset,setGeoOffset]=useState(0);
 async function geocodeProfessionals(){
  setGeoBusy(true);setGeoError("");setGeoResult(null);
  try{
   const {data:{session}}=await createClient().auth.getSession();
   if(!session?.access_token)throw new Error("Connexion administrateur requise.");
   const response=await fetch("/api/leadfactory/geocode-professionals",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify({offset:geoOffset})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||"Géolocalisation impossible");
   setGeoResult(data);
   setGeoOffset(data.nextOffset??0);
  }catch(error){setGeoError(error.message||"Erreur de géolocalisation");}
  finally{setGeoBusy(false);}
 }
 const [proFile,setProFile]=useState(null),[proBusy,setProBusy]=useState(false),[proResult,setProResult]=useState(null),[proError,setProError]=useState("");
 function parseCSV(text){
  text=text.replace(/^\\uFEFF/,"");const first=text.split(/\\r?\\n/,1)[0]||"";const delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?";":",";
  const data=[];let row=[],field="",quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(field);field="";}else if((c==="\\n"||c==="\\r")&&!quoted){if(c==="\\r"&&text[i+1]==="\\n")i++;row.push(field);if(row.some(x=>x.trim()))data.push(row);row=[];field="";}else field+=c;}
  if(quoted)throw new Error("CSV incorrect : guillemets non fermés.");
  row.push(field);if(row.some(x=>x.trim()))data.push(row);return data;
 }
 async function importProfessionals(){
  if(!proFile)return;setProBusy(true);setProError("");setProResult(null);
  try{
   if(proFile.size>8*1024*1024)throw new Error("Fichier trop volumineux (maximum 8 Mo).");
   const rows=parseCSV(await proFile.text());if(rows.length<2)throw new Error("Le fichier ne contient aucune entreprise.");
   const norm=s=>String(s||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
   const aliases={source_id:["idprospect","identifiant","id"],company:["entreprise","societe","raison sociale","raisonsociale","company"],sector:["activite","secteur"],first_name:["prenom"],last_name:["nom","nomcontact"],phone:["telephone","tel","mobile"],email:["email","mail","courriel"],address:["adresse"],postal_code:["codepostal","cp"],city:["ville"],department:["departement"],website:["siteinternet","siteweb","website"],source:["source"],notes:["notes","commentaire"]};
   const cols=rows[0].map(norm);const positions=Object.fromEntries(Object.entries(aliases).map(([k,a])=>[k,cols.findIndex(h=>a.map(norm).includes(h))]));
   if(positions.company<0)throw new Error("Colonne Entreprise introuvable dans le CSV.");
   if(positions.source_id<0&&positions.email<0&&positions.phone<0)throw new Error("Ajoute une colonne ID prospect, Email ou Téléphone.");
   const items=rows.slice(1).filter(r=>r.some(v=>String(v).trim())).map(r=>Object.fromEntries(Object.entries(positions).map(([k,i])=>[k,i<0?"":r[i]||""])));
   if(items.length>20000)throw new Error("Maximum 20 000 prospects par fichier.");
   if(!window.confirm("Importer "+items.length+" lignes professionnelles ? Les contacts déjà connus seront ignorés, sans modifier leurs statuts."))return;
   const supabase=createClient();const {data:{session}}=await supabase.auth.getSession();if(!session?.access_token)throw new Error("Connexion administrateur requise.");
   const total={imported:0,duplicates:0,invalid:0,processed:0};
   for(let i=0;i<items.length;i+=100){
    const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/leadfactory-professionals-import",{method:"POST",headers:{Authorization:"Bearer "+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,"Content-Type":"application/json"},body:JSON.stringify({rows:items.slice(i,i+100)})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||"Erreur serveur");
    for(const k of Object.keys(total))total[k]+=data[k]||0;
    setProResult({...total,inProgress:true});
   }
   setProResult({...total,inProgress:false});
  }catch(e){setProError(e.message||"Import impossible");}finally{setProBusy(false)}
 }

 function reset(){setCursor(null);setTotals({checked:0,eligible:0,skipped:0,batches:0});setResult(null);setError("")}
 const isBatch=result&&typeof result.checked==="number";
 return <main className={styles.page}><div className={styles.wrap}>
 <header className={styles.top}><div><p className={styles.eyebrow}>TESAMI / LEADFACTORY</p><h1 className={styles.heading}>Gestion des prospects</h1><p className={styles.sub}>Deux sources distinctes : Klaviyo pour les prospects clients et Google Sheets pour les professionnels. Les contacts restent privés avant attribution autorisée.</p></div><a className={styles.back} href="/">← Tableau de bord TESAMI</a></header>
 <section className={styles.card} aria-label="Vérification des professionnels">
 <h2 className={styles.sectionTitle}>Vérification automatique des fiches professionnelles</h2>
 <p className={styles.muted}>Contrôle les coordonnées, la localisation, la source et les doublons. Une fiche techniquement correcte n'est pas automatiquement autorisée à être distribuée : l'origine et les éventuelles oppositions à la prospection doivent aussi être vérifiées.</p>
 <div className={styles.actions}><button className={styles.button} type="button" disabled={auditBusy} onClick={runProfessionalAudit}>{auditBusy?"Vérification en cours…":"Vérifier les prospects maintenant"}</button></div>
 {auditError&&<p className={styles.notice} role="alert">{auditError}</p>}
 {audit&&<div style={{marginTop:18}}>
 <div className={styles.stats}>
 <div className={styles.stat}><p className={styles.statLabel}>Fiches contrôlées</p><p className={styles.statNumber}>{audit.stats.total}</p></div>
 <div className={styles.stat}><p className={styles.statLabel}>Qualité conforme</p><p className={styles.statNumber}>{audit.stats.qualityReady}</p></div>
 <div className={styles.stat}><p className={styles.statLabel}>À corriger</p><p className={styles.statNumber}>{audit.stats.needsReview}</p></div>
 <div className={styles.stat}><p className={styles.statLabel}>Distribuables</p><p className={styles.statNumber}>{audit.stats.distributable}</p></div>
 </div>
 <p className={styles.muted}>Doublons possibles : {audit.stats.duplicate} · Géolocalisées : {audit.stats.geocoded} · Sans contact : {audit.stats.missingContact} · Localisation incomplète : {audit.stats.missingLocation}.</p>
 <h3>Critères automatiques</h3><ul>{audit.criteria.map(x=><li key={x}>{x}</li>)}</ul>
 <p className={styles.notice}>{audit.distributionRule}</p>
 <div style={{maxHeight:400,overflowY:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th align="left">Entreprise</th><th align="left">Ville</th><th align="left">Contrôle</th><th align="left">Distribution</th></tr></thead><tbody>{audit.records.map(r=><tr key={r.id}><td style={{padding:8}}>{r.company}</td><td>{r.city}</td><td>{r.quality==="ready"?"Qualité conforme":r.reasons.join(" · ")}</td><td>{r.distributable?"Statut autorisé":"Non autorisée"}</td></tr>)}</tbody></table></div>
 {audit.truncated&&<p className={styles.muted}>Affichage limité aux 300 premières fiches.</p>}
 </div>}
 </section>
 <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Professionnels · Source Google Sheets</h2><p className={styles.muted}>Import sécurisé depuis « syncro BTOB TESAMI ». Les nouveaux contacts restent privés dans l’administration et ne sont jamais attribués automatiquement.</p></div><span className={styles.status}>Accès administrateur</span></div><div className={styles.actions}><button className={styles.button} type="button" disabled={sheetBusy} onClick={synchronizeSheet}>{sheetBusy?"Synchronisation en cours…":"Synchroniser Google Sheets maintenant"}</button><a href="https://docs.google.com/spreadsheets/d/1_8u7XQknjBcsttXbfjWpMgNuSJs9qiUigGYg_UGijaE/edit" target="_blank" rel="noopener noreferrer">Ouvrir le fichier source</a></div>{sheetError&&<p className={styles.notice} role="alert">{sheetError}</p>}{sheetResult&&<p className={styles.info} role="status">Synchronisation terminée : {sheetResult.imported} importés · {sheetResult.duplicates} doublons · {sheetResult.invalid} invalides · {sheetResult.geocoded} nouveaux géolocalisés · {sheetResult.updatedCoordinates||0} existants géolocalisés · {sheetResult.missingCoordinates} sans coordonnées.</p>}</section>
 <section className={styles.card}><h2 className={styles.sectionTitle}>Géolocalisation des prospects professionnels</h2><p className={styles.muted}>Calcule les positions des contacts privés par lots de 20, sans attribuer de prospect ni modifier son éligibilité. Les fiches sans résultat fiable restent à vérifier.</p><div className={styles.actions}><button className={styles.button} type="button" disabled={geoBusy} onClick={geocodeProfessionals}>{geoBusy?"Géolocalisation en cours…":geoOffset?"Continuer la géolocalisation (20 suivants)":"Géolocaliser 20 prospects"}</button></div>{geoError&&<p className={styles.notice} role="alert">{geoError}</p>}{geoResult&&<p className={styles.info} role="status">{geoResult.geocoded} géolocalisés · {geoResult.unresolved} à vérifier · {geoResult.remaining} sans coordonnées · {geoResult.nextOffset==null?"Fin du passage":"Prochain lot : "+(geoResult.nextOffset+1)+" à "+(geoResult.nextOffset+20)}. Aucune attribution automatique.</p>}</section>
 <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Professionnels · Import manuel Excel / CSV</h2><p className={styles.muted}>Dans Excel ou Google Sheets, exportez votre fichier au format CSV (séparateur virgule ou point-virgule). Les prospects déjà importés ne sont jamais réajoutés, même après un nouvel import.</p></div><span className={styles.status}>Anti-doublons actif</span></div><div className={styles.actions}><input aria-label="Fichier CSV des professionnels" type="file" accept=".csv,text/csv" onChange={e=>{setProFile(e.target.files?.[0]||null);setProResult(null);setProError("");}} style={{maxWidth:"100%",alignSelf:"center"}}/><button className={styles.button} type="button" disabled={!proFile||proBusy} onClick={importProfessionals}>{proBusy?"Import en cours…":"Importer les professionnels"}</button></div><p className={styles.muted} style={{marginTop:12}}>Colonnes reconnues : ID prospect, Entreprise, Activité, Prénom, Nom, Téléphone, Email, Adresse, Code postal, Ville, Département, Site internet, Source et Notes. Les statuts et attributions existants sont préservés.</p>{proError&&<p className={styles.notice} role="alert">{proError}</p>}{proResult&&<p className={styles.info} role="status">{proResult.inProgress?"Import en cours · ":"Import terminé · "}{proResult.imported} nouveaux · {proResult.duplicates} doublons ignorés · {proResult.invalid} lignes invalides · {proResult.processed} lignes traitées.</p>}</section>\n <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Clients · Source Klaviyo — connexion et simulation</h2><p className={styles.muted}>Vérifiez votre connexion Klaviyo puis analysez vos contacts, lot par lot.</p></div><span className={styles.status}><span className={styles.dot}></span>Mode simulation sécurisé</span></div>
 <div className={styles.actions}><button className={styles.button+" "+styles.secondary} type="button" disabled={busy} onClick={()=>run("leadfactory-klaviyo-status")}>Tester la connexion Klaviyo</button><button className={styles.button} type="button" disabled={busy} onClick={()=>{reset();run("leadfactory-klaviyo-import")}}>Simuler les 20 premiers profils</button></div>
 {busy&&<p role="status" className={styles.muted} style={{marginTop:16}}>Analyse en cours…</p>}{error&&<p role="alert" className={styles.notice}>{error}</p>}
 {result&&!isBatch&&<p className={styles.info} aria-live="polite">{result.klaviyo_reachable?"✓ Connexion Klaviyo opérationnelle (HTTP "+result.klaviyo_status+")":result.message||"Connexion à vérifier (HTTP "+result.klaviyo_status+")"}</p>}
 </section>
 <section aria-label="Statistiques de simulation"><div className={styles.stats}><div className={styles.stat}><p className={styles.statLabel}>Profils vérifiés</p><p className={styles.statNumber}>{totals.checked}</p></div><div className={styles.stat}><p className={styles.statLabel}>Éligibles techniques</p><p className={styles.statNumber+" "+styles.purple}>{totals.eligible}</p></div><div className={styles.stat}><p className={styles.statLabel}>Profils exclus</p><p className={styles.statNumber}>{totals.skipped}</p></div></div></section>
 <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Progression de l'analyse</h2><p className={styles.muted}>{totals.batches===0?"Lancez une simulation pour afficher les résultats.":totals.batches+" lot(s) analysé(s) • "+totals.checked+" profils examinés"}</p></div>{<span className={styles.status}>{contactTotal} contact(s) en base privée</span>}</div>
 {isBatch&&<div style={{marginTop:20}}><p className={styles.muted}>Dernier lot : <strong>{result.checked} vérifiés</strong> · {result.eligible} éligibles · {result.skipped} exclus</p></div>}
 <div className={styles.actions}><button type="button" className={styles.button+" "+styles.secondary} disabled={busy} onClick={importAll}>{importing?"Importation en cours…":"Importer tous les contacts éligibles en privé"}</button>{importing&&<button type="button" className={styles.button+" "+styles.secondary} onClick={()=>{stopImport.current=true}}>Arrêter après ce lot</button>}</div>{importProgress&&<div className={styles.info} role="status" aria-live="polite"><strong>{importProgress.done?"Importation terminée":"Importation en progression"}</strong> · {importProgress.batches} lot(s) · {importProgress.checked} profils vérifiés · {importProgress.eligible} éligibles. Les contacts sont conservés uniquement dans l’administration. <div style={{height:8,background:"#e9e1f8",borderRadius:8,marginTop:10,overflow:"hidden"}}><div style={{height:"100%",width:importProgress.done?"100%":"65%",background:"#6d3de7",borderRadius:8}}/></div></div>}
 {isBatch&&cursor&&<div className={styles.actions}><button className={styles.button} type="button" disabled={busy} onClick={()=>run("leadfactory-klaviyo-import",cursor)}>Analyser les 20 profils suivants →</button></div>}
 {isBatch&&!cursor&&<p className={styles.info}>Tous les lots disponibles ont été parcourus.</p>}
 <div className={styles.info}>🔒 Simulation uniquement : aucune donnée personnelle n'est enregistrée ou distribuée. L'éligibilité technique ne constitue pas un consentement à la prospection par des consultants.</div>
 </section><section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Contacts privés Klaviyo</h2><p className={styles.muted}>Réservé aux administrateurs · {contactTotal} contact(s) enregistré(s)</p></div><button className={styles.button+" "+styles.secondary} type="button" disabled={contactLoading} onClick={()=>loadContacts(0,search)}>Actualiser la liste</button></div><form className={styles.actions} onSubmit={e=>{e.preventDefault();loadContacts(0,search)}}><input aria-label="Rechercher un contact" placeholder="Nom, email, ville ou département" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:"1 1 250px",minHeight:46,padding:"12px",border:"1px solid #ddd5ef",borderRadius:10}}/><button className={styles.button} type="submit" disabled={contactLoading}>Rechercher</button></form><div style={{overflowX:"auto",marginTop:20}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}><thead><tr>{["Contact","Email","Téléphone","Ville","Département","Abandon","Consentement"].map(h=><th key={h} style={{padding:"12px 10px",borderBottom:"1px solid #e9e5f3",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{contacts.map(p=><tr key={p.id}><td style={{padding:10,borderBottom:"1px solid #eee"}}>{[p.first_name,p.last_name].filter(Boolean).join(" ")||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.email||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.phone||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.city||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.department||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.last_abandoned_at?new Date(p.last_abandoned_at).toLocaleDateString("fr-FR"):"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.consent_status||"inconnu"}</td></tr>)}</tbody></table>{!contacts.length&&<p className={styles.muted} style={{marginTop:18}}>Aucun contact affiché. Cliquez sur « Actualiser la liste » pour charger les contacts privés.</p>}</div><div className={styles.actions}><button className={styles.button+" "+styles.secondary} type="button" disabled={contactLoading||contactPage===0} onClick={()=>loadContacts(contactPage-1,search)}>Précédent</button><span style={{alignSelf:"center"}}>Page {contactPage+1}</span><button className={styles.button+" "+styles.secondary} type="button" disabled={contactLoading||(contactPage+1)*20>=contactTotal} onClick={()=>loadContacts(contactPage+1,search)}>Suivant</button></div></section><footer className={styles.foot}><a href="/admin">Administration</a><a href="/">Accueil TESAMI</a></footer>
 </div></main>
}