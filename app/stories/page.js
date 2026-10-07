"use client";
import {useEffect,useState} from "react";
import {Sparkles,Plus,Trash2,Library,CalendarClock} from "lucide-react";
function storyPrompt(i,subject=""){const roles=[
"OUVERTURE — crée une accroche visuelle forte qui introduit le sujet et donne envie de voir la suite",
"DÉVELOPPEMENT — montre une idée, un détail, un conseil ou une scène différente qui apporte de la valeur sans répéter la première story",
"CONCLUSION / CTA — termine la séquence avec une scène différente et une invitation claire à réagir, répondre ou passer à l’action"
];const role=roles[i]||`SUITE ${i+1} — fais progresser naturellement l’histoire avec une nouvelle scène, un nouvel angle et sans répéter les cartes précédentes`;return subject?`Story Instagram verticale 9:16. Sujet global : ${subject}. Rôle de cette carte : ${role}. Crée uniquement le visuel de cette carte, cohérent avec la même séquence mais avec une composition et une scène distinctes.`:""}
function newCard(i,subject=""){return {id:Date.now()+i,title:"Story "+(i+1),prompt:storyPrompt(i,subject),job:null,busy:false,msg:"",credits:null}}
export default function Stories(){
 const [cards,setCards]=useState([]),[subject,setSubject]=useState(""),[balance,setBalance]=useState(null);
 useEffect(()=>{const q=new URLSearchParams(location.search),s=q.get("subject")||q.get("goal")||"";setSubject(s);setCards([newCard(0,s),newCard(1,s),newCard(2,s)]);fetch("/api/credits").then(r=>r.json()).then(j=>setBalance(j.balance??j.credits??null)).catch(()=>{})},[]);
 const patch=(id,v)=>setCards(x=>x.map(c=>c.id===id?{...c,...v}:c));
 const add=()=>setCards(x=>[...x,newCard(x.length,subject)]);
 const remove=id=>setCards(x=>x.filter(c=>c.id!==id));
 async function generate(card){
  patch(card.id,{busy:true,msg:"Génération..."});
  const r=await fetch("/api/alexya/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"image",prompt:card.prompt,aspectRatio:"9:16"})});const j=await r.json();
  if(!r.ok){patch(card.id,{busy:false,msg:j.error||"Erreur"});return}
  const cost=j.job?.credits_charged??null;patch(card.id,{job:j.job,credits:cost,msg:"Création en cours..."});
  if(cost!=null)setBalance(v=>v==null?v:Math.max(0,v-cost));
  let tries=0;const timer=setInterval(async()=>{tries++;const sr=await fetch("/api/alexya/status?id="+encodeURIComponent(j.job.id),{cache:"no-store"});const sj=await sr.json();if(sr.ok&&sj.job){patch(card.id,{job:sj.job});if(["completed","failed"].includes(sj.job.status)){clearInterval(timer);patch(card.id,{job:sj.job,busy:false,msg:sj.job.status==="completed"?"Story prête ✓":"Échec de la génération"})}}if(tries>90){clearInterval(timer);patch(card.id,{busy:false,msg:"La génération prend plus de temps que prévu."})}},4000);
 }
 async function save(card,go=false){if(!card.job?.id)return;patch(card.id,{msg:"Enregistrement..."});const r=await fetch("/api/alexya/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jobId:card.job.id})});const j=await r.json();if(!r.ok){patch(card.id,{msg:j.error||"Enregistrement impossible"});return}patch(card.id,{msg:"Ajoutée à la bibliothèque ✓"});if(go)location.href="/schedule?media="+encodeURIComponent(j.item.id)}
 return <div className="calendarpage"><header><div><p className="eyebrow">STORIES</p><h1>Crée ta séquence</h1><p>Chaque carte possède son propre générateur. Modifie, génère et enregistre chaque story indépendamment.</p></div><div style={{display:"flex",gap:10,alignItems:"center"}}><span className="linkbtn">Crédits : <b>{balance??"—"}</b></span><a href="/" className="linkbtn">Retour</a></div></header>
 <div className="admincard"><label>Sujet de la séquence<textarea value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Ex : présenter une nouveauté en 3 stories"/></label></div>
 <div className="mediagrid">{cards.map((c,i)=><article className="mediacard" key={c.id}><div className="mediapreview" style={{aspectRatio:"9/16"}}>{c.job?.output_url?<img src={c.job.output_url} alt={c.title}/>:<div className="empty">Story {i+1}<br/>9:16</div>}</div><div className="mediainfo"><div style={{display:"flex",justifyContent:"space-between",gap:8}}><strong>Story {i+1}</strong>{cards.length>1&&<button className="iconbtn" onClick={()=>remove(c.id)}><Trash2 size={16}/></button>}</div><textarea value={c.prompt} onChange={e=>patch(c.id,{prompt:e.target.value})} placeholder="Décris uniquement cette story..."/><button className="generate" disabled={c.busy||c.prompt.trim().length<3} onClick={()=>generate(c)}><Sparkles size={16}/>{c.busy?" Génération...":" Générer cette story"}</button>{c.credits!=null&&<small>Coût : {c.credits} crédits</small>}{c.msg&&<p className="notice">{c.msg}</p>}{c.job?.status==="completed"&&<div className="mediaactions"><button className="linkbtn" onClick={()=>save(c)}><Library size={15}/> Bibliothèque</button><button className="linkbtn" onClick={()=>save(c,true)}><CalendarClock size={15}/> Programmer</button></div>}</div></article>)}</div>
 <button className="generate" type="button" onClick={add}><Plus size={17}/> Ajouter une story</button>
 </div>
}