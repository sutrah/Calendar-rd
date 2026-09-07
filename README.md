# Calendrier famille

Site statique (HTML/CSS/JS, sans base de données ni serveur) à héberger en uploadant
simplement tous les fichiers de ce dossier par FTP à la racine de votre hébergement.

## Mise en ligne

1. Uploadez **tout le contenu** de ce dossier (en gardant la structure des sous-dossiers
   `css/`, `js/`, `data/`, `icons/`, et les fichiers `index.html`, `edit.html`,
   `manifest.json`, `OneSignalSDKWorker.js`) à la racine de votre hébergement FTP.
2. Ouvrez l'URL du site sur un mobile → ajoutez-le à l'écran d'accueil (bouton
   Partager > « Sur l'écran d'accueil ») pour un rendu plein écran façon application,
   et pour que les notifications fonctionnent sur iPhone/iPad.

Le site ne nécessite aucun mot de passe : ne partagez pas l'URL en dehors de la famille.

## Emplois du temps de Sören et Loïse

Les emplois du temps dans `data/soren.json` et `data/loise.json` ont été saisis à partir
des photos fournies, mais **ils sont marqués « à vérifier »** (bannière orange visible sur
le site) car certaines cases étaient difficiles à lire avec certitude sur les photos
(feuille inclinée / recadrée). Merci de les relire via la page **Modifier**, corriger ce
qui doit l'être, puis cliquer sur « Marquer comme vérifié » pour faire disparaître la
bannière.

Un bouton **Jour / Semaine** en haut de chaque onglet permet de basculer entre l'agenda
d'une seule journée et la vue de toute la semaine.

L'emploi du temps de Sören alterne certains jours (lundi et mercredi) entre deux versions,
« Semaine Q1 » et « Semaine Q2 », comme au collège. Le site calcule automatiquement quelle
semaine s'applique (visible sous la date : « Semaine Q1/Q2 ») à partir du numéro de semaine
ISO — vérifié sur les emplois du temps réels : semaine du 07/09/2026 = Q2, du 14/09/2026 =
Q1, et ainsi de suite en alternance. Si l'établissement change un jour la référence
(par exemple après une semaine de vacances), corrigez le champ « Alternance » d'un cours
via la page Modifier.

Les activités extrascolaires sont incluses : pour Sören, la Classe Horaire Aménagé (CHA,
à partir du 24/09/2026) et le hockey (à partir du 07/09/2026) ; pour Loïse, le taekwondo
(mercredi soir et samedi matin) et le Muay Thaï (jeudi soir). Un cours « à partir du... »
n'apparaît dans le calendrier qu'à compter de cette date — vous pouvez ajouter ce type de
date de démarrage à n'importe quel cours via la page Modifier.

## Modifier les emplois du temps (page « Modifier »)

Le site n'ayant pas de base de données (uniquement du FTP), l'édition fonctionne ainsi :

1. Ouvrez `edit.html` (lien « ✏️ Modifier les emplois du temps » en bas du calendrier).
2. Choisissez l'onglet (Sören / Loïse / Famille), faites vos changements — ils sont
   sauvegardés automatiquement dans le navigateur (brouillon) au fur et à mesure.
3. Cliquez sur **⬇️ Télécharger** : ça génère le fichier `soren.json` / `loise.json` /
   `family.json` mis à jour.
4. Remplacez ce fichier dans le dossier `data/` de votre hébergement via votre client FTP.
5. Rechargez le site : les changements apparaissent pour toute la famille.

Deux types de modifications sont possibles :
- **Cours réguliers** : la base de l'emploi du temps hebdomadaire (répété chaque semaine).
- **Exceptions ponctuelles** : pour une date précise uniquement — annuler un cours
  (ex. absence prof) ou ajouter un événement ponctuel (ex. sortie scolaire).

Les jours fériés et vacances scolaires sont gérés automatiquement (voir plus bas) : pas
besoin de les ajouter à la main.

## Notifications push (bouton 🔔)

Pas de serveur = pas d'envoi automatique intégré, mais le bouton 🔔 permet à chacun des
4 membres de la famille de s'abonner aux notifications via un service gratuit,
**OneSignal**, puis vous envoyez une notification manuellement (2 clics) quand besoin
(ex. « Sortie scolaire de Loïse demain, penser au pique-nique »).

Configuration (à faire une seule fois) :

