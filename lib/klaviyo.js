const BASE="https://a.klaviyo.com/api";
function headers(){return {"Authorization":`Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,"accept":"application/vnd.api+json","content-type":"application/vnd.api+json","revision":"2026-07-15"}}
export async function trackKlaviyoEvent({email,event,properties={}}){
 if(!process.env.KLAVIYO_PRIVATE_API_KEY||!email)return {skipped:true};
 const body={data:{type:"event",attributes:{properties,metric:{data:{type:"metric",attributes:{name:event}}},profile:{data:{type:"profile",attributes:{email}}}}}};
 const r=await fetch(`${BASE}/events`,{method:"POST",headers:headers(),body:JSON.stringify(body)});
 return {ok:r.ok,status:r.status};
}