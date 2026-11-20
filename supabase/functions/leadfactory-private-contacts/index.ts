import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const allowed=new Set(["https://app.tesami.fr","https://networkly-sage.vercel.app","https://networkly-ai.vercel.app"]);
const PAGE_SIZE=100;
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin")||"";
 const headers={"Access-Control-Allow-Origin":allowed.has(origin)?origin:"https://networkly-sage.vercel.app","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"GET,PATCH,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(!["GET","PATCH"].includes(req.method))return reply({error:"Method not allowed"},405);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!token||!url||!anon||!service)return reply({error:"Authentication required"},401);
 const authClient=createClient(url,anon);
 const {data:{user},error}=await authClient.auth.getUser(token);
 if(error||!user)return reply({error:"Unauthorized"},401);
 const db=createClient(url,service);
 const {data:profile,error:profileError}=await db.from("profiles").select("is_admin").eq("id",user.id).single();
 if(profileError||profile?.is_admin!==true)return reply({error:"Admin access required"},403);
 const table="lead_private_klaviyo_contacts";
 if(req.method==="PATCH"){
  const body=await req.json().catch(()=>null);
  if(body?.action==="bulk_approve"){
   const ids=body.ids;
   const note=typeof body.note==="string"?body.note.trim():"";
   if(!Array.isArray(ids)||ids.length<1||ids.length>PAGE_SIZE||new Set(ids).size!==ids.length||
      ids.some(id=>typeof id!=="string"||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))||
      !note||note.length>2000||body.confirmed!==true){
    return reply({error:"Sélection ou référence d’accord invalide."},400);
   }
   const {data,error}=await db.from(table).update({
    manual_review_status:"approved", manual_review_note:note,
    manual_review_at:new Date().toISOString(), manual_review_by:user.id,
   }).in("id",ids).eq("manual_review_status","pending")
    .in("consent_status",["unknown","subscribed"])
    .or("qualification_status.is.null,qualification_status.eq.interested").select("id");
   if(error)return reply({error:"Impossible d’enregistrer la validation groupée."},500);
   return reply({approved:data.length,skipped:ids.length-data.length});
  }
  if(typeof body?.id!=="string"||!/^[a-f0-9-]{36}$/i.test(body.id)||
     !(body.action==="manual_review"||[null,"interested","not_interested","consultant"].includes(body.status))){
   return reply({error:"Statut ou contact invalide"},400);
  }
  const isReview=body.action==="manual_review";
  if(isReview&&(!["pending","approved","rejected"].includes(body.review_status)||typeof body.note!=="string"||body.note.length>2000||(body.review_status==="approved"&&!body.note.trim())))return reply({error:"Indiquez le résultat et la preuve ou justification de la validation."},400);
  const update=isReview?{manual_review_status:body.review_status,manual_review_note:body.note.trim(),manual_review_at:new Date().toISOString(),manual_review_by:user.id}:{qualification_status:body.status};
  const {data,error}=await db.from(table).update(update)
    .eq("id",body.id).select("id").maybeSingle();
  if(error)return reply({error:"Impossible d’enregistrer le statut"},500);
  return data?reply({saved:true}):reply({error:"Contact introuvable"},404);
 }
 const params=new URL(req.url).searchParams;
 if(params.get("export")==="consultants"){
  const emails=new Set<string>();
  let after="";
  while(true){
   let query=db.from(table).select("id,email").eq("qualification_status","consultant").order("id").limit(500);
   if(after)query=query.gt("id",after);
   const {data,error}=await query;
   if(error)return reply({error:"Impossible de préparer l’export"},500);
   for(const row of data){
    const email=String(row.email||"").trim();
    if(email&&!/^[=+@-]/.test(email))emails.add(email);
   }
   if(data.length<500)break;
   after=data[data.length-1].id;
  }
  const csv=["Email",...[...emails].sort().map(email=>'"'+email.replaceAll('"','""')+'"')].join("\r\n");
  return new Response(csv,{headers:{...headers,"Content-Type":"text/csv; charset=utf-8"}});
 }
 const page=Math.min(1000,Math.max(0,Number(params.get("page"))||0));
 const search=(params.get("search")||"").trim().slice(0,80);
 let query=db.from("lead_private_klaviyo_contacts").select("id,first_name,last_name,email,phone,city,department,last_abandoned_at,consent_status,qualification_status,manual_review_status,manual_review_note,manual_review_at,imported_at",{count:"exact"}).order("imported_at",{ascending:false}).order("id").range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
 if(params.get("status")==="consultant")query=query.eq("qualification_status","consultant");
 if(search){const escaped=search.replace(/[%_,()]/g,"");query=query.or("email.ilike.%"+escaped+"%,first_name.ilike.%"+escaped+"%,last_name.ilike.%"+escaped+"%,city.ilike.%"+escaped+"%,department.ilike.%"+escaped+"%");}
 const {data,error:dbError,count}=await query;
 if(dbError)return reply({error:"Unable to list contacts"},500);
 return reply({contacts:data||[],total:count||0,page,page_size:PAGE_SIZE,admin_only:true});
});