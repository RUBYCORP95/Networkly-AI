"use client";
import {useEffect,useState} from "react";

export default function Success(){
 const [state,setState]=useState("checking");
 const [billing,setBilling]=useState(null);
 useEffect(()=>{
  let stopped=false,tries=0,timer;
  async function check(){
   tries++;
   try{
    const r=await fetch("/api/billing/status",{cache:"no-store"});
    const j=await r.json();
    if(stopped)return;
    const b=j.billing||null;setBilling(b);
    if(b?.plan==="pro"&&b?.subscription_status==="active"){setState("active");return}
    if(["failed","cancelled","canceled","expired"].includes(b?.subscription_status)){setState("problem");return}
   }catch{}
   if(tries>=20){setState("pending");return}
   timer=setTimeout(check,1500);
  }
  check();
  return()=>{stopped=true;clearTimeout(timer)};
 },[]);
 return <div className="authwrap"><div className="authbox"><p className="eyebrow">PAIEMENT</p>
  {state==="active"?<><h1>Networkly Pro est activé 🎉</h1><p>Ton paiement est confirmé et toutes les fonctions Pro sont maintenant disponibles.</p><a href="/" className="generate">Commencer avec Networkly Pro</a></>:
   state==="problem"?<><h1>Le paiement n’est pas activé</h1><p>Le prestataire indique un statut {billing?.subscription_status||"non confirmé"}. Tu peux réessayer depuis ton abonnement.</p><a href="/billing" className="generate">Voir mon abonnement</a></>:
   state==="pending"?<><h1>Paiement en cours de confirmation</h1><p>Le paiement a été envoyé, mais sa confirmation prend plus de temps que prévu. Tu peux continuer à utiliser Networkly : l’activation Pro se fera automatiquement dès réception du webhook.</p><a href="/billing" className="generate">Voir mon abonnement</a></>:
   <><h1>Confirmation du paiement…</h1><p>Networkly vérifie automatiquement ton paiement auprès du prestataire. Cette page se met à jour toute seule.</p><div className="pricepreview"><span>Statut</span><strong>Vérification en cours</strong></div></>}
 </div></div>
}