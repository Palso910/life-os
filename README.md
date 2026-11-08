# LifeOS

LifeOS est une application personnelle française de suivi d’habitudes, tâches, échéances, notes et sessions de concentration. Elle fonctionne en mode invité hors connexion et peut synchroniser un compte Supabase entre plusieurs appareils.

## Démarrage local

Prérequis : Node.js 20.9 ou plus récent et npm.

```powershell
npm install
npm run dev
```

Ouvre ensuite [http://localhost:3000](http://localhost:3000). Sans variables Supabase, LifeOS fonctionne en mode invité et sauvegarde automatiquement dans le stockage local du navigateur (`lifeos-v2`). Aucune donnée personnelle de démonstration n’est créée.

## Supabase et connexion

1. Crée un projet Supabase et ouvre **SQL Editor**.
2. Exécute `supabase/migrations/202611080001_initial_schema.sql`.
3. Dans Supabase, active **Authentication → Providers → Email** et configure les URL de redirection autorisées : `http://localhost:3000/auth/callback` et l’URL de production `/auth/callback`.
4. Copie `.env.example` vers `.env.local`, puis renseigne :

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE_PROJET.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=VOTRE_CLE_PUBLIQUE_ANON
SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE_SERVICE_ROLE
```

`SUPABASE_SERVICE_ROLE_KEY` est strictement serveur; ne la préfixe jamais par `NEXT_PUBLIC_` et ne la publie pas. Redémarre `npm run dev` après une modification de `.env.local`.

La connexion utilise des liens magiques par e-mail. Les politiques RLS isolent chaque profil et chaque ligne métier par `auth.uid()`. Les identifiants historiques non-UUID sont convertis de façon stable à l’import afin de garder les liens entre habitudes et journaux.

## Importer ton LifeOS existant sans perdre l’historique

Le navigateur ne permet pas à un site `localhost` de lire le stockage d’un ancien fichier ouvert en `file://`. Dans l’ancien LifeOS, ouvre **Données → Sauvegarder** et télécharge le JSON, puis dans le nouveau LifeOS ouvre **Mes données → Importer un JSON**. L’import fusionne les lignes sans effacer les données déjà présentes. Il accepte aussi les versions exportées sous la clé historique `lifeos-v1`.

Si l’ancien fichier et le nouveau site sont sur la même origine, la clé `lifeos-v1` est reconnue automatiquement et copiée sous `lifeos-v2`; l’ancienne clé reste intacte. Exporte une sauvegarde JSON avant toute migration par prudence.

## Notifications push (facultatif)

Les rappels push en arrière-plan demandent HTTPS, un compte connecté et des clés VAPID. Génére-les avec :

```powershell
npx web-push generate-vapid-keys
```

Ajoute la clé publique à `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, la clé privée à `VAPID_PRIVATE_KEY`, et un secret aléatoire long à `CRON_SECRET` dans `.env.local` et dans les variables Vercel. Pour des rappels planifiés lorsque l’application est fermée, configure un cron qui appelle `/api/push/dispatch` avec `Authorization: Bearer <CRON_SECRET>` toutes les cinq minutes. Sur Vercel, cette fréquence nécessite un plan qui l’autorise; garde `vercel.json` sans cron pour que le déploiement fonctionne également sur le plan Hobby. Sur un plan compatible, ajoute :

```json
{
  "crons": [
    { "path": "/api/push/dispatch", "schedule": "*/5 * * * *" }
  ]
}
```

Dans l’application, active ensuite **Réglages → Rappels → Activer les rappels push**.

Les rappels locaux du navigateur peuvent également fonctionner quand la page est ouverte. Ils ne remplacent pas le push du serveur quand l’application est fermée.

## Images personnalisées

Les slots prêts à remplacer se trouvent dans `public/images/` :

| Fichier | Usage |
|---|---|
| `logo.svg` | Icône et marque |
| `fond.svg` | Fond d’écran |
| `banniere-dashboard.svg` | Bannière d’accueil |
| `onboarding-1.svg` à `onboarding-3.svg` | Introduction en trois écrans |
| `empty-habits.svg`, `empty-notes.svg` | États vides |
| `avatar-default.svg` | Avatar de repli |
| `focus.svg`, `sablier.svg`, `trophee.svg` | Illustrations focus et gamification |

Remplace un fichier en gardant son nom pour changer le visuel partout. L’écran **Réglages → Tes visuels** accepte aussi des images personnalisées jusqu’à 3 Mo (stockées localement sur cet appareil). Les visuels manquants retombent sur les illustrations SVG et le style CSS.

## Déploiement Vercel

1. Crée un dépôt GitHub et pousse le projet (voir les commandes de livraison ci-dessous).
2. Dans Vercel, importe le dépôt. Le framework Next.js est détecté automatiquement.
3. Ajoute les variables Supabase décrites plus haut. Ajoute les clés VAPID et `CRON_SECRET` si tu actives les rappels push.
4. Déploie. Ajoute l’URL de production aux URL de redirection Supabase.
5. Vérifie le chargement du site en HTTPS, puis installe LifeOS depuis le menu du navigateur sur téléphone ou ordinateur.

La compilation ne requiert pas de secrets Supabase; sans variables, le site démarre en mode invité. La connexion, la synchronisation, la suppression de compte et les rappels push nécessitent leurs variables de serveur.

## Commandes de vérification

```powershell
npm run typecheck
npm run build
```

## Livraison GitHub

Le dossier de départ n’avait pas encore de dépôt Git ni de remote configuré. Après avoir créé un dépôt vide GitHub, remplace l’adresse de remote par celle fournie par GitHub :

```powershell
git init
git add .
git commit -m "feat: transformer LifeOS en application PWA"
git branch -M main
git remote add origin https://github.com/VOTRE-COMPTE/lifeos.git
git push -u origin main
```

Ne committe jamais `.env.local`; il est ignoré par `.gitignore`.

## Stockage et synchronisation

Les mises à jour sont écrites dans le cache local avant la synchronisation. Les conflits d’une même habitude/date sont résolus par `updated_at` (dernier écrit gagnant); les suppressions de tâches, notes et échéances sont conservées comme tombstones pour éviter leur réapparition sur un appareil resté hors ligne. Les dates de suivi sont des dates civiles `YYYY-MM-DD`; la génération de la heatmap annuelle utilise un compteur de jours et ne soustrait pas des millisecondes.

Dans le widget **À faire**, choisis une date puis répartis les tâches entre les blocs **Matin**, **Midi** et **Soir**. Les tâches existantes sans date restent visibles aujourd’hui dans le bloc Matin. La date et le bloc sont conservés dans le champ de date déjà synchronisé, sans migration supplémentaire de la base Supabase.

Le JSON exporté inclut l’historique complet, les tâches, les échéances, les notes, les sessions de focus, réglages et images. Les fichiers d’image personnalisés ajoutés depuis Réglages sont propres à l’appareil; remplace les slots versionnés dans `public/images/` si tu souhaites les distribuer à tous les appareils.
