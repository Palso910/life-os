LIFEOS - Hub d'organisation personnel

CONTENU
  index.html : l'application complete, autonome (aucune connexion requise).
  assets/    : les visuels (versions SVG integrees + tes images Canva importees).

UTILISATION
  1. Decompresse le ZIP ou tu veux.
  2. Double-clique sur index.html : LifeOS s'ouvre dans ton navigateur.
  3. Tes donnees sont sauvegardees automatiquement dans le navigateur (localStorage).

EFFETS
  Animations et particules partout (bouton FX en haut pour les activer/couper).

SAUVEGARDE / IMPORT
  Bouton Donnees : exporte toutes tes donnees en fichier .json (transfert PC <-> telephone)
  ou restaure une sauvegarde precedente (l'import remplace les donnees actuelles).

DONNEES RELIEES A LA VRAIE DATE
  Chaque case correspond a un vrai jour. Tout l'historique est conserve et visible :
  - echelle 7 jours : la semaine glissante
  - echelle Mois : calendrier complet, navigable avec les fleches
  - echelle Annee : heatmap type GitHub, une annee entiere par habitude, cliquable
  - graphique Stats : 7 jours / 30 jours / 12 mois au choix
  Au passage a un nouveau jour, les grilles et stats se recalculent toutes seules.

DEPLOIEMENT (optionnel)
  1. Cree un repo GitHub (ex. lifeos) et televerse le contenu du dossier LifeOS.
  2. Dans Vercel : Add New Project -> importe le repo -> Framework Preset: Other.
  3. Deploy : tu obtiens une URL en ligne utilisable sur telephone et PC.

PROCHAINE ETAPE (optionnel)
  Migration vers Next.js + Supabase pour synchroniser les donnees entre appareils
  (meme pipeline que le Hub Courses : GitHub + Vercel + Supabase).
