import {createServerSupabase} from "../../../../lib/supabase/server";
import {requireActiveUser} from "../../../../lib/auth/active-user";
export async function POST(req){
 const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});const user=access.user;
 const {contentId,provider}=await req.json();const {data,error}=await s.from("publish_targets").update({status:"retry",last_error:null,updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("content_id",contentId).eq("provider",provider).in("status",["failed","retry"]).select().maybeSingle();
 if(error)return Response.json({error:error.message},{status:400});if(!data)return Response.json({error:"Cette publication ne peut pas être relancée."},{status:409});return Response.json({ok:true,target:data});
}
