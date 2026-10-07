import {createServerSupabase} from "../../../../lib/supabase/server";
export async function POST(req){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const b=await req.json();const ids=Array.isArray(b.ids)?b.ids.slice(0,31):[];const networks=Array.isArray(b.networks)?b.networks.filter(x=>["instagram","facebook","tiktok"].includes(x)):[];
 if(!ids.length||!networks.length)return Response.json({error:"Brouillons ou réseaux manquants."},{status:400});
 const mode=["approval","automatic"].includes(b.publishMode)?b.publishMode:"approval";
 const {data:items,error}=await s.from("content_items").select("id,status").eq("user_id",user.id).in("id",ids);if(error)return Response.json({error:error.message},{status:400});
 const drafts=(items||[]).filter(x=>x.status==="draft");if(!drafts.length)return Response.json({error:"Aucun brouillon à programmer."},{status:409});
 const draftIds=drafts.map(x=>x.id);const {error:up}=await s.from("content_items").update({status:"planned",platform:networks.join(", "),target_networks:networks,publish_mode:mode,updated_at:new Date().toISOString()}).eq("user_id",user.id).in("id",draftIds);if(up)return Response.json({error:up.message},{status:400});
 const rows=draftIds.flatMap(id=>networks.map(provider=>({user_id:user.id,content_id:id,provider,status:mode==="automatic"?"pending":"pending_approval"})));const {error:te}=await s.from("publish_targets").insert(rows);if(te)return Response.json({error:te.message},{status:400});
 return Response.json({ok:true,scheduled:draftIds.length,targets:rows.length});
}