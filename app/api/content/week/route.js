import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
export async function POST(req){
 try{
  const supabase=await createServerSupabase();const {data:{user}}=await supabase.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const admin=createAdminSupabase();const {data:p}=await admin.from("profiles").select("*").eq("id",user.id).single();
  const key=new Date().toISOString().slice(0,7);const {data:u}=await admin.from("usage_monthly").select("*").eq("user_id",user.id).eq("month_key",key).maybeSingle();
  const limit=p?.plan==="pro"?200:10;if((u?.generations||0)>=limit)return Response.json({error:`Limite mensuelle atteinte (${limit}).`},{status:429});
  const {startDate,time="18:00",network="Instagram",activate=false}=await req.json();const start=startDate?new Date(startDate+"T12:00:00"):new Date();const profile={name:p?.full_name,company:p?.company,activity:p?.activity,audience:p?.audience,tone:p?.tone,shopUrl:p?.shop_url,joinUrl:p?.join_url};
  const prompt=`Tu es Networkly AI. Crée exactement 7 contenus différents pour une semaine de marketing de réseau. Profil: ${JSON.stringify(profile)}. Mélange vente, engagement, conseil, story, reel et recrutement. Aucune promesse de revenu. Le réseau principal est ${network}. Retourne 7 idées variées avec day,type,platform,objective,title,body. Chaque texte doit être directement exploitable et comporter un CTA adapté.`;
  if(!process.env.OPENAI_API_KEY)return Response.json({error:"Clé IA non configurée"},{status:503});
  const ai=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5-mini",input:prompt,text:{format:{type:"json_schema",name:"networkly_week",strict:true,schema:{type:"object",properties:{items:{type:"array",minItems:7,maxItems:7,items:{type:"object",properties:{day:{type:"integer"},type:{type:"string"},platform:{type:"string"},objective:{type:"string"},title:{type:"string"},body:{type:"string"}},required:["day","type","platform","objective","title","body"],additionalProperties:false}}},required:["items"],additionalProperties:false}}}})});const j=await ai.json();if(!ai.ok)return Response.json({error:"Erreur IA"},{status:502});
  const items=JSON.parse(j.output_text||"{\"items\":[]}").items||[];
  const rows=items.slice(0,7).map((x,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return{user_id:user.id,scheduled_date:d.toISOString().slice(0,10),scheduled_time:time,content_type:x.type||"Publication",platform:x.platform||network,objective:x.objective||"Engagement",title:x.title||`Jour ${i+1}`,body:x.body||"",status:activate?"planned":"draft",is_ai_generated:true}});
  const {data:saved,error}=await admin.from("content_items").insert(rows).select();if(error)throw error;
  await admin.from("usage_monthly").upsert({user_id:user.id,month_key:key,generations:(u?.generations||0)+1,updated_at:new Date().toISOString()});
  return Response.json({items:saved,usage:{used:(u?.generations||0)+1,limit}});
 }catch{return Response.json({error:"Impossible de créer la semaine."},{status:500})}
}