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
 const excludeBusinesses=body.excludeBusinesses!==false;
 const seenIds=new Set(Array.isArray(body.seenIds)?body.seenIds.filter(id=>typeof id==="string").slice(0,500):[]);
 const language=["all","fr","en","es","pt","de","it"].includes(body.language)?body.language:"fr";
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
  const mediaPath="/"+encodeURIComponent(hashtagId)+"/recent_media";
  const mediaParams={user_id:userId,fields:"id,caption,media_type,media_url,permalink,timestamp",limit:50};
  const recentPages=[];
  let afterCursor=null;
  const cutoff=Date.now()-14*24*60*60*1000;
  const searchStarted=Date.now();
  for(let page=0;page<5;page++){
   if(page>0&&Date.now()-searchStarted>6500)break;
   let batch;
   try{batch=await graph(mediaPath,{...mediaParams,...(afterCursor?{after:afterCursor}:{})});}
   catch(error){if(recentPages.length)break;throw error;}
   recentPages.push(...(batch.data||[]));
   const batchDates=(batch.data||[]).map(x=>Date.parse(x.timestamp)).filter(Number.isFinite);
   if(batchDates.length&&Math.min(...batchDates)<cutoff)break;
   const nextCursor=batch.paging?.cursors?.after;
   if(!nextCursor||nextCursor===afterCursor||!(batch.data||[]).length)break;
   afterCursor=nextCursor;
  }
  const {data:remaining,error:quotaError}=await supabase.rpc("consume_instagram_discovery");
  if(quotaError)return Response.json({error:quotaError.message},{status:429});
  const commercialTerms=/\b(boutique|shop|store|collection|commande|commander|disponible|livraison|promotion|soldes|prix|achat|acheter|client|produit|marque|entreprise|artisan|création|creation|réservation|reservation|business|smallbusiness|onlineshop|newarrival|order|sale|shipping|brand|handmade|ecommerce|eshop)\b/i;
  // Hashtag media does not reliably expose the author's username or full name.
  // Use caption signals only; never claim to have verified account type.
  const commercialSignals=/(?:\b(?:boutique|shop|store|eshop|e-shop|ecommerce|shopping|soldes|promo(?:tion)?|code\s*promo|réduction|reduction|commandez|commander|achetez|acheter|livraison|expédition|expedition|en\s*stock|disponible|nouvelle\s*collection|notre\s*collection|nos\s*produits|nos\s*boutiques|notre\s*boutique|nos\s*clients|prix|tarif|réservez|reservez|offre\s*spéciale|offre\s*speciale|lancement|new\s*arrival|new\s*collection|order\s*now|buy\s*now|free\s*shipping|discount|sale|shop\s*now|link\s*in\s*bio|brand|official\s*store|fashion\s*week|institut|magasin|showroom|salon\s*de\s*coiffure|shopping\s*center)\b|\b(?:\d{1,4}[.,]\d{0,2}\s*(?:€|eur|euros|\$|usd|£)|(?:€|\$|£)\s*\d{1,4})\b|#[a-z0-9_]*(?:shop|boutique|store|business|smallbusiness|onlineshop|ecommerce|eshop|shopping|vente|soldes|promo|brand|collection)[a-z0-9_]*)/i;
  const personalSignals=/(?:\b(?:je|j'ai|j’aime|j'aime|moi|mon|ma|mes|aujourd'hui|aujourd’hui|hier|ma\s*vie|mon\s*look|ma\s*tenue|mon\s*voyage|j'adore|j’adore|j'ai\s*testé|j’ai\s*testé|my\s*day|my\s*life|my\s*outfit|i\s*love|i\s*am|i'm|me\s*and|my\s*trip|my\s*style)\b)/i;
  const languageWords={fr:["le","la","les","des","une","pour","avec","dans","vous","nous","bonjour","merci","mon","mes","notre","sur","est","et","du","de","je","un","pas","qui","aujourd"],en:["the","and","with","for","this","that","your","from","have","just","new","our","you","are","my","in","on","of"],es:["los","las","una","para","con","por","que","del","hola","gracias","nuestro","esta","estoy","muy","como","mis","de","en"],pt:["com","para","uma","que","não","muito","hoje","obrigado","você","nosso","estou","meu","minha","sem","mais","de","em"],de:["und","die","der","das","mit","für","nicht","ich","wir","mein","meine","heute","auf","ein","eine","ist"],it:["con","per","una","che","non","oggi","grazie","ciao","questo","questa","sono","della","nostro","mio","mia","il","gli"]};
  function matchesLanguage(caption){
   if(language==="all")return true;
   const text=String(caption||"").replace(/#[^\s]+|@[^\s]+|https?:\/\/[^\s]+/g," ").toLowerCase();
   const words=text.match(/[a-zà-ÿ]+/g)||[];
   if(words.length<4)return false;
   const scores=Object.fromEntries(Object.entries(languageWords).map(([code,terms])=>[code,words.filter(w=>terms.includes(w)).length]));
   const best=Math.max(...Object.values(scores));
   return best>=2&&scores[language]===best;
  }
  const candidates=recentPages.filter(x=>x.media_type==="IMAGE"&&/^https:\/\//.test(x.media_url||"")&&typeof x.permalink==="string"&&x.permalink.startsWith("https://www.instagram.com/")).map(x=>({id:x.id,caption:String(x.caption||"").slice(0,1000),media_type:x.media_type,media_url:x.media_type==="IMAGE"&&/^https:\/\//.test(x.media_url||"")?x.media_url:null,permalink:x.permalink,timestamp:x.timestamp})).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).filter(x=>Number.isFinite(Date.parse(x.timestamp))&&Date.parse(x.timestamp)>=cutoff&&matchesLanguage(x.caption)&&!seenIds.has(x.id)).sort((a,b)=>excludeBusinesses?Number(personalSignals.test(b.caption))-Number(personalSignals.test(a.caption)):0);
  // Keep commercial posts as fallback only when the search has too few personal results.
  const obviousAds=/(?:\b(?:concours|gagnez|gagner|offert|offre|salon|atelier|inscription|billetterie|commandez|acheter|achetez|shop now|buy now|code promo|livraison gratuite|réservez|reservez|soldes|en stock|disponible|négociable|negociable|prix|tarif|cfa|fcfa)\b|\d+[,.]?\d*\s*(?:€|eur|euros|\$|usd|£|cfa|fcfa))/i;
  const filteredCandidates=excludeBusinesses?candidates.filter(x=>!commercialSignals.test(x.caption)&&!obviousAds.test(x.caption)):candidates;
  const byDay=new Map();
  for(const item of filteredCandidates){
   const day=item.timestamp.slice(0,10);
   if(!byDay.has(day))byDay.set(day,[]);
   byDay.get(day).push(item);
  }
  // Favor genuine first-person posts and captions that mention the searched hashtag.
  const exactTag=new RegExp("(^|\\s)#"+hashtag+"($|[^a-z0-9_])","i");
  const relevance=item=>{
   const caption=item.caption||"";
   const tags=(caption.match(/#[a-z0-9_]+/gi)||[]).length;
   const obviousAd=/(?:\b(?:commandez|acheter|achetez|shop now|buy now|code promo|livraison gratuite|inscription|réservez|reservez|atelier|soldes|en stock)\b|\d+[,.]?\d*\s*€)/i.test(caption);
   const commercial=excludeBusinesses&&(commercialSignals.test(caption)||commercialTerms.test(caption));
   return (exactTag.test(caption)?5:0)+(personalSignals.test(caption)?5:0)+(caption.length>55?2:0)-Math.max(0,tags-8)-(commercial?12:0)-(excludeBusinesses&&obviousAd?18:0);
  };
  for(const posts of byDay.values())posts.sort((a,b)=>relevance(b)-relevance(a));
  // Round-robin across calendar days, so today's posts cannot monopolize the cards.
  const days=[...byDay.keys()].sort((a,b)=>b.localeCompare(a));
  const items=[];
  while(items.length<20&&days.some(day=>byDay.get(day).length)){
   for(const day of days){
    const item=byDay.get(day).shift();
    if(item)items.push(item);
    if(items.length===20)break;
   }
  }
  return Response.json({hashtag,items,remaining,excludeBusinesses,language,availableDays:days,exhausted:items.length===0},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return Response.json({error:"Recherche Instagram indisponible : "+String(e.message||e)},{status:502})}
}
