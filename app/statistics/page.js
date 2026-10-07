"use client";
import {useState} from "react";
import {BarChart3,Instagram,Music2,Facebook,Youtube,Users,Eye,Heart,TrendingUp} from "lucide-react";
const networks=[
 {id:"all",label:"Vue d’ensemble",Icon:BarChart3},
 {id:"instagram",label:"Instagram",Icon:Instagram},
 {id:"tiktok",label:"TikTok",Icon:Music2},
 {id:"facebook",label:"Facebook",Icon:Facebook},
 {id:"youtube",label:"YouTube",Icon:Youtube}
];
const periods=["1 jour","7 jours","30 jours","3 mois","1 an"];
export default function Statistics(){
 const [network,setNetwork]=useState("all"),[period,setPeriod]=useState("30 jours");
 const current=networks.find(n=>n.id===network);
 return <main className="appframe"><aside><div className="brand"><span>T</span> TESAMI</div><nav><b>Analyser</b><a href="/"><BarChart3 size={17}/> Tableau de bord</a><a className="active"><TrendingUp size={17}/> Statistiques</a><b>Réseaux</b>{networks.slice(1).map(({id,label,Icon})=><a key={id} onClick={()=>setNetwork(id)}><Icon size={17}/>{label}</a>)}</nav></aside>
 <section className="dashboardcontent"><header className="dashboardheader"><div><p className="eyebrow">PERFORMANCES</p><h1>Statistiques</h1><p>Suis l’évolution de ton audience et de tes contenus sur tous tes réseaux.</p></div></header>
 <div className="composer"><div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{networks.map(({id,label,Icon})=><button key={id} className={network===id?"generate":"linkbtn"} onClick={()=>setNetwork(id)}><Icon size={17}/>{label}</button>)}</div><select value={period} onChange={e=>setPeriod(e.target.value)} style={{maxWidth:160}}>{periods.map(p=><option key={p}>{p}</option>)}</select></div></div>
 <div className="quickactions"><div className="card"><Users/><h3>Abonnés</h3><strong>—</strong><p>Pas encore de données</p></div><div className="card"><TrendingUp/><h3>Nouveaux abonnés</h3><strong>—</strong><p>Sur {period.toLowerCase()}</p></div><div className="card"><Eye/><h3>Vues / portée</h3><strong>—</strong><p>Pas encore de données</p></div><div className="card"><Heart/><h3>Engagement</h3><strong>—</strong><p>Pas encore de données</p></div></div>
 <div className="composer"><div className="sectiontitle"><div><p className="eyebrow">{current?.label?.toUpperCase()}</p><h2>Évolution des abonnés</h2></div><TrendingUp size={20}/></div><div style={{minHeight:280,display:"grid",placeItems:"center",border:"1px dashed #cbd5cf",borderRadius:16,textAlign:"center",padding:30}}><div><BarChart3 size={34}/><h3>Pas encore assez de données</h3><p>TESAMI affichera ici la courbe d’évolution dès que les statistiques du réseau seront disponibles.</p></div></div></div>
 <div className="composer"><p className="eyebrow">CONTENU</p><h2>Publications les plus performantes</h2><p>Les contenus qui génèrent le plus de vues, d’engagement et de nouveaux abonnés apparaîtront ici.</p></div>
 </section></main>
}