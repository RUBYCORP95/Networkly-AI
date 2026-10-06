import {createServerSupabase} from "../../../../lib/supabase/server";
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const b=await req.json();if(!b.mediaId||!b.date||!b.time||!Array.isArray(b.networks)||!b.networks.length)return Response.json({error:"Informations incomplètes"},{status:400});
  const {data:m,error:me}=await s.from("media_library").select("*").eq("id",b.mediaId).eq("user_id",user.id).single();if(me||!m)return Response.json({error:"Média introuvable"},{status:404});
  const {data,error}=await s.from("content_items").insert({user_id:user.id,scheduled_date:b.date,scheduled_time:b.time,content_type:m.media_type.startsWith("video/")?"Vidéo":"Publication",platform:b.networks.join(", "),target_networks:b.networks,objective:"Contenu personnel",title:m.title||m.original_name,body:b.caption||"",status:"planned",publish_mode:"automatic",media_path:m.media_path,media_type:m.media_type,is_ai_generated:m.source==="ai",subtitles_enabled:!!b.subtitles,subtitle_style:b.subtitleStyle||"dynamic"}).select().single();
  if(error)throw error;return Response.json({item:data});
 }catch{return Response.json({error:"Impossible de programmer ce média."},{status:500})}
}