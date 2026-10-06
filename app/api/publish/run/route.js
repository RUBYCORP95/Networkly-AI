import {createAdminSupabase} from "../../../../lib/supabase/admin";
export async function POST(req){
 const secret=req.headers.get("authorization");if(secret!=="Bearer "+process.env.CRON_SECRET)return Response.json({error:"Non autorisé"},{status:401});
 const db=createAdminSupabase();const now=new Date();const date=now.toISOString().slice(0,10);const time=now.toTimeString().slice(0,8);
 const {data,error}=await db.from("content_items").select("*").eq("status","planned").in("publish_status",["not_published","retry"]).lte("scheduled_date",date).order("scheduled_date").limit(25);
 if(error)return Response.json({error:error.message},{status:500});
 const due=(data||[]).filter(x=>x.scheduled_date<date||!x.scheduled_time||x.scheduled_time<=time);
 return Response.json({due:due.map(x=>({id:x.id,user_id:x.user_id,networks:x.target_networks,media_path:x.media_path}))});
}