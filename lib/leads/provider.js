// Provider contract: licensed JSON API returning { businesses: [...] }.
// Configure LEADS_PROVIDER_URL and LEADS_PROVIDER_API_KEY on the server.
// The provider must authorize retention and reuse of its data for B2B outreach.
const networks=["instagram","facebook","tiktok","linkedin","whatsapp"];
function safeUrl(value){try{const u=new URL(String(value||""));return ["https:","http:"].includes(u.protocol)?u.href:null}catch{return null}}
function normalize(raw){
 if(!raw||typeof raw!=="object")return null;
 const name=String(raw.name||"").trim().slice(0,180),city=String(raw.city||"").trim().slice(0,120);
 const source_url=safeUrl(raw.source_url);
 if(!name||!city||!source_url)return null;
 const socials={};for(const key of networks){const link=safeUrl(raw.socials?.[key]);if(link)socials[key]=link}
 return {name,city,sector:String(raw.sector||"autre").slice(0,80),address:String(raw.address||"").slice(0,240)||null,website:safeUrl(raw.website),email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw.email||""))?String(raw.email).slice(0,200):null,phone:String(raw.phone||"").slice(0,40)||null,socials,source_url,verified_at:new Date().toISOString()};
}
export async function fetchLicensedLeads({city,sectors,radius_km,limit=20}){
 if(!process.env.LEADS_PROVIDER_URL||!process.env.LEADS_PROVIDER_API_KEY)return {configured:false,businesses:[]};
 const endpoint=new URL(process.env.LEADS_PROVIDER_URL);
 if(endpoint.protocol!=="https:")throw new Error("Provider must use HTTPS");
 endpoint.searchParams.set("city",city);endpoint.searchParams.set("sectors",sectors.join(","));endpoint.searchParams.set("radius_km",String(radius_km));endpoint.searchParams.set("limit",String(Math.min(50,limit)));
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try{const response=await fetch(endpoint,{headers:{Authorization:"Bearer "+process.env.LEADS_PROVIDER_API_KEY,Accept:"application/json"},signal:controller.signal,cache:"no-store"});if(!response.ok)throw new Error("Provider HTTP "+response.status);
 const data=await response.json();if(!Array.isArray(data.businesses))throw new Error("Invalid provider response");
 return {configured:true,businesses:data.businesses.slice(0,50).map(normalize).filter(Boolean)};
 }finally{clearTimeout(timeout)}
}
