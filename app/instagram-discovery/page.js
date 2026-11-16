"use client";
import {useState} from "react";
import {createClient} from "../../lib/supabase/client";
export default function InstagramDiscovery(){
 const [topic,setTopic]=useState("mode"),[busy,setBusy]=useState(false),[remaining,setRemaining]=useState(null),[error,setError]=useState(""),[suggestion,setSuggestion]=useState(null);
 const topics={mode:["mode","lookdujour","style"],voyage:["voyage","travelphotography","citytrip"],beaute:["beaute","skincare","parfum"],lifestyle:["lifestyle","decoration","bienetre"],fitness:["fitness","sport","motivation"]};
 async function search(){
  setBusy(true);setError("");
  try{
   const s=createClient();const {data:{user}}=await s.auth.getUser();if(!user){location.href="/login";return;}
   const {data,error:e}=await s.rpc("consume_instagram_discovery");if(e)throw new Error(e.message);
   setRemaining(data);
   setSuggestion(topics[topic]||topics.mode);
  }catch(e){setError(e.message||"Recherche impossible");}finally{setBusy(false)}
 }
 return <main style={{maxWidth:850,margin:"35px auto",padding:24,fontFamily:"inherit"}}><p style={{color:"#7147dc",fontWeight:700}}>TESAMI · DÉCOUVERTE INSTAGRAM</p><h1>Instagram Smart Follow</h1><p>Découvre des contenus Instagram correspondant à tes centres d’intérêt. Version initiale : exploration par hashtags, sans analyse automatique des comptes.</p><section style={{background:"white",border:"1px solid #e6def7",padding:24,borderRadius:16,marginTop:24}}><h2>Recherche gratuite</h2><p>5 recherches par jour et par compte, remise à zéro à minuit UTC. Aucun crédit IA consommé.</p><label htmlFor="theme">Thème</label><select id="theme" value={topic} onChange={e=>setTopic(e.target.value)} style={{display:"block",width:"100%",padding:12,margin:"12px 0"}}>{Object.keys(topics).map(x=><option key={x} value={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select><button type="button" onClick={search} disabled={busy} style={{padding:"13px 18px",background:"#7040d7",color:"white",border:0,borderRadius:9,cursor:"pointer"}}>{busy?"Recherche…":"Explorer ce thème"}</button>{remaining!==null&&<p role="status">{remaining} recherche(s) gratuite(s) restante(s) aujourd’hui.</p>}{error&&<p role="alert" style={{color:"#a12239"}}>{error}</p>}{suggestion&&<div style={{marginTop:24}}><h3>Hashtags à explorer</h3><p>Ouvre ces pages Instagram pour découvrir des publications et choisir toi-même les comptes pertinents.</p>{suggestion.map(tag=><p key={tag}><a href={"https://www.instagram.com/explore/tags/"+encodeURIComponent(tag)+"/"} target="_blank" rel="noopener noreferrer">#{tag} · Explorer sur Instagram</a></p>)}</div>}</section><p style={{marginTop:20,color:"#67647c"}}>Les suggestions automatiques de profils à suivre ou à ne plus suivre nécessiteront une intégration Meta supplémentaire et les autorisations correspondantes. Aucun suivi ou désabonnement automatique n’est effectué.</p></main>;
}