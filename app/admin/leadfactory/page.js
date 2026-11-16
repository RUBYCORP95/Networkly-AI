"use client";
import {useState} from "react";
import {createClient} from "../../../lib/supabase/client";
export default function LeadFactoryAdmin(){
 const [busy,setBusy]=useState(false),[result,setResult]=useState(null),[error,setError]=useState("");
 async function run(name){
  setBusy(true);setError("");setResult(null);
  try{
   const supabase=createClient();
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError||!session?.access_token)throw new Error("Connecte-toi avec ton compte administrateur TESAMI.");
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL+"/functions/v1/"+name;
   const response=await fetch(url,{method:name==="leadfactory-klaviyo-status"?"GET":"POST",headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json","apikey":process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY},...(name==="leadfactory-klaviyo-import"?{body:JSON.stringify({commit:false})}:{})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||data.message||"Erreur "+response.status);
   setResult(data);
  }catch(e){setError(e.message||"Erreur inconnue")}finally{setBusy(false)}
 }
 return <main className="adminpage"><div className="admincard"><p className="eyebrow">TESAMI LEADFACTORY</p><h1>Import Klaviyo</h1><p>Les contacts restent privés dans l'administration. Aucun prospect n'est attribué automatiquement aux consultants.</p><div className="fields"><button disabled={busy} onClick={()=>run("leadfactory-klaviyo-status")}>Tester la connexion Klaviyo</button><button disabled={busy} onClick={()=>run("leadfactory-klaviyo-import")}>Simuler l'import (sans enregistrer)</button></div>{busy&&<p>Vérification en cours…</p>}{error&&<p role="alert" className="notice">{error}</p>}{result&&<div className="pricepreview" aria-live="polite"><strong>Résultat</strong><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(result,null,2)}</pre></div>}<p><small>La simulation vérifie au maximum 20 profils par exécution. Elle ne constitue pas un import complet. Les consentements et droits de partage doivent être contrôlés avant toute distribution.</small></p><p><a href="/admin">Retour à l'administration</a></p></div></main>
}