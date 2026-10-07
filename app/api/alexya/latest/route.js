import {createServerSupabase} from "../../../../../lib/supabase/server";
export async function GET(){
 try{
  const s=await createServerSupabase();
  const {data:{user}}=await s.auth.getUser();
  if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const {data,error}=await s.from("ai_media_jobs").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(1);
  if(error)throw error;
  const job=Array.isArray(data)?data[0]:data;
  return Response.json({job:job||null});
 }catch(e){return Response.json({error:e.message||"Récupération impossible"},{status:500})}
}