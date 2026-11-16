import {requireLeadAccess} from "../../../../lib/leads/access";
import {requireActiveUser} from "../../../../lib/auth/active-user";
import {createServerSupabase} from "../../../../lib/supabase/server";
const allowed=new Set(["coiffure","beaute","barbier","spa","cadeaux","hotel"]);
async function context(){const db=await createServerSupabase();const access=await requireActiveUser(db);return {db,user:access.user,access};}
export async function GET(){const {db,user,access}=await context();if(!access.ok)return Response.json({error:access.error},{status:access.status});const entitlement=await requireLeadAccess(access);if(!entitlement.ok)return Response.json({error:entitlement.error},{status:entitlement.status});
 const {data,error}=await db.from("lead_preferences").select("city,radius_km,sectors,daily_quota").eq("user_id",user.id).maybeSingle();
 if(error)return Response.json({error:"Migration Supabase requise"},{status:503});return Response.json({preferences:data});}
export async function POST(req){const {db,user,access}=await context();if(!access.ok)return Response.json({error:access.error},{status:access.status});const entitlement=await requireLeadAccess(access);if(!entitlement.ok)return Response.json({error:entitlement.error},{status:entitlement.status});
 let body;try{body=await req.json()}catch{return Response.json({error:"JSON invalide"},{status:400})}
 const city=String(body.city||"").trim().slice(0,120),radius=Number(body.radius_km),quota=Number(body.daily_quota),sectors=body.sectors;
 if(!city||!Number.isInteger(radius)||radius<1||radius>100||!Number.isInteger(quota)||quota<1||quota>20||!Array.isArray(sectors)||sectors.length===0||sectors.length>6||!sectors.every(s=>allowed.has(s)))return Response.json({error:"Paramètres invalides"},{status:400});
 const {error}=await db.from("lead_preferences").upsert({user_id:user.id,city,radius_km:radius,daily_quota:quota,sectors:[...new Set(sectors)],updated_at:new Date().toISOString()},{onConflict:"user_id"});
 if(error)return Response.json({error:"Enregistrement impossible"},{status:500});return Response.json({ok:true});}
