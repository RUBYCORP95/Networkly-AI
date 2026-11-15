import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {runDailyLeads} from "../../../../lib/leads/daily";
export async function GET(req){
 if(!process.env.CRON_SECRET||req.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET)return Response.json({error:"Non autorisé"},{status:401});
 try{const result=await runDailyLeads(createAdminSupabase());return Response.json({ok:result.errors.length===0,...result},{status:result.errors.length?207:200})}
 catch(e){return Response.json({error:"Collecte impossible",detail:e.message},{status:500})}
}
export const POST=GET;
