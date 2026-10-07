"use client";
import {useEffect,useState} from "react";
export default function Suspended(){
 const [email,setEmail]=useState("");
 useEffect(()=>{fetch("/api/account-status").then(r=>r.json()).then(j=>{if(j.status==="active"){location.href="/";return}setEmail(j.email||"")})},[]);
 return <div className="authwrap"><div className="authbox"><div className="brand dark"><span>N</span> Networkly AI</div><p className="eyebrow">ACCÈS AU COMPTE</p><h1>Compte suspendu</h1><p>L’accès à Networkly est temporairement suspendu. Tes contenus ne sont pas supprimés.</p>{email&&<p className="notice">Compte : {email}</p>}<a className="generate" href="/billing">Consulter mon abonnement</a><button className="linkbtn" onClick={async()=>{const {createClient}=await import("../../lib/supabase/client");const s=createClient();await s.auth.signOut();location.href="/login"}}>Se déconnecter</button></div></div>
}