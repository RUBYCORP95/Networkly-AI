import {createServerSupabase} from "../../../../lib/supabase/server";
import {requireActiveUser} from "../../../../lib/auth/active-user";
export async function PATCH(req){
 const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});const user=access.user;
 const b=await req.json();const {data:targets}=await s.from("publish_targets").select("status").eq("user_id",user.id).eq("content_id",b.id);if((targets||[]).some(x=>["publishing","published"].includes(x.status)))return Response.json({error:"Une publication en cours ou déjà publiée ne peut plus être modifiée."},{status:409});
 const patch={};if(b.date)patch.scheduled_date=b.date;if(b.time)patch.scheduled_time=b.time;if(typeof b.caption==="string")patch.body=b.caption;
 const {data,error}=await s.from("content_items").update(patch).eq("id",b.id).eq("user_id",user.id).select().single();if(error)return Response.json({error:error.message},{status:400});return Response.json({item:data});
}
export async function POST(req){
 const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});const user=access.user;
 const b=await req.json();if(!b.id)return Response.json({error:"Publication manquante"},{status:400});
 const {data:source,error:readError}=await s.from("content_items").select("*").eq("id",b.id).eq("user_id",user.id).single();if(readError||!source)return Response.json({error:"Publication introuvable"},{status:404});
 const copy={...source};delete copy.id;delete copy.created_at;delete copy.updated_at;copy.user_id=user.id;copy.title=(source.title||"Publication")+" — copie";copy.status="draft";if(b.date)copy.scheduled_date=b.date;if(b.time)copy.scheduled_time=b.time;
 const {data,error}=await s.from("content_items").insert(copy).select().single();if(error)return Response.json({error:error.message},{status:400});return Response.json({item:data});
}
export async function DELETE(req){
 const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});const user=access.user;
 const id=new URL(req.url).searchParams.get("id");const {data:targets}=await s.from("publish_targets").select("status").eq("user_id",user.id).eq("content_id",id);if((targets||[]).some(x=>["publishing","published"].includes(x.status)))return Response.json({error:"Une publication en cours ou publiée ne peut pas être supprimée."},{status:409});
 await s.from("publish_targets").delete().eq("user_id",user.id).eq("content_id",id);const {error}=await s.from("content_items").delete().eq("user_id",user.id).eq("id",id);if(error)return Response.json({error:error.message},{status:400});return Response.json({ok:true});
}