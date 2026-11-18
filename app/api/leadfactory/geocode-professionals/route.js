import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const respond = (body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,role=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!role)return respond({error:"Configuration serveur incomplète"},503);
 const token=request.headers.get("authorization")?.replace(/^Bearer /i,"");
 if(!token)return respond({error:"Connexion requise"},401);
 const authClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await authClient.auth.getUser(token);
 if(authError||!user)return respond({error:"Session invalide"},401);
 const db=createClient(url,role,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileError}=await db.from("profiles").select("is_admin").eq("id",user.id).maybeSingle();
 if(profileError||!profile?.is_admin)return respond({error:"Accès administrateur requis"},403);
 const input=await request.json().catch(()=>({}));
 const offset=Number(input.offset||0);
 if(!Number.isInteger(offset)||offset<0||offset>20000)return respond({error:"Pagination invalide"},422);
 const {data:records,error}=await db.from("lead_private_professional_imports").select("id,address,postal_code,city").not("city","is",null).order("id",{ascending:true}).range(offset,offset+19);
 if(error)return respond({error:"Lecture des prospects impossible"},500);
 let geocoded=0,unresolved=0;
 for(const record of records||[]){
  const {data:current}=await db.from("lead_private_professional_imports").select("latitude,longitude").eq("id",record.id).maybeSingle();
  if(current?.latitude!=null&&current?.longitude!=null)continue;
  const q=[record.address,record.postal_code,record.city].filter(Boolean).join(" ");
  try{
   const r=await fetch("https://data.geopf.fr/geocodage/search/?"+new URLSearchParams({q,limit:"1"}),{signal:AbortSignal.timeout(5000),cache:"no-store"});
   if(!r.ok){unresolved++;continue;}
   const data=await r.json(),f=data.features?.[0],c=f?.geometry?.coordinates;
   if(!Array.isArray(c)||c.length!==2||!c.every(Number.isFinite)||(f.properties?.score??0)<0.65){unresolved++;continue;}
   const cp=String(f.properties?.postcode||"");
   if(record.postal_code&&cp&&cp!==record.postal_code){unresolved++;continue;}
   const {error:writeError}=await db.from("lead_private_professional_imports").update({longitude:c[0],latitude:c[1]}).eq("id",record.id);
   if(writeError)throw writeError;
   geocoded++;
  }catch{unresolved++;}
 }
 const {count}=await db.from("lead_private_professional_imports").select("id",{count:"exact",head:true}).is("latitude",null);
 return respond({ok:true,processed:records?.length||0,geocoded,unresolved,remaining:count,nextOffset:(records?.length||0)===20?offset+20:null,eligibleAutomatically:0});
}
