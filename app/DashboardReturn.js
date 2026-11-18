"use client";
import {usePathname} from "next/navigation";
import Link from "next/link";
export default function DashboardReturn(){
 const pathname=usePathname();
 if(!pathname||pathname==="/"||pathname==="/login"||pathname.startsWith("/auth/")||pathname==="/signup"||pathname.startsWith("/reset-password"))return null;
 return <Link href="/" aria-label="Retour au tableau de bord TESAMI" style={{position:"fixed",right:18,bottom:18,zIndex:1000,display:"inline-flex",alignItems:"center",gap:8,padding:"12px 16px",background:"#4c2db0",color:"#fff",fontSize:13,fontWeight:700,borderRadius:14,boxShadow:"0 8px 28px #1b104d44",textDecoration:"none",maxWidth:"calc(100vw - 36px)"}}><span aria-hidden="true">←</span> Tableau de bord</Link>;
}
