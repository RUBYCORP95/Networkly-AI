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
 const [consultantsOnly,setConsultantsOnly]=useState(false);
 const [qualificationBusy,setQualificationBusy]=useState(false);
 async function privateContactsRequest(path,options={}){
  const {data:{session}}=await createClient().auth.getSession();
  if(!session?.access_token)throw new Error("Connexion administrateur requise");
  const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/leadfactory-private-contacts"+path,{
   ...options,headers:{Authorization:"Bearer "+session.access_token,apikey:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,...options.headers}
  });
  if(!response.ok)throw new Error((await response.json().catch(()=>null))?.error||"Erreur LeadFactory");
  return response;
 }
 async function updateQualification(id,status){
  setQualificationBusy(true);setError("");
  try{
   await privateContactsRequest("",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status:status||null})});
   await loadContacts(consultantsOnly?0:contactPage,search);
  }catch(e){setError(e.message)}finally{setQualificationBusy(false)}
 }
 async function reviewContact(p,status){
  const note=window.prompt(status==="approved"?"Indiquez la preuve vérifiée (date, source et référence de l'accord de transmission aux consultants) :":status==="rejected"?"Motif du refus (facultatif) :":"Note de vérification (facultative) :",p.manual_review_note||"");
  if(note===null)return;
  if(status==="approved"&&!note.trim()){setError("La validation nécessite une référence de preuve.");return;}
  setQualificationBusy(true);setError("");
  try{await privateContactsRequest("",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:p.id,action:"manual_review",review_status:status,note})});await loadContacts(contactPage,search);}
  catch(e){setError(e.message)}finally{setQualificationBusy(false)}
 }
 async function exportConsultants(){
  setQualificationBusy(true);setError("");
  try{
   const response=await privateContactsRequest("?export=consultants");
   const url=URL.createObjectURL(await response.blob());
   const link=document.createElement("a");
   link.href=url;link.download="tesami-deja-consultants.csv";link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError(e.message)}finally{setQualificationBusy(false)}
 }
 async function loadContacts(page=0,q=search,onlyConsultants=consultantsOnly){
  setContactLoading(true);setError("");
  try{
   const params=new URLSearchParams({page,search:q});
   if(onlyConsultants)params.set("status","consultant");
   const data=await (await privateContactsRequest("?"+params)).json();
   setContacts(data.contacts||[]);setContactTotal(data.total||0);setContactPage(page);
  }catch(e){setError(e.message||"Erreur de chargement")}finally{setContactLoading(false)}
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
 <header className={styles.top}><div><p className={styles.eyebrow}>TESAMI / LEADFACTORY</p><h1 className={styles.heading}>Import Klaviyo</h1><p className={styles.sub}>Retrouvez et analysez les paniers abandonnés depuis au moins 60 jours, sans commande ultérieure.</p></div><a className={styles.back} href="/">← Tableau de bord TESAMI</a></header>
 <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Prospects professionnels · Import Excel / CSV</h2><p className={styles.muted}>Dans Excel ou Google Sheets, exportez votre fichier au format CSV (séparateur virgule ou point-virgule). Les prospects déjà importés ne sont jamais réajoutés, même après un nouvel import.</p></div><span className={styles.status}>Anti-doublons actif</span></div><div className={styles.actions}><input aria-label="Fichier CSV des professionnels" type="file" accept=".csv,text/csv" onChange={e=>{setProFile(e.target.files?.[0]||null);setProResult(null);setProError("");}} style={{maxWidth:"100%",alignSelf:"center"}}/><button className={styles.button} type="button" disabled={!proFile||proBusy} onClick={importProfessionals}>{proBusy?"Import en cours…":"Importer les professionnels"}</button></div><p className={styles.muted} style={{marginTop:12}}>Colonnes reconnues : ID prospect, Entreprise, Activité, Prénom, Nom, Téléphone, Email, Adresse, Code postal, Ville, Département, Site internet, Source et Notes. Les statuts et attributions existants sont préservés.</p>{proError&&<p className={styles.notice} role="alert">{proError}</p>}{proResult&&<p className={styles.info} role="status">{proResult.inProgress?"Import en cours · ":"Import terminé · "}{proResult.imported} nouveaux · {proResult.duplicates} doublons ignorés · {proResult.invalid} lignes invalides · {proResult.processed} lignes traitées.</p>}</section>
 <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Connexion et simulation</h2><p className={styles.muted}>Vérifiez votre connexion Klaviyo puis analysez vos contacts, lot par lot.</p></div><span className={styles.status}><span className={styles.dot}></span>Mode simulation sécurisé</span></div>
 <div className={styles.actions}><button className={styles.button+" "+styles.secondary} type="button" disabled={busy} onClick={()=>run("leadfactory-klaviyo-status")}>Tester la connexion Klaviyo</button><button className={styles.button} type="button" disabled={busy} onClick={()=>{reset();run("leadfactory-klaviyo-import")}}>Simuler les 20 premiers profils</button><button className={styles.button+" "+styles.secondary} type="button" disabled={busy} onClick={()=>{if(window.confirm("Enregistrer les profils éligibles du premier lot dans l’administration privée ?"))run("leadfactory-klaviyo-import",null,true);}}>Importer le premier lot en privé</button></div>
 {busy&&<p role="status" className={styles.muted} style={{marginTop:16}}>Analyse en cours…</p>}{error&&<p role="alert" className={styles.notice}>{error}</p>}
 {result&&!isBatch&&<p className={styles.info} aria-live="polite">{result.klaviyo_reachable?"✓ Connexion Klaviyo opérationnelle (HTTP "+result.klaviyo_status+")":result.message||"Connexion à vérifier (HTTP "+result.klaviyo_status+")"}</p>}
 </section>
 <section aria-label="Statistiques de simulation"><div className={styles.stats}><div className={styles.stat}><p className={styles.statLabel}>Profils vérifiés</p><p className={styles.statNumber}>{totals.checked}</p></div><div className={styles.stat}><p className={styles.statLabel}>Éligibles techniques</p><p className={styles.statNumber+" "+styles.purple}>{totals.eligible}</p></div><div className={styles.stat}><p className={styles.statLabel}>Profils exclus</p><p className={styles.statNumber}>{totals.skipped}</p></div></div></section>
 <section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Progression de l'analyse</h2><p className={styles.muted}>{totals.batches===0?"Lancez une simulation pour afficher les résultats.":totals.batches+" lot(s) analysé(s) • "+totals.checked+" profils examinés"}</p></div>{<span className={styles.status}>{contactTotal} contact(s) en base privée</span>}</div>
 {isBatch&&<div style={{marginTop:20}}><p className={styles.muted}>Dernier lot : <strong>{result.checked} vérifiés</strong> · {result.eligible} éligibles · {result.skipped} écartés{result.committed&&<> · {result.imported} enregistrés ou actualisés</>}</p><p className={styles.muted}>{result.excluded??0} oppositions ou exclusions · {result.incomplete??0} fiches incomplètes · {result.missing_coordinates??0} fiches éligibles sans coordonnées</p></div>}
 <div className={styles.actions}><button type="button" className={styles.button+" "+styles.secondary} disabled={busy} onClick={importAll}>{importing?"Importation en cours…":"Synchroniser Klaviyo en privé"}</button>{importing&&<button type="button" className={styles.button+" "+styles.secondary} onClick={()=>{stopImport.current=true}}>Arrêter après ce lot</button>}</div>{importProgress&&<div className={styles.info} role="status" aria-live="polite"><strong>{importProgress.done?"Importation terminée":"Importation en progression"}</strong> · {importProgress.batches} lot(s) · {importProgress.checked} profils vérifiés · {importProgress.imported} enregistrés ou actualisés · {importProgress.excluded} exclus. Les contacts sont conservés uniquement dans l’administration. <div style={{height:8,background:"#e9e1f8",borderRadius:8,marginTop:10,overflow:"hidden"}}><div style={{height:"100%",width:importProgress.done?"100%":"65%",background:"#6d3de7",borderRadius:8}}/></div></div>}
 {isBatch&&cursor&&<div className={styles.actions}><button className={styles.button} type="button" disabled={busy} onClick={()=>run("leadfactory-klaviyo-import",cursor)}>Analyser les 20 profils suivants →</button></div>}
 {isBatch&&!cursor&&<p className={styles.info}>Tous les lots disponibles ont été parcourus.</p>}
 <div className={styles.info}>🔒 Simulation uniquement : aucune donnée personnelle n'est enregistrée ou distribuée. L'éligibilité technique ne constitue pas un consentement à la prospection par des consultants.</div>
 </section><section className={styles.card}><div className={styles.detail}><div><h2 className={styles.sectionTitle}>Contacts privés Klaviyo</h2><p className={styles.muted}>Réservé aux administrateurs · {contactTotal} contact(s) enregistré(s) · La validation exige une preuve de l’accord de transmission aux consultants. Elle ne remplace pas le consentement Klaviyo et ne déclenche aucune attribution.</p></div><button className={styles.button+" "+styles.secondary} type="button" disabled={contactLoading} onClick={()=>loadContacts(0,search)}>Actualiser la liste</button></div><div className={styles.actions}><button className={styles.button+" "+styles.secondary} type="button" aria-pressed={consultantsOnly} disabled={contactLoading||qualificationBusy} onClick={()=>{setConsultantsOnly(!consultantsOnly);loadContacts(0,search,!consultantsOnly)}}>{consultantsOnly?"Afficher tous les contacts":"Voir les contacts déjà consultants"}</button><button className={styles.button} type="button" disabled={qualificationBusy} onClick={exportConsultants}>Exporter les e-mails des consultants (CSV)</button></div><form className={styles.actions} onSubmit={e=>{e.preventDefault();loadContacts(0,search)}}><input aria-label="Rechercher un contact" placeholder="Nom, email, ville ou département" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:"1 1 250px",minHeight:46,padding:"12px",border:"1px solid #ddd5ef",borderRadius:10}}/><button className={styles.button} type="submit" disabled={contactLoading}>Rechercher</button></form><div style={{overflowX:"auto",marginTop:20}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}><thead><tr>{["Contact","Email","Téléphone","Ville","Département","Abandon","Consentement Klaviyo","Statut","Validation manuelle"].map(h=><th key={h} style={{padding:"12px 10px",borderBottom:"1px solid #e9e5f3",whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead><tbody>{contacts.map(p=><tr key={p.id}><td style={{padding:10,borderBottom:"1px solid #eee"}}>{[p.first_name,p.last_name].filter(Boolean).join(" ")||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.email||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.phone||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.city||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.department||"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.last_abandoned_at?new Date(p.last_abandoned_at).toLocaleDateString("fr-FR"):"—"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}>{p.consent_status||"inconnu"}</td><td style={{padding:10,borderBottom:"1px solid #eee"}}><select aria-label={"Statut de "+(p.email||p.id)} value={p.qualification_status||""} disabled={qualificationBusy||contactLoading} onChange={e=>updateQualification(p.id,e.target.value)}><option value="">À qualifier</option><option value="interested">Intéressé</option><option value="not_interested">Pas intéressé</option><option value="consultant">Déjà consultant</option></select></td><td style={{padding:10,borderBottom:"1px solid #eee",minWidth:170}}><select aria-label={"Validation manuelle de "+(p.email||p.id)} value={p.manual_review_status||"pending"} disabled={qualificationBusy||contactLoading} onChange={e=>reviewContact(p,e.target.value)}><option value="pending">À vérifier</option><option value="approved">Validé avec preuve</option><option value="rejected">Refusé</option></select>{p.manual_review_note&&<div style={{fontSize:11,marginTop:5,maxWidth:210,overflowWrap:"anywhere"}} title={p.manual_review_note}>{p.manual_review_note}</div>}</td></tr>)}</tbody></table>{!contacts.length&&<p className={styles.muted} style={{marginTop:18}}>Aucun contact affiché. Cliquez sur « Actualiser la liste » pour charger les contacts privés.</p>}</div><div className={styles.actions}><button className={styles.button+" "+styles.secondary} type="button" disabled={contactLoading||contactPage===0} onClick={()=>loadContacts(contactPage-1,search)}>Précédent</button><span style={{alignSelf:"center"}}>Page {contactPage+1}</span><button className={styles.button+" "+styles.secondary} type="button" disabled={contactLoading||(contactPage+1)*20>=contactTotal} onClick={()=>loadContacts(contactPage+1,search)}>Suivant</button></div></section><footer className={styles.foot}><a href="/admin">Administration</a><a href="/">Accueil TESAMI</a></footer>
 </div></main>
}