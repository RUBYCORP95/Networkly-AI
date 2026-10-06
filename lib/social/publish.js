export async function publishFacebook(){throw new Error("Facebook OAuth non connecté")}
export async function publishInstagram(){throw new Error("Instagram OAuth non connecté")}
export async function publishTikTok(){throw new Error("TikTok OAuth non connecté")}
export async function publishToProvider(provider,payload,connection){
 if(provider==="facebook")return publishFacebook(payload,connection);
 if(provider==="instagram")return publishInstagram(payload,connection);
 if(provider==="tiktok")return publishTikTok(payload,connection);
 throw new Error("Réseau non pris en charge");
}
