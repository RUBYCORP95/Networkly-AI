"use client";
import {useMemo,useState} from "react";
import {replays} from "../../lib/formations/replays";
import "./formations.css";
const categories=["Toutes les vidéos","Réseaux sociaux","Vente & prospection","Mindset & leadership","Produits & beauté","Business & stratégie"];
const dates=x=>{const m=(x.date||"").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?Number(m[3]+m[2]+m[1]):0};
export default function Formations(){
 const [query,setQuery]=useState(""),[category,setCategory]=useState("Toutes les vidéos"),[sort,setSort]=useState("recent");
 const counts=useMemo(()=>Object.fromEntries(categories.map(c=>[c,c==="Toutes les vidéos"?replays.length:replays.filter(x=>x.category===c).length])),[]);
 const filtered=useMemo(()=>replays.filter(x=>(category==="Toutes les vidéos"||x.category===category)&&((x.title+" "+x.original+" "+x.category).toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")))).sort((a,b)=>sort==="az"?a.title.localeCompare(b.title,"fr"):sort==="old"?dates(a)-dates(b):dates(b)-dates(a)),[query,category,sort]);
 return <main className="formations-page"><div className="formations-shell">
 <a className="formations-back" href="/consultant">← Espace Consultant</a>
 <div className="formations-heading"><div><p className="formations-eyebrow">ACADÉMIE TESAMI</p><h1>Replays de formations</h1><p>Retrouve rapidement une formation par thème, date ou mot-clé.</p></div><div className="formations-total"><strong>{replays.length}</strong><span>formations disponibles</span></div></div>
 <div className="formations-layout"><aside className="formations-sidebar"><h2>Thématiques</h2><div className="formations-categories">{categories.map(c=><button type="button" key={c} className={category===c?"selected":""} onClick={()=>setCategory(c)}><span>{c}</span><small>{counts[c]}</small></button>)}</div></aside>
 <section className="formations-content"><div className="formations-toolbar"><label className="formations-search"><span>Rechercher</span><input type="search" placeholder="Titre, intervenant, sujet…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="formations-sort"><span>Trier par</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="recent">Plus récentes</option><option value="old">Plus anciennes</option><option value="az">Titre A → Z</option></select></label></div>
 <div className="formations-results"><div><strong>{category}</strong><span> · {filtered.length} replay{filtered.length!==1?"s":""}</span></div>{(query||category!=="Toutes les vidéos")&&<button type="button" onClick={()=>{setQuery("");setCategory("Toutes les vidéos")}}>Effacer les filtres</button>}</div>
 <div className="formations-grid">{filtered.map(x=><article className="formations-card" key={x.id}><a className="formations-thumbnail" href={"https://www.youtube.com/watch?v="+x.id} target="_blank" rel="noopener noreferrer" aria-label={"Voir "+x.title}><img src={"https://img.youtube.com/vi/"+x.id+"/hqdefault.jpg"} alt="" loading="lazy"/><span className="formations-play">▶</span></a><div className="formations-cardbody"><span className="formations-tag">{x.category}</span><h2>{x.title}</h2><div className="formations-cardbottom"><time>{x.date||"Replay vidéo"}</time><a href={"https://www.youtube.com/watch?v="+x.id} target="_blank" rel="noopener noreferrer">Voir le replay ↗</a></div></div></article>)}</div>
 {filtered.length===0&&<div className="formations-empty">Aucune formation trouvée. Essaie un autre mot-clé ou une autre catégorie.</div>}
 </section></div></div></main>;
}