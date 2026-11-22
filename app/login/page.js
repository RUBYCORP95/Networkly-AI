"use client";
import {useEffect,useState} from "react";
import {CheckCircle2,Mail} from "lucide-react";
import {createClient} from "../../lib/supabase/client";
function friendlyError(message=""){
 if(message.includes("rate limit"))return "Trop de demandes ont été envoyées. Réessaie dans quelques minutes.";
 if(message.includes("For security purposes"))return "Pour ta sécurité, patiente quelques secondes avant de réessayer.";
 if(message.includes("Invalid login credentials"))return "E-mail ou mot de passe incorrect.";
 if(message.includes("already registered"))return "Un compte existe déjà avec cette adresse. Connecte-toi.";
 return message;
}
export default function Login(){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[mode,setMode]=useState("login"),[message,setMessage]=useState(""),[loading,setLoading]=useState(false),[confirm,setConfirm]=useState("");
 useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has("code") && !hash.has("access_token")) return;

  createClient().auth.getSession().then(({ data, error }) => {
   if (error || !data.session) return;
   openDashboard(true);
  }).catch(() => {});
 }, []);

 function openDashboard(created) {
  fetch("/api/klaviyo-signup", {
   method: "POST",
   headers: { "Content-Type": "application/json" },
   body: JSON.stringify({ trackCreated: created }),
   keepalive: true,
  }).catch(() => {});
  window.location.replace("/");
 }

 async function submit(event) {
  event.preventDefault();
  if (loading) return;
  setLoading(true);
  setMessage("");
  try {
   const { auth } = createClient();
   const result = mode === "login"
    ? await auth.signInWithPassword({ email, password })
    : await auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/login" } });
   if (result.error) {
    setMessage(friendlyError(result.error.message));
    return;
   }
   if (result.data?.session) openDashboard(mode === "signup");
   else if (mode === "signup") setConfirm(email);
  } catch {
   setMessage("Connexion indisponible. Réessaie dans un instant.");
  } finally {
   setLoading(false);
  }
 }

 return <div className="authwrap"><div className="authbox"><div className="brand dark"><img src="/tesami-logo.svg" alt="TESAMI" width="104" height="78" /></div><p className="eyebrow">TOUS TES RÉSEAUX. UN SEUL ENDROIT.</p><h1>{mode==="login"?"Bienvenue":"Créer ton compte"}</h1><p>{mode==="login"?"Retrouve ton studio et pilote ta présence sociale.":"Crée, programme et publie ton contenu depuis un seul espace."}</p><form onSubmit={submit}><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="toi@exemple.fr"/></label><label>Mot de passe<input type="password" minLength="6" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="generate" disabled={loading} type="submit">{loading?"Patiente...":mode==="login"?"Se connecter":"Créer mon compte"}</button></form>{message&&<p className="notice">{message}</p>}<button className="linkbtn" onClick={()=>{setMode(mode==="login"?"signup":"login");setMessage("")}}>{mode==="login"?"Pas encore de compte ? S’inscrire":"Déjà inscrit ? Se connecter"}</button></div>{confirm&&<div className="confirmoverlay"><div className="confirmmodal"><div className="confirmicon"><Mail size={26}/></div><p className="eyebrow">DERNIÈRE ÉTAPE</p><h2>Confirme ton adresse e-mail</h2><p>Nous avons envoyé un lien de confirmation à <strong>{confirm}</strong>.</p><div className="confirmtip"><CheckCircle2 size={18}/><span>Clique sur le lien reçu pour accéder à TESAMI.</span></div><p>Tu ne vois pas l’e-mail ? Vérifie le dossier <strong>Spams ou Courriers indésirables</strong>.</p><a className="generate" href="mailto:">Ouvrir ma messagerie</a><button className="linkbtn" onClick={()=>{setConfirm("");setMode("login")}}>J’ai confirmé mon e-mail</button></div></div>}</div>}