1. Créez un compte gratuit sur https://onesignal.com
2. Créez une app de type **Web Push**, renseignez l'URL de votre site.
3. Copiez votre **OneSignal App ID**.
4. Ouvrez `js/push.js`, remplacez `PLACEHOLDER_ONESIGNAL_APP_ID` par cet App ID.
5. Ré-uploadez `js/push.js` en FTP.
6. Chaque membre de la famille ouvre le site et clique sur 🔔 pour s'abonner.
7. Pour envoyer une notification : dashboard OneSignal → **Messages → New Push**.

⚠️ Sur iPhone/iPad, Safari exige que le site soit ajouté à l'écran d'accueil (voir
« Mise en ligne » ci-dessus) avant que les notifications fonctionnent (iOS 16.4+).

## Devoirs Pronote (automatique)

Une GitHub Action tourne chaque matin (5h UTC), se connecte à Pronote avec votre compte
parent, récupère les devoirs de Sören et Loïse pour les jours à venir, et les dépose
directement en FTP dans `data/devoirs-soren.json` et `data/devoirs-loise.json`. Sur le
site, ils apparaissent automatiquement sous le planning du jour (**vue Jour uniquement**,
pas la vue Semaine), pour le jour suivant celui affiché.

Secrets GitHub nécessaires (Settings → Secrets and variables → Actions), déjà créés :
`PRONOTE_URL`, `PRONOTE_USERNAME`, `PRONOTE_PASSWORD` (votre compte **parent** Pronote,
qui voit les deux enfants), `FTP_USERNAME`, `FTP_PASSWORD`. L'hôte FTP et le dossier
distant (`/games/cal/data/`) sont écrits en clair dans
`.github/workflows/devoirs.yml`.

Points importants :
- Cette intégration utilise **pronotepy**, une bibliothèque non-officielle (Pronote n'a
  pas d'API publique). Elle est largement utilisée pour ce type d'automatisation
  personnelle, mais Pronote change parfois son fonctionnement interne, ce qui peut casser
  la connexion jusqu'à une mise à jour de la bibliothèque. Si les devoirs ne se mettent
  plus à jour, allez dans l'onglet **Actions** du dépôt GitHub → « Devoirs Pronote » pour
  voir l'erreur exacte, ou lancez-la manuellement (bouton « Run workflow »).
- Vos identifiants Pronote ne sont utilisés que côté GitHub Actions (jamais envoyés au
  navigateur) : ils ne sont pas visibles par qui visite le site.
- Tant que l'Action n'a pas encore tourné une première fois (ou si elle échoue), la
  section « Devoirs » n'apparaît simplement pas — ça ne bloque rien d'autre sur le site.
- Les enfants sont reconnus par leur prénom (« Sören »/« Loïse », sans tenir compte des
  accents) dans les noms Pronote de vos enfants rattachés au compte parent.

## Jours fériés & vacances scolaires

- Les **jours fériés français** sont calculés automatiquement (`js/holidays.js`), aucune
  mise à jour nécessaire.
- Les **vacances scolaires Zone B** (académie de Rennes, dont Brest fait partie) sont
  actuellement renseignées pour l'année scolaire **2026-2027**. Chaque été, pensez à
  mettre à jour le tableau `VACANCES_ZONE_B` en haut de `js/holidays.js` avec les
  nouvelles dates (disponibles sur education.gouv.fr), puis ré-uploadez ce fichier.

## Structure des fichiers

```
index.html          Page principale (onglets Sören / Loïse / Famille)
edit.html            Page d'édition
css/style.css        Styles (mobile d'abord, thème clair/sombre automatique)
js/app.js            Affichage du calendrier
js/editor.js         Logique de la page Modifier
js/holidays.js        Jours fériés + vacances Zone B
js/colors.js          Couleurs par matière
js/dates.js            Utilitaires de dates
js/push.js             Notifications OneSignal
data/soren.json        Emploi du temps de Sören
data/loise.json        Emploi du temps de Loïse
data/family.json       Événements famille
data/devoirs-soren.json  Devoirs de Sören (généré par la GitHub Action, pas à éditer)
data/devoirs-loise.json  Devoirs de Loïse (généré par la GitHub Action, pas à éditer)
manifest.json           Pour l'ajout à l'écran d'accueil
OneSignalSDKWorker.js    Requis par OneSignal
icons/                   Icônes de l'application
scripts/fetch_devoirs.py     Script Pronote → JSON, lancé par la GitHub Action
.github/workflows/devoirs.yml  La GitHub Action (planification + déploiement FTP)
```
