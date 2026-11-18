import "./globals.css";
import DashboardReturn from "./DashboardReturn";
export const metadata={title:"TESAMI",description:"Crée, programme et publie ton contenu sur tous tes réseaux depuis un seul endroit."};
export default function RootLayout({children}){return <html lang="fr"><body>{children}<DashboardReturn/></body></html>}