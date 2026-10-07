import {createServerSupabase} from "../../../../lib/supabase/server";
import {requireActiveUser} from "../../../../lib/auth/active-user";
export async function POST(req){
 const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});const user=access.user;
 const b=await req.json();if(!b.id||!Array.isArray(b.networks)||!b.networks.length)return Response.json({error:"Choisis au moins un réseau."},{status:400});
 const {data:item}=await s.from("content_items").select("*").eq("id",b.id).eq("user_id",user.id).single();if(!item||item.status!=="draft")return Response.json({error:"Ce contenu n’est pas un brouillon."},{status:409});
 const {data:settings}=await s.from("user_publish_settings").select("publish_mode").eq("user_id",user.id).maybeSingle();const mode=b.publishMode||settings?.publish_mode||"approval";
 const patch={status:"planned",platform:b.networks.join(", "),target_networks:b.networks,publish_mode:mode,updated_at:new Date().toISOString()};if(b.date)patch.scheduled_date=b.date;if(b.time)patch.scheduled_time=b.time;
 const {error}=await s.from("content_items").update(patch).eq("id",b.id).eq("user_id",user.id);if(error)return Response.json({error:error.message},{status:400});
 if(mode!=="draft"){const {error:te}=await s.from("publish_targets").insert(b.networks.map(provider=>({user_id:user.id,content_id:b.id,provider,status:mode==="automatic"?"pending":"pending_approval"})));if(te)return Response.json({error:te.message},{status:400})}
 return Response.json({ok:true});
}