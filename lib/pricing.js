export function calculatePrice(settings={},promoCode=""){
 const base=Number(settings.monthly_price??7.90);
 const now=Date.now(),start=settings.promo_starts_at?new Date(settings.promo_starts_at).getTime():0,end=settings.promo_ends_at?new Date(settings.promo_ends_at).getTime():Infinity;
 const codeOk=!settings.promo_code||String(promoCode).trim().toUpperCase()===String(settings.promo_code).trim().toUpperCase();
 const active=Number(settings.discount_value)>0&&codeOk&&now>=start&&now<=end;
 let total=base;
 if(active) total=settings.discount_type==="fixed"?base-Number(settings.discount_value):base*(1-Number(settings.discount_value)/100);
 total=Math.max(.01,total);
 return {base:base.toFixed(2),total:total.toFixed(2),currency:settings.currency||"EUR",discountApplied:active};
}