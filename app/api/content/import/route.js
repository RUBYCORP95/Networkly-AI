import {createServerSupabase} from "../../../../lib/supabase/server";
import {requireActiveUser} from "../../../../lib/auth/active-user";
export async function POST(req){
 try{
  const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});const user=access.user;
  const form=await req.formData();const {data:settings}=await s.from("user_publish_settings").select("*").eq("user_id",user.id).maybeSingle();const publishMode=String(form.get("publishMode")||settings?.publish_mode||"approval");const file=form.get("file");if(!file||typeof file==="string")return Response.json({error:"Fichier requis"},{status:400});
  const allowed=["image/jpeg","image/png","image/webp","video/mp4","video/quicktime","video/webm"];if(!allowed.includes(file.type))return Response.json({error:"Format non accepté"},{status:415});
  const max=file.type.startsWith("video/")?1024*1024*1024:25*1024*1024;if(file.size>max)return Response.json({error:file.type.startsWith("video/")?"Vidéo limitée à 1 Go":"Image limitée à 25 Mo"},{status:413});
  const ext=(file.name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"");const path=`${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const {error:up}=await s.storage.from("content-media").upload(path,file,{contentType:file.type,upsert:false});if(up)throw up;
  const networks=String(form.get("networks")||"").split(",").filter(Boolean);if(!networks.length)return Response.json({error:"Choisis au moins un réseau."},{status:400});const scheduledAt=String(form.get("scheduledAt")||"").trim()||null;const timezone=String(form.get("timezone")||"Europe/Paris");
  const {data,error}=await s.from("content_items").insert({user_id:user.id,scheduled_date:form.get("date"),scheduled_time:form.get("time")||null,scheduled_at:scheduledAt,schedule_timezone:timezone,content_type:file.type.startsWith("video/")?"Vidéo":"Publication",platform:networks.join(", "),target_networks:networks,objective:"Contenu personnel",title:file.name,body:String(form.get("caption")||""),status:"planned",publish_mode:publishMode,media_path:path,media_type:file.type,is_ai_generated:false,subtitles_enabled:form.get("subtitles")==="true",subtitle_style:String(form.get("subtitleStyle")||"dynamic")}).select().single();
  if(error){await s.storage.from("content-media").remove([path]);throw error}
  await s.from("media_library").insert({user_id:user.id,source:"imported",media_path:path,media_type:file.type,original_name:file.name,title:file.name,size_bytes:file.size});
  if(publishMode!=="draft")await s.from("publish_targets").insert(networks.map(provider=>({user_id:user.id,content_id:data.id,provider,status:publishMode==="automatic"?"pending":"pending_approval"})));
  return Response.json({item:data});
 }catch{return Response.json({error:"Impossible d’enregistrer la publication."},{status:500})}
}