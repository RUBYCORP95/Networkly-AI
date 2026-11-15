# TESAMI LeadFactory — conception V1

## Objectif
Fournir chaque jour à chaque consultant des opportunités B2B qualifiées, avec les coordonnées professionnelles et les profils sociaux publics, sans double attribution ni prospection non conforme.

## Parcours
1. Le consultant configure une zone, un rayon, des secteurs et un quota quotidien.
2. Un traitement serveur programmé interroge des sources disposant d'une licence/API autorisant la recherche et la conservation des données.
3. La normalisation rapproche les entreprises par identifiant officiel, domaine et adresse ; les doublons sont écartés.
4. Un enrichissement cherche les liens sociaux **officiels** depuis les sites des entreprises et les sources autorisées : Instagram, Facebook, TikTok, LinkedIn et WhatsApp Business.
5. Les coordonnées sont accompagnées de leur URL source, date de collecte, statut de vérification et règles d'usage.
6. Le moteur attribue les prospects de façon exclusive et équitable, sans promettre de volume si les résultats qualifiés sont insuffisants.
7. Le consultant ouvre la fiche, prépare un message personnalisé avec l'IA et enregistre l'issue de sa prise de contact.

## Données envisagées
- organizations: id, legal_name, trade_name, sector, address, city, country, website, source_url, collected_at, verified_at
- contact_channels: organization_id, channel_type, value, source_url, verified_at, professional_only
- lead_preferences: user_id, city, radius_km, sectors, daily_quota
- lead_assignments: organization_id, user_id, assigned_at, exclusive_until, status
- lead_interactions: assignment_id, type, occurred_at, note
- suppression_entries: normalized_contact_hash, reason, created_at

Contraintes : index d'unicité et transactions pour empêcher une double attribution ; RLS Supabase pour isoler les données des consultants ; contrôles administrateur ; journal d'audit.

## Conformité et limites
- Ne pas aspirer massivement Google Maps ou les réseaux sociaux en violation de leurs conditions.
- Privilégier les API, annuaires licenciés et liens publiés sur les sites officiels.
- Ne pas déduire ni inventer d'adresse email ou de profil social absent.
- Distinguer coordonnées professionnelles génériques et données nominatives.
- Évaluer la base légale, informer les personnes concernées lorsque nécessaire, fournir une opposition simple et conserver une liste d'exclusion.
- Aucun envoi automatique de messages dans la V1.
- Ne pas présenter le score IA comme une intention d'achat avérée.

## Découpage de livraison
1. Migration Supabase + politiques RLS + préférences de prospection.
2. Connecteur de source B2B autorisée, normalisation et enrichissement social.
3. Traitement quotidien idempotent, quotas et attribution transactionnelle.
4. Interface consultant : filtres, fiche, sources, réseaux, statut CRM.
5. Assistant de rédaction IA, tests et métriques de conversion.

## Vérifications avant déploiement
- Sélectionner les fournisseurs de données et confirmer les licences/coûts.
- Vérifier les routes et conventions du dépôt, les secrets et la configuration cron.
- Tester RLS, concurrence d'attribution, doublons, oppositions et quotas.
- Exécuter npm run check et npm run build ; tester sur environnement de préproduction.
