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
5. Configurer le déclenchement régulier de `/api/cron/run` avec `CRON_SECRET`. Ce cron unique traite les publications programmées et l'expiration du délai de grâce des paiements.
6. Exécuter `npm run check` puis `npm run build`.
7. Depuis un compte administrateur, vérifier `/api/admin/health` avant d'ouvrir les tests utilisateurs. Le diagnostic doit retourner `ok: true` et aucune migration requise manquante.

## Sécurité

Les secrets API et clés privées restent exclusivement côté serveur. Les comptes suspendus ne peuvent pas créer, programmer, approuver ou relancer des publications. Le moteur de publication automatique exclut également les comptes suspendus.

### Catalogue Chogan public

Appliquer `supabase/migrations/20261128120000_public_catalogue.sql` après les migrations CRM, notamment celles des sessions hôtes, du choix de livraison et de l’archivage des clients, avant de déployer cette version.

Dans **Administration → Catalogue Chogan**, saisir les références éligibles avec leurs tarifs TTC réels et un visuel HTTPS autorisé. Pour un parfum, une référence publiée dans Expert Parfums peut préremplir les notes et leur source. Compléter la fiche avec le format, le prix et le visuel de la référence, puis documenter les droits d’utilisation avant de cocher la vérification et la visibilité. Pour Olfazeta, conserver à l’identique les flacons de référence noir homme et blanc femme, avec un décor propre aux notes de la référence et sans nom d’inspiration. Les fiches visibles peuvent rester indisponibles à la commande. Les codes promotionnels généraux sont configurés dans le même écran. Les codes de réunion existants restent réservés à leur réunion.

Dans **Espace Consultant → Mon catalogue**, renseigner les coordonnées professionnelles, créer le lien permanent, télécharger le QR code en PNG ou PDF et fixer les frais de livraison. Les liens contextuels reprennent les règles de disponibilité et de livraison de leur réunion ou mallette. Les commandes apparaissent en attente dans **Mes clients et rappels → Toutes les commandes**. Le consultant peut les modifier, télécharger le PDF et préparer l’e-mail avec les liens de paiement configurés. Les statistiques comptent les ouvertures par session de navigateur et les commandes transmises, agrégées par jour sans données client ni adresse IP dans la table de statistiques.
