const allowedOrigins=new Set(["https://app.tesami.fr","https://networkly-sage.vercel.app","https://networkly-ai.vercel.app"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":allowedOrigins.has(origin)?origin:"https://networkly-sage.vercel.app","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"};};
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const SEGMENT="RbHGeT", CHECKOUT="YhWu4P", ORDER="X8xDaX";
const respond=(v:unknown,status=200,req?:Request)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json","cache-control":"no-store",...(req?cors(req):{})}});
const api=async(path:string,key:string)=>{const r=await fetch("https://a.klaviyo.com/api/"+path,{headers:{Authorization:"Klaviyo-API-Key "+key,accept:"application/json",revision:"2025-01-15"},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error("Klaviyo HTTP "+r.status);return await r.json()};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 const reply=(body:unknown,status=200)=>respond(body,status,req);
 if(req.method!=="POST")return reply({error:"POST required"},405,req);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
 if(!token)return reply({error:"Authentication required"},401,req);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),key=Deno.env.get("KLAVIYO_API_KEY");
 if(!url||!anon||!service||!key)return reply({error:"Missing server configuration or KLAVIYO_API_KEY"},503,req);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}}});
 const {data:auth,error:authError}=await userClient.auth.getUser(token);
 if(authError||!auth.user)return reply({error:"Unauthorized"},401,req);
 const db=createClient(url,service);
 const {data:admin,error:adminError}=await db.from("profiles").select("is_admin").eq("id",auth.user.id).single();
 if(adminError||admin?.is_admin!==true)return reply({error:"Admin only"},403,req);
 const body=await req.json().catch(()=>({}));
 const commit=body?.commit===true;
 const cutoff=Date.now()-60*86400000;
 let checked=0,eligible=0,imported=0,skipped=0,incomplete=0;
 let cursor: string|undefined;
 try{
  // Intentionally process a small bounded batch. A cursor is returned for controlled continuation.
  const segmentUrl="segments/"+SEGMENT+"/profiles/?page[size]=20"+(body?.cursor?"&page[cursor]="+encodeURIComponent(String(body.cursor)):"");
  const page=await api(segmentUrl,key);
  const profiles=Array.isArray(page.data)?page.data:[];
  for(const p of profiles){
   checked++;
   const id=p.id, a=p.attributes||{};
   if(!id||!a.email){skipped++;continue}
   const events=async(metric:string)=>{
    const filter='equals(profile_id,"'+String(id).replace(/[^a-zA-Z0-9_-]/g,"")+'"),equals(metric_id,"'+metric+'")';
    const out=await api("events/?filter="+encodeURIComponent(filter)+"&page[size]=100&sort=-datetime",key);
    // If history is incomplete, fail closed rather than risk including a buyer.
    if(out.links?.next)throw new Error("Event history exceeds page limit for a profile; no import committed");
    return (out.data||[]).map((x:any)=>Date.parse(x.attributes?.datetime)).filter((t:number)=>Number.isFinite(t));
   };
   const carts=await events(CHECKOUT);
   const latest=Math.max(0,...carts);
   if(!latest||latest>cutoff){skipped++;continue}
   const orders=await events(ORDER);
   const lastOrder=Math.max(0,...orders);
   if(lastOrder>latest){skipped++;continue}
   const location=a.location||{};
   const phone=String(a.phone_number||"").trim();
   const city=String(location.city||"").trim();
   const department=String(location.region||"").trim();
   if(phone.replace(/[^0-9]/g,"").length<8||(!city&&!department)){incomplete++;skipped++;continue}
   eligible++;
   if(commit){
    // Keep the record strictly private; no assignment and no consent inference.
    const {error}=await db.from("lead_private_klaviyo_contacts").upsert({
     klaviyo_profile_id:id,email:a.email,first_name:a.first_name||null,last_name:a.last_name||null,
     phone,city:city||null,department:department||null,
     last_abandoned_at:new Date(latest).toISOString(),last_order_at:lastOrder?new Date(lastOrder).toISOString():null,
     orders_checked_at:new Date().toISOString(),consent_status:"unknown",source_segment_id:SEGMENT,updated_at:new Date().toISOString()
    },{onConflict:"klaviyo_profile_id"});
    if(error)throw new Error("Private storage failed: "+error.code);
    imported++;
   }
  }
  // Never return contact details to the caller.
  const next=page.links?.next;
  if(next){const u=new URL(next);cursor=u.searchParams.get("page[cursor]")||undefined}
  return reply({checked,eligible,imported,skipped,incomplete,committed:commit,next_cursor:cursor||null,private_admin_only:true,assigned_to_consultants:0,notice:"Eligibility is not consent for consultant outreach"});
 }catch(e){return reply({error:String(e instanceof Error?e.message:e),checked,imported,incomplete,committed:commit},502,req)}
});