import {createServerSupabase} from "../../../../lib/supabase/server";
export async function POST(req){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {contentId,provider}=await req.json();const {data,error}=await s.from("publish_targets").update({status:"retry",last_error:null,updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("content_id",contentId).eq("provider",provider).in("status",["failed","retry"]).select().maybeSingle();
 if(error)return Response.json({error:error.message},{status:400});if(!data)return Response.json({error:"Cette publication ne peut pas être relancée."},{status:409});return Response.json({ok:true,target:data});
}