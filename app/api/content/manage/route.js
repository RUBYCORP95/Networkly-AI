import {createServerSupabase} from "../../../../lib/supabase/server";
export async function PATCH(req){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const b=await req.json();const {data:targets}=await s.from("publish_targets").select("status").eq("user_id",user.id).eq("content_id",b.id);if((targets||[]).some(x=>["publishing","published"].includes(x.status)))return Response.json({error:"Une publication en cours ou déjà publiée ne peut plus être modifiée."},{status:409});
 const patch={};if(b.date)patch.scheduled_date=b.date;if(b.time)patch.scheduled_time=b.time;if(typeof b.caption==="string")patch.body=b.caption;
 const {data,error}=await s.from("content_items").update(patch).eq("id",b.id).eq("user_id",user.id).select().single();if(error)return Response.json({error:error.message},{status:400});return Response.json({item:data});
}
export async function DELETE(req){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const id=new URL(req.url).searchParams.get("id");const {data:targets}=await s.from("publish_targets").select("status").eq("user_id",user.id).eq("content_id",id);if((targets||[]).some(x=>["publishing","published"].includes(x.status)))return Response.json({error:"Une publication en cours ou publiée ne peut pas être supprimée."},{status:409});
 await s.from("publish_targets").delete().eq("user_id",user.id).eq("content_id",id);const {error}=await s.from("content_items").delete().eq("user_id",user.id).eq("id",id);if(error)return Response.json({error:error.message},{status:400});return Response.json({ok:true});
}