import {createServerSupabase} from "../../../../lib/supabase/server";
export async function GET(req){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const id=new URL(req.url).searchParams.get("id");if(!id)return Response.json({error:"ID requis"},{status:400});
 const {data,error}=await s.from("publish_targets").select("provider,status,attempts,last_error,published_at,provider_post_id").eq("content_id",id).eq("user_id",user.id);
 if(error)return Response.json({error:error.message},{status:500});return Response.json({targets:data||[]});
}