# Networkly AI

SaaS de création, préparation et programmation de contenu social avec IA.

## État actuel de la V1

- Authentification et onboarding utilisateur
- Studio de génération de textes
- Génération de médias IA image / vidéo
- Bibliothèque de médias
- Création d'une publication complète avec IA
- Import de contenu personnel sans compression forcée
- Calendrier éditorial et génération d'une semaine de contenu
- Programmation avec date, heure et fuseau horaire
- Modes brouillon, validation avant publication et publication automatique
- Connexions OAuth Facebook, Instagram et TikTok
- Suivi des statuts de publication, erreurs et retry
- Paiements Mollie / PayPal et délai de grâce de 7 jours
- Synchronisation des inscriptions avec Klaviyo
- Administration clients et diagnostic de configuration

## Lancer en local

```bash
npm install
cp .env.example .env.local
npm run check
npm run dev
```

Puis ouvrir l'adresse locale affichée par Next.js.

## Variables nécessaires

Copier `.env.example` vers `.env.local` et renseigner les secrets dans l'environnement privé du serveur. Ne jamais publier les vraies clés dans GitHub.

Pour tester le socle de l'application : Supabase est indispensable.

Pour tester les fonctions IA : ajouter OpenAI et Alexya.

Pour tester les publications réelles : ajouter les identifiants OAuth Meta et TikTok, les URLs de callback autorisées et `CRON_SECRET`.

Pour tester les paiements et le cycle d'abonnement : configurer Mollie et/ou PayPal ainsi que leurs webhooks.

Klaviyo est nécessaire pour la synchronisation marketing des inscriptions.

## Avant un test public

1. Appliquer les migrations SQL présentes dans `supabase/`.
2. Configurer toutes les variables d'environnement sur l'hébergeur.
3. Définir `NEXT_PUBLIC_APP_URL` avec l'URL HTTPS de l'application.
4. Ajouter les callbacks OAuth correspondants dans Meta et TikTok.
5. Configurer le déclenchement régulier de `/api/publish/run` avec `CRON_SECRET`.
6. Exécuter `npm run check` puis `npm run build`.
7. Depuis un compte administrateur, vérifier `/api/admin/health` avant d'ouvrir les tests utilisateurs.

## Sécurité

Les secrets API et clés privées restent exclusivement côté serveur. Les comptes suspendus ne peuvent pas créer, programmer, approuver ou relancer des publications. Le moteur de publication automatique exclut également les comptes suspendus.
