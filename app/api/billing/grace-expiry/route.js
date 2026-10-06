import {createAdminSupabase} from "../../../../lib/supabase/admin";
export async function POST(req){
 const auth=req.headers.get("authorization");if(!process.env.CRON_SECRET||auth!=="Bearer "+process.env.CRON_SECRET)return Response.json({error:"Non autorisé"},{status:401});
 const admin=createAdminSupabase();const now=new Date().toISOString();const {data,error}=await admin.from("profiles").select("id").eq("plan","pro").eq("subscription_status","past_due").lte("grace_period_ends_at",now);if(error)return Response.json({error:error.message},{status:500});
 const ids=(data||[]).map(x=>x.id);if(ids.length)await admin.from("profiles").update({plan:"free",subscription_status:"grace_expired",updated_at:now}).in("id",ids);
 return Response.json({ok:true,downgraded:ids.length});
}