# Networkly AI

SaaS de création de contenu pour vendeurs en marketing de réseau.

## V1
- Dashboard responsive
- Publications, Reels/TikTok, Stories, prospection et recrutement
- Générateur de démonstration
- Offre Pro : 7,90 €/mois
- Paiements prévus : Mollie + PayPal

## Lancer en local
```bash
npm install
npm run dev
```
Puis ouvrir http://localhost:3000.

## Paiements
Copier .env.example vers .env.local et ajouter les vraies clés uniquement dans l'environnement privé du serveur. Ne jamais publier les secrets Mollie ou PayPal dans GitHub.

## Prochaines étapes
Connexion IA, authentification utilisateurs, base de données, webhooks Mollie/PayPal et gestion des abonnements.
