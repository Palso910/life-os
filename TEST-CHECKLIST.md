# Checklist de test LifeOS

## Installation et build

- [ ] `npm install` termine sans erreur.
- [ ] `npm run typecheck` ne remonte aucune erreur TypeScript.
- [ ] `npm run build` compile sans variables Supabase.
- [ ] `npm run dev` ouvre l’application sur `http://localhost:3000`.

## Habitudes, dates et gamification

- [ ] Le premier lancement affiche l’onboarding en trois étapes, puis ne le réaffiche pas.
- [ ] Aucune habitude ou donnée d’exemple n’est créée automatiquement.
- [ ] Ajouter, cocher et décocher une habitude conserve le résultat après actualisation.
- [ ] Les validations d’une autre date restent modifiables sans affecter aujourd’hui.
- [ ] Les vues 7 jours et mois affichent les vrais jours de la semaine et du mois.
- [ ] La heatmap année fonctionne sur une année bissextile et autour d’un changement d’heure; cliquer un jour ouvre son détail mensuel.
- [ ] Une validation attribue 10/20/30 XP selon la difficulté et met à jour niveau, série et badges.
- [ ] Les routines archivées gardent leur historique.
- [ ] Les animations FX peuvent être coupées; le son reste facultatif.

## Dashboard et outils

- [ ] Le calendrier mensuel marque les jours avec activité et ouvre leur historique.
- [ ] Les widgets peuvent être réordonnés avec les flèches et par glisser-déposer sur ordinateur.
- [ ] Ajouter/terminer/supprimer une tâche et ajouter/supprimer une échéance.
- [ ] Enregistrer et supprimer une note; enregistrer le bilan du jour.
- [ ] Le minuteur Pomodoro reste cohérent après actualisation, et une session terminée est historisée.
- [ ] Le mode plein écran du focus masque les distractions.
- [ ] Les graphiques 7 j, 30 j et 12 mois, radar, comparaison et moments de journée s’affichent sans données et avec historique.
- [ ] Le rapport quotidien prépare un e-mail; le rapport hebdomadaire s’imprime en PDF.

## Import, export et confidentialité

- [ ] Exporter puis réimporter un JSON LifeOS v2 fusionne sans doublons ni suppression.
- [ ] Importer une sauvegarde historique `app: "LifeOS", version: 1` conserve habitudes, tous les jours cochés, tâches, échéances, notes, focus, réglages et visuels.
- [ ] L’ancienne clé `lifeos-v1` reste intacte après migration automatique.
- [ ] Le cache local `lifeos-v2` survit au refresh et au passage hors ligne.
- [ ] Exporter une copie avant suppression de compte; vérifier ensuite la suppression du profil et des lignes associées.

## Supabase, PWA et appareil mobile

- [ ] Exécuter la migration SQL dans un projet Supabase vierge; vérifier que toutes les tables ont RLS activé.
- [ ] Se connecter avec le lien magique et confirmer le retour sur `/auth/callback`.
- [ ] Un compte ne peut lire/modifier que ses propres lignes.
- [ ] Créer une validation hors ligne, revenir en ligne, puis vérifier sa synchronisation sur un deuxième appareil.
- [ ] Modifier le même journal depuis deux appareils et confirmer que la date `updated_at` la plus récente gagne.
- [ ] Installer la PWA en HTTPS; vérifier l’icône, le démarrage, la navigation préchargée et le cache hors connexion.
- [ ] Autoriser une notification et vérifier le rappel planifié; en mode push, configurer VAPID, le secret Cron, le cron Vercel et l’autorisation du navigateur.
- [ ] Vérifier les vues téléphone, tablette, bureau et paysage, ainsi que la navigation au clavier et les préférences de réduction des animations.
