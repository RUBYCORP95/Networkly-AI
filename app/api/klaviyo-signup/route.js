import {createServerSupabase} from "../../../lib/supabase/server";
import {upsertKlaviyoCustomer,trackKlaviyoEvent} from "../../../lib/klaviyo";
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user?.email)return Response.json({error:"Connexion requise"},{status:401});
  const {data:p}=await s.from("profiles").select("full_name,company,plan").eq("id",user.id).maybeSingle();const parts=(p?.full_name||"").trim().split(/\s+/);const firstName=parts.shift()||undefined,lastName=parts.join(" ")||undefined;
  await upsertKlaviyoCustomer({email:user.email,firstName,lastName,userId:user.id,properties:{company:p?.company||"",plan:p?.plan||"free",source:"networkly_signup"}});
  let trackCreated=true;try{const body=await req.json();if(body?.trackCreated===false)trackCreated=false}catch{}if(trackCreated)await trackKlaviyoEvent({email:user.email,event:"Networkly Account Created",properties:{plan:p?.plan||"free"}});
  return Response.json({ok:true});
 }catch(e){return Response.json({error:e.message||"Synchronisation Klaviyo impossible"},{status:500})}
}