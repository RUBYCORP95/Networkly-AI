const BASE="https://a.klaviyo.com/api";
function headers(){return {"Authorization":"Klaviyo-API-Key "+process.env.KLAVIYO_PRIVATE_API_KEY,"accept":"application/vnd.api+json","content-type":"application/vnd.api+json","revision":process.env.KLAVIYO_API_REVISION||"2026-07-15"}}
async function call(path,options={}){if(!process.env.KLAVIYO_PRIVATE_API_KEY)return {skipped:true};const r=await fetch(BASE+path,{...options,headers:{...headers(),...(options.headers||{})}});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw new Error(data?.errors?.[0]?.detail||"Erreur Klaviyo");return data}
export async function trackKlaviyoEvent({email,event,properties={}}){if(!email)return {skipped:true};const body={data:{type:"event",attributes:{properties,metric:{data:{type:"metric",attributes:{name:event}}},profile:{data:{type:"profile",attributes:{email}}}}}};return call("/events",{method:"POST",body:JSON.stringify(body)})}
export async function upsertKlaviyoCustomer({email,firstName,lastName,userId,properties={}}){
 if(!email)return {skipped:true};
 const body={data:{type:"profile",attributes:{email,first_name:firstName||undefined,last_name:lastName||undefined,external_id:userId||undefined,properties:{networkly_customer:true,account_created_at:new Date().toISOString(),...properties}}}};
 const data=await call("/profile-import",{method:"POST",body:JSON.stringify(body)});
 return data;
}
