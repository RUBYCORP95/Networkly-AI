import {createServerSupabase} from "../../../lib/supabase/server";
import {requireActiveUser} from "../../../lib/auth/active-user";

export async function POST(request){
 const supabase=await createServerSupabase();
 const access=await requireActiveUser(supabase);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 const token=process.env.INSTAGRAM_DISCOVERY_ACCESS_TOKEN;
 const userId=process.env.INSTAGRAM_DISCOVERY_IG_USER_ID;
 if(!token||!userId)return Response.json({error:"La connexion Instagram administrateur n'est pas encore configurée. Ajoutez INSTAGRAM_DISCOVERY_ACCESS_TOKEN et INSTAGRAM_DISCOVERY_IG_USER_ID dans les variables serveur Vercel."},{status:503});
 let body;
 try{body=await request.json()}catch{return Response.json({error:"Requête invalide"},{status:400})}
 const hashtag=String(body.hashtag||"").trim().replace(/^#/,"").toLowerCase();
 if(!/^[a-z0-9_]{2,50}$/.test(hashtag))return Response.json({error:"Hashtag invalide (lettres sans accents, chiffres et _)"},{status:400});
 const base="https://graph.facebook.com/v27.0";
 async function graph(path,params){
  const url=new URL(base+path);
  Object.entries({...params,access_token:token}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  const response=await fetch(url,{cache:"no-store"});
  const json=await response.json();
  if(!response.ok||json.error)throw new Error(json.error?.message||"Erreur Meta Instagram");
  return json;
 }
 try{
  const found=await graph("/ig_hashtag_search",{user_id:userId,q:hashtag});
  const hashtagId=found.data?.[0]?.id;
  if(!hashtagId)return Response.json({items:[],remaining:null,hashtag});
  const recent=await graph("/"+encodeURIComponent(hashtagId)+"/recent_media",{user_id:userId,fields:"id,caption,media_type,media_url,permalink,timestamp",limit:25});
  const {data:remaining,error:quotaError}=await supabase.rpc("consume_instagram_discovery");
  if(quotaError)return Response.json({error:quotaError.message},{status:429});
  const items=(recent.data||[]).filter(x=>typeof x.permalink==="string"&&x.permalink.startsWith("https://www.instagram.com/")).map(x=>({id:x.id,caption:String(x.caption||"").slice(0,1000),media_type:x.media_type,media_url:x.media_type==="IMAGE"&&/^https:\/\//.test(x.media_url||"")?x.media_url:null,permalink:x.permalink,timestamp:x.timestamp})).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  return Response.json({hashtag,items,remaining},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:"Recherche Instagram indisponible : "+String(e.message||e)},{status:502})}
}
