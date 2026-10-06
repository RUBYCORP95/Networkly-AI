import crypto from "crypto";
function key(){const raw=process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;if(!raw)throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY manquante");return crypto.createHash("sha256").update(raw).digest()}
export function encryptToken(value){if(!value)return null;const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);const tag=cipher.getAuthTag();return [iv,tag,encrypted].map(x=>x.toString("base64url")).join(".")}
export function decryptToken(value){if(!value)return null;const [a,b,c]=value.split(".").map(x=>Buffer.from(x,"base64url"));const d=crypto.createDecipheriv("aes-256-gcm",key(),a);d.setAuthTag(b);return Buffer.concat([d.update(c),d.final()]).toString("utf8")}
