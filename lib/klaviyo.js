const BASE="https://a.klaviyo.com/api";
function headers(){return {"Authorization":"Klaviyo-API-Key "+process.env.KLAVIYO_PRIVATE_API_KEY,"accept":"application/vnd.api+json","content-type":"application/vnd.api+json","revision":process.env.KLAVIYO_API_REVISION||"2026-07-15"}}
async function call(path,options={}){if(!process.env.KLAVIYO_PRIVATE_API_KEY)return {skipped:true};const r=await fetch(BASE+path,{...options,headers:{...headers(),...(options.headers||{})}});const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{}if(!r.ok)throw new Error(data?.errors?.[0]?.detail||"Erreur Klaviyo");return data}
export async function trackKlaviyoEvent({email,event,properties={}}){if(!email)return {skipped:true};const body={data:{type:"event",attributes:{properties,metric:{data:{type:"metric",attributes:{name:event}}},profile:{data:{type:"profile",attributes:{email}}}}}};return call("/events",{method:"POST",body:JSON.stringify(body)})}
export async function upsertKlaviyoCustomer({email,firstName,lastName,userId,properties={}}){
 if(!email)return {skipped:true};
 const body={data:{type:"profile",attributes:{email,first_name:firstName||undefined,last_name:lastName||undefined,external_id:userId||undefined,properties:{networkly_customer:true,...properties}}}};
 const data=await call("/profile-import",{method:"POST",body:JSON.stringify(body)});
 return data;
}

export async function syncKlaviyoBilling({email,userId,status,plan,failedAt,graceEndsAt,lastPaymentAt}){
 if(!email)return {skipped:true};
 await upsertKlaviyoCustomer({email,userId,properties:{subscription_status:status,networkly_plan:plan,payment_failed_at:failedAt||null,grace_period_ends_at:graceEndsAt||null,last_payment_at:lastPaymentAt||null}});
 const names={past_due:"Networkly Payment Failed",active:"Networkly Payment Recovered",grace_expired:"Networkly Subscription Suspended",grace_expired_cancel_pending:"Networkly Subscription Suspended"};
 if(names[status])await trackKlaviyoEvent({email,event:names[status],properties:{plan,status,grace_period_ends_at:graceEndsAt||null}});
 return {ok:true};
}

export async function syncCrmCustomerEmail(email) {
  const signal = AbortSignal.timeout(4500);
  const profile = await call("/profile-import", {
    method: "POST",
    signal,
    body: JSON.stringify({ data: { type: "profile", attributes: { email } } }),
  });
  if (!profile.data?.id) throw new Error("Profil Klaviyo indisponible");

  const listId = process.env.KLAVIYO_CRM_CUSTOMERS_LIST_ID || "UT2LGY";
  await call("/lists/" + encodeURIComponent(listId) + "/relationships/profiles/", {
    method: "POST",
    signal,
    body: JSON.stringify({ data: [{ type: "profile", id: profile.data.id }] }),
  });
}

export async function syncQueuedCrmCustomers(db) {
  if (!process.env.KLAVIYO_PRIVATE_API_KEY) return { synced: 0, retrying: 0, configured: false };
  const { data, error } = await db.rpc("claim_crm_customer_klaviyo");
  if (error) throw new Error("File Klaviyo CRM indisponible");

  const results = await Promise.allSettled(data.map(async ({ email, attempts }) => {
    await syncCrmCustomerEmail(email);
    const { error: deleteError } = await db.from("crm_customer_klaviyo_queue").delete().eq("email", email).eq("attempts", attempts);
    if (deleteError) throw new Error("File Klaviyo CRM indisponible");
  }));
  return {
    synced: results.filter(result => result.status === "fulfilled").length,
    retrying: results.filter(result => result.status === "rejected").length,
  };
}
