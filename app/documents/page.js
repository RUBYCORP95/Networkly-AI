import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "../../lib/supabase/server";

export const metadata = { title: "Documents & Formations · TESAMI" };
const documents = [
  { title: "Notes Olfactives — mise à jour du 17/11/2026", type: "PDF", category: "Parfums", description: "Liste des références et notes olfactives des parfums.", url: "https://drive.google.com/file/d/14hMWL2lgi0cc3nuWenjvcc7FtS8HwhlE/view?usp=drivesdk" }
];
export default async function DocumentsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/documents");
  return <main style={{minHeight:"100vh",background:"#f7f8fc",padding:"clamp(20px,5vw,56px)",color:"#172033",fontFamily:"inherit"}}>
    <div style={{maxWidth:1040,margin:"0 auto"}}>
      <Link href="/" style={{color:"#6554bd",textDecoration:"none",fontWeight:600}}>← Tableau de bord</Link>
      <p style={{marginTop:40,fontSize:12,fontWeight:700,letterSpacing:2,color:"#7465a5"}}>RESSOURCES CONSULTANTS</p>
      <h1 style={{fontSize:"clamp(28px,4vw,42px)",margin:"8px 0"}}>Documents & Formations</h1>
      <p style={{color:"#667085",marginBottom:30}}>Retrouve ici les documents partagés par ton équipe, directement depuis TESAMI.</p>
      <div style={{background:"linear-gradient(115deg,#5841ac,#8368d4)",color:"white",borderRadius:18,padding:26,margin:"22px 0 34px"}}><p style={{fontSize:12,letterSpacing:2,fontWeight:700}}>ACADÉMIE TESAMI</p><h2 style={{fontSize:25,margin:"8px 0"}}>Bibliothèque de formations vidéo</h2><p style={{opacity:.9}}>Replays classés par thème, avec recherche et accès direct aux vidéos.</p><Link href="/formations" style={{display:"inline-block",background:"white",color:"#50399e",borderRadius:10,padding:"12px 18px",fontWeight:700,textDecoration:"none",marginTop:12}}>Explorer les formations →</Link></div><h2 style={{fontSize:21,marginBottom:16}}>Parfums</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:18}}>
        {documents.map(doc=><article key={doc.url} style={{background:"white",border:"1px solid #e8e6f0",borderRadius:18,padding:24,boxShadow:"0 4px 20px rgba(20,20,40,.04)"}}>
          <div style={{display:"flex",gap:8,marginBottom:16}}><span style={{background:"#eee9ff",color:"#5a3fb2",borderRadius:20,padding:"5px 11px",fontSize:12,fontWeight:700}}>{doc.category}</span><span style={{background:"#f3f4f6",borderRadius:20,padding:"5px 11px",fontSize:12}}>{doc.type}</span></div>
          <h3 style={{fontSize:19,margin:"0 0 10px"}}>{doc.title}</h3><p style={{color:"#667085",lineHeight:1.5}}>{doc.description}</p>
          <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{display:"inline-block",background:"#5e46b7",color:"white",textDecoration:"none",borderRadius:10,padding:"12px 18px",fontWeight:700,marginTop:12}}>Ouvrir le document ↗</a>
        </article>)}
      </div>
      <p style={{marginTop:24,color:"#667085",fontSize:13}}>Les fichiers restent sur Google Drive. Leur accès dépend des autorisations définies par le propriétaire.</p>
    </div>
  </main>;
}
