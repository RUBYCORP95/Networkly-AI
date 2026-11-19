const allowedOrigins=new Set(["https://app.tesami.fr","https://networkly-sage.vercel.app","https://networkly-ai.vercel.app"]);
const cors=(req:Request)=>{const origin=req.headers.get("origin")||"";return {"Access-Control-Allow-Origin":allowedOrigins.has(origin)?origin:"https://networkly-sage.vercel.app","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin"};};
import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const json=(body:unknown,status=200,req?:Request)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store",...(req?cors(req):{})}});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
 const reply=(body:unknown,status=200)=>json(body,status,req);
 if(req.method!=="GET")return reply({error:"Method not allowed"},405,req);
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return reply({error:"Authentication required"},401,req);
 const url=Deno.env.get("SUPABASE_URL");
 const anon=Deno.env.get("SUPABASE_ANON_KEY");
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return reply({error:"Supabase server configuration incomplete"},503,req);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:bearer}}});
 const {data:auth,error:authError}=await userClient.auth.getUser(bearer.slice(7));
 if(authError||!auth.user)return reply({error:"Unauthorized"},401,req);
 const admin=createClient(url,service);
 const {data:profile,error:profileError}=await admin.from("profiles").select("is_admin").eq("id",auth.user.id).single();
 if(profileError||profile?.is_admin!==true)return reply({error:"Admin access required"},403,req);
 const key=Deno.env.get("KLAVIYO_API_KEY");
 if(!key)return reply({configured:false,klaviyo_reachable:false,message:"KLAVIYO_API_KEY missing"});
 try{
  const response=await fetch("https://a.klaviyo.com/api/metrics/",{headers:{Authorization:"Klaviyo-API-Key "+key,accept:"application/json",revision:"2025-01-15"},signal:AbortSignal.timeout(12000)});
  const detail=!response.ok?await response.json().catch(()=>null):null;
  return reply({configured:true,klaviyo_reachable:response.ok,klaviyo_status:response.status,klaviyo_error:detail?.errors?.map((e:any)=>({code:e.code,title:e.title,detail:e.detail})).slice(0,3)||null,import_started:false,contacts_shared:false});
 }catch{return reply({configured:true,klaviyo_reachable:false,import_started:false,contacts_shared:false,message:"Klaviyo connection check failed"});}
});