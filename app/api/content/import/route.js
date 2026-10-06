import {createServerSupabase} from "../../../../lib/supabase/server";
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const form=await req.formData();const file=form.get("file");if(!file||typeof file==="string")return Response.json({error:"Fichier requis"},{status:400});
  const allowed=["image/jpeg","image/png","image/webp","video/mp4","video/quicktime","video/webm"];if(!allowed.includes(file.type))return Response.json({error:"Format non accepté"},{status:415});
  const max=file.type.startsWith("video/")?1024*1024*1024:25*1024*1024;if(file.size>max)return Response.json({error:file.type.startsWith("video/")?"Vidéo limitée à 1 Go":"Image limitée à 25 Mo"},{status:413});
  const ext=(file.name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"");const path=`${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const {error:up}=await s.storage.from("content-media").upload(path,file,{contentType:file.type,upsert:false});if(up)throw up;
  const networks=String(form.get("networks")||"").split(",").filter(Boolean);
  const {data,error}=await s.from("content_items").insert({user_id:user.id,scheduled_date:form.get("date"),scheduled_time:form.get("time")||null,content_type:file.type.startsWith("video/")?"Vidéo":"Publication",platform:networks.join(", "),target_networks:networks,objective:"Contenu personnel",title:file.name,body:String(form.get("caption")||""),status:"planned",publish_mode:"automatic",media_path:path,media_type:file.type,is_ai_generated:false,subtitles_enabled:form.get("subtitles")==="true",subtitle_style:String(form.get("subtitleStyle")||"dynamic")}).select().single();
  if(error){await s.storage.from("content-media").remove([path]);throw error}
  await s.from("publish_targets").insert(networks.map(provider=>({user_id:user.id,content_id:data.id,provider})));
  return Response.json({item:data});
 }catch{return Response.json({error:"Impossible d’enregistrer la publication."},{status:500})}
}