import {createServerSupabase} from "../../../lib/supabase/server";
export async function GET(){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data,error}=await s.from("content_items").select("*,publish_targets(provider,status,attempts,last_error,published_at)").order("scheduled_date").order("scheduled_time");
 if(error)return Response.json({error:"Erreur calendrier"},{status:500});
 const items=await Promise.all((data||[]).map(async x=>{let media_url=null;if(x.media_path){const {data:u}=await s.storage.from("content-media").createSignedUrl(x.media_path,3600);media_url=u?.signedUrl||null}return {...x,media_url}}));
 return Response.json({items});
}