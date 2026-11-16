import {createAdminSupabase} from "../../../../../lib/supabase/admin";
export async function GET(req){
 if(!process.env.CRON_SECRET||req.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET)
  return Response.json({error:"Non autorisé"},{status:401});
 const db=createAdminSupabase();
 const {data,error}=await db.rpc("expire_unopened_leads");
 if(error)return Response.json({error:"Expiration impossible"},{status:503});
 return Response.json({ok:true,expired:data},{headers:{"Cache-Control":"no-store"}});
}
