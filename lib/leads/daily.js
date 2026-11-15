import {fetchLicensedLeads} from "./provider";
export async function runDailyLeads(db){
 const {data:preferences,error}=await db.from("lead_preferences").select("user_id,city,radius_km,sectors,daily_quota").neq("city","").limit(100);
 if(error)throw error;
 let added=0,assigned=0;const errors=[];
 for(const pref of preferences||[]){
  try{
   const {data:profile,error:profileError}=await db.from("profiles").select("account_status").eq("id",pref.user_id).single();
   if(profileError||profile?.account_status==="suspended")continue;
   const {data:existing,error:countError}=await db.from("lead_assignments").select("id").eq("user_id",pref.user_id).gte("assigned_at",new Date().toISOString().slice(0,10)+"T00:00:00Z").limit(pref.daily_quota);
   if(countError)throw countError;
   const remaining=Math.max(0,pref.daily_quota-(existing||[]).length);if(!remaining)continue;
   const result=await fetchLicensedLeads({...pref,limit:remaining*4});
   if(!result.configured)return {configured:false,added,assigned,errors};
   for(const lead of result.businesses){
    const {data:org,error:upsertError}=await db.from("lead_organizations").upsert(lead,{onConflict:"source_url"}).select("id").single();
    if(upsertError)throw upsertError;added++;
    const {data:claimed,error:claimError}=await db.rpc("claim_lead_for_user",{p_organization_id:org.id,p_user_id:pref.user_id,p_daily_quota:pref.daily_quota});
    if(claimError)throw claimError;if(claimed)assigned++;
   }
  }catch(e){errors.push({user_id:pref.user_id,error:e.message})}
 }
 return {configured:true,added,assigned,errors};
}
