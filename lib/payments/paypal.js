const BASE=process.env.PAYPAL_ENV==="live"?"https://api-m.paypal.com":"https://api-m.sandbox.paypal.com";

export async function paypalToken(){
 const auth=Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
 const r=await fetch(BASE+"/v1/oauth2/token",{method:"POST",headers:{Authorization:`Basic ${auth}`,"Content-Type":"application/x-www-form-urlencoded"},body:"grant_type=client_credentials"});
 const j=await r.json();
 if(!r.ok)throw new Error("PayPal authentication failed");
 return j.access_token;
}

export async function paypalCall(path,options={}){
 const token=await paypalToken();
 const r=await fetch(BASE+path,{...options,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(options.headers||{})}});
 const raw=await r.text();
 let payload=null;
 if(raw){try{payload=JSON.parse(raw)}catch{payload={raw}}}
 if(!r.ok)throw new Error(payload?.message||payload?.name||"PayPal error");
 return payload;
}

export async function cancelPayPalSubscription({subscriptionId,reason="Payment failed and grace period expired"}){
 if(!subscriptionId)throw new Error("Missing PayPal subscription id");
 await paypalCall(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,{method:"POST",body:JSON.stringify({reason})});
 return {ok:true};
}

export {BASE as PAYPAL_API_BASE};
