import {createServerSupabase} from "../../../../lib/supabase/server";
import {requireActiveUser} from "../../../../lib/auth/active-user";
export async function POST(req){
 const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});const user=access.user;
 const {contentId}=await req.json();const {data,error}=await s.from("publish_targets").update({status:"pending",last_error:null,updated_at:new Date().toISOString()}).eq("user_id",user.id).eq("content_id",contentId).eq("status","pending_approval").select();
 if(error)return Response.json({error:error.message},{status:400});return Response.json({ok:true,targets:data||[]});
}