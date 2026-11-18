import {createServerSupabase} from "../../../lib/supabase/server";
import {requireActiveUser} from "../../../lib/auth/active-user";

import {matchingHashtags,relatedHashtags} from "../../../lib/instagram/themes.mjs";

export async function POST(request){
 const supabase=await createServerSupabase();
 const access=await requireActiveUser(supabase);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 const token=process.env.INSTAGRAM_DISCOVERY_ACCESS_TOKEN;
 const userId=process.env.INSTAGRAM_DISCOVERY_IG_USER_ID;
 if(!token||!userId)return Response.json({error:"La recherche Instagram doit être configurée par l’administration de TESAMI."},{status:503});
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
  const response=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(4500)});
  const json=await response.json();
  if (!response.ok || json.error) {
   const error = new Error("Erreur Meta Instagram");
   error.metaCode = Number(json.error?.code);
   throw error;
  }
  return json;
 }
 try{
  const theme=relatedHashtags(hashtag);
  const searchTags=[hashtag,...theme.filter(tag=>tag!==hashtag).slice(0,2)];
  const cutoff=Date.now()-24*60*60*1000;
  async function recentMedia(tag,maxPages){
   const found=await graph("/ig_hashtag_search",{user_id:userId,q:tag});
   const id=found.data?.[0]?.id;
   if(!id)return [];
   const mediaPath="/"+encodeURIComponent(id)+"/recent_media";
   const fields="id,caption,media_type,media_url,permalink,timestamp";
   const posts=[];
   let after;
   for(let page=0;page<maxPages;page++){
    let batch;
    try{batch=await graph(mediaPath,{user_id:userId,fields,limit:50,...(after?{after}:{})});}
    catch(error){if(posts.length&&error.metaCode!==190)break;throw error;}
    posts.push(...(batch.data??[]));
    const next=batch.paging?.next&&batch.paging?.cursors?.after;
    if(!next||next===after||!batch.data?.length)break;
    after=next;
   }
   return posts;
  }
  const batches=await Promise.allSettled(searchTags.map((tag,index)=>recentMedia(tag,index===0?2:1)));
  if(batches[0].status==="rejected")throw batches[0].reason;
  const recentPages=[...new Map(batches.flatMap(batch=>batch.status==="fulfilled"?batch.value:[])
   .filter(post=>typeof post.id==="string").map(post=>[post.id,post])).values()];
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
  const candidates=recentPages.filter(x=>x.media_type==="IMAGE"&&/^https:\/\//.test(x.media_url||"")&&typeof x.permalink==="string"&&x.permalink.startsWith("https://www.instagram.com/")).map(x=>({id:x.id,caption:String(x.caption||"").slice(0,2200),matchingHashtags:matchingHashtags(String(x.caption||""),theme),media_type:x.media_type,media_url:x.media_type==="IMAGE"&&/^https:\/\//.test(x.media_url||"")?x.media_url:null,permalink:x.permalink,timestamp:x.timestamp})).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).filter(x=>Number.isFinite(Date.parse(x.timestamp))&&Date.parse(x.timestamp)>=cutoff&&matchesLanguage(x.caption)&&!seenIds.has(x.id)).sort((a,b)=>excludeBusinesses?Number(personalSignals.test(b.caption))-Number(personalSignals.test(a.caption)):0);
  // Exclude detectable promotional posts even if fewer than five results remain.
  const obviousAds=/(?:\b(?:concours|gagnez|gagner|offert|offre|salon|atelier|inscription|billetterie|commandez|acheter|achetez|shop now|buy now|code promo|livraison gratuite|réservez|reservez|soldes|en stock|disponible|négociable|negociable|prix|tarif|cfa|fcfa)\b|\d+[,.]?\d*\s*(?:€|eur|euros|\$|usd|£|cfa|fcfa))/i;
  // Instagram's hashtag API does not provide a reliable account type. Reject strong
  // editorial, promotional and brand signals instead of presenting them as personal posts.
  const brandOrEditorialSignals=/(?:\\b(?:tom\\s*ford|yk\\s*active|ashley\\s*graham|industrie|industry|mannequin|modeling|magazine|éditorial|editorial|campagne|campaign|publicité|advertising|sponsorisé|sponsored|partenariat\\s*commercial|collaboration\\s*commerciale|ambassadeur|ambassadrice|brand\\s*ambassador|fashion\\s*brand|label|maison\\s*de\\s*mode|nouvelle\\s*gamme|découvrez\\s*notre|decouvrez\\s*notre|bienvenue\\s*dans\\s*l.univers|official|officiel|officielle|communiqué|communique|presse|press\\s*release|lancement|lookbook|catalogue)\\b|#[a-z0-9_]*(?:brand|official|campaign|sponsored|ad|advertising|magazine|lookbook)[a-z0-9_]*)/i;
  const filteredCandidates=excludeBusinesses?candidates.filter(x=>!commercialSignals.test(x.caption)&&!obviousAds.test(x.caption)&&!brandOrEditorialSignals.test(x.caption)):candidates;
  // Count only distinct, known theme hashtags. Use recent, non-spammy captions as tie breakers.
  const relevance=item=>{
   const tagCount=(item.caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)||[]).length;
   const personal=personalSignals.test(item.caption);
   const commercial=excludeBusinesses&&commercialTerms.test(item.caption);
   return Number(personal)*3 + Number(item.matchingHashtags.includes(hashtag))*2
    - Math.max(0,tagCount-8) - Number(commercial)*6;
  };
  const items=filteredCandidates.sort((a,b)=>
   b.matchingHashtags.length-a.matchingHashtags.length ||
   relevance(b)-relevance(a) ||
   Date.parse(b.timestamp)-Date.parse(a.timestamp)
  ).slice(0,5);
  const days=[...new Set(filteredCandidates.map(item=>item.timestamp.slice(0,10)))].sort().reverse();
  return Response.json({hashtag,items,remaining,excludeBusinesses,language,availableDays:days,exhausted:items.length===0},{headers:{"Cache-Control":"no-store"}});
 } catch (error) {
  if (error.metaCode === 190) {
   return Response.json({
    code: "instagram_connection_expired",
    error: "La connexion Instagram de TESAMI doit être renouvelée par l’administration. Cette tentative n’a pas été décomptée.",
   }, { status: 503 });
  }
  return Response.json({ error: "La recherche Instagram est temporairement indisponible. Réessaie dans quelques instants." }, { status: 502 });
 }
}
