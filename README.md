# Calendrier famille

Site statique (HTML/CSS/JS, sans base de données ni serveur) hébergé en FTP.

## Mise en ligne

Le déploiement est **automatique** : `.github/workflows/deploy.yml` envoie tout le site
(y compris `data/*.json`) en FTP à chaque push sur la branche
`claude/family-calendar-tabs-8fh8zj`. Plus besoin d'uploader quoi que ce soit à la main.

⚠️ Le contenu de `data/` (emplois du temps, événements famille) vit désormais dans **git**,
pas seulement sur le serveur FTP : un fichier édité et uploadé directement en FTP sans
passer par git sera écrasé au prochain push. Voir « Modifier les emplois du temps ».

Sur un mobile, ouvrez l'URL du site → ajoutez-le à l'écran d'accueil (bouton
Partager > « Sur l'écran d'accueil ») pour un rendu plein écran façon application,
et pour que les notifications fonctionnent sur iPhone/iPad.

Le site ne nécessite aucun mot de passe : ne partagez pas l'URL en dehors de la famille.

## Emplois du temps de Sören et Loïse

Les emplois du temps dans `data/soren.json` et `data/loise.json` ont été saisis à partir
des documents fournis (photos, puis captures d'écran de l'EDT réel) et vérifiés — le champ
`reviewed` est à `true`. Si vous repérez une erreur, corrigez-la via la page **Modifier**.

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

`data/*.json` est maintenant déployé automatiquement comme le reste du site (voir
« Mise en ligne ») — ce qui veut dire que **git fait foi** : un fichier `data/` modifié
directement en FTP sans passer par git sera écrasé au push suivant. Pour que vos
modifications tiennent dans la durée, transmettez-moi le fichier téléchargé (ou son
contenu) pour que je le committe, plutôt que de l'uploader vous-même en FTP.

1. Ouvrez `edit.html` (lien « ✏️ Modifier les emplois du temps » en bas du calendrier).
2. Choisissez l'onglet (Sören / Loïse / Famille), faites vos changements — ils sont
   sauvegardés automatiquement dans le navigateur (brouillon) au fur et à mesure.
3. Cliquez sur **⬇️ Télécharger** : ça génère le fichier `soren.json` / `loise.json` /
   `family.json` mis à jour.
4. Envoyez-moi ce fichier pour que je le committe (le site se met à jour automatiquement),
   ou committez-le vous-même directement sur GitHub.

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

## Données Pronote (automatique)

Une GitHub Action tourne chaque matin (5h UTC), se connecte à Pronote avec votre compte
parent, et dépose directement en FTP dans `data/` :

- **Devoirs** (`devoirs-soren.json` / `devoirs-loise.json`) : affichés sous le planning du
  jour (**vue Jour uniquement**, pas la vue Semaine), pour le jour suivant celui affiché.
  Chaque devoir a une case à cocher pour le marquer fait (avec un petit effet visuel).
  Cet état coché est stocké **localement dans le navigateur** (localStorage) : il n'est
  donc pas partagé entre les appareils de la famille, chacun garde sa propre coche.
- **Évaluations** (`evaluations-soren.json` / `evaluations-loise.json`) : les créneaux
  marqués comme contrôle/évaluation dans Pronote apparaissent en **orange** dans le
  planning (case du cours + lettre du jour dans le sélecteur de jours / vue Semaine).
- **Moyennes** (`moyennes-soren.json` / `moyennes-loise.json`) : moyenne générale (donut)
  et moyenne par matière, affichées sous les devoirs. Les coefficients utilisés sont ceux
  déjà configurés dans Pronote par l'établissement (qui reflètent normalement les
  coefficients du bac pour Loïse) — le site ne recalcule rien lui-même.
- **Notifications** (`notifications.json`) : les informations/actualités du compte parent
  (sécurité, communications, documents à fournir...) apparaissent dans un onglet dédié
  **Notifications**, avec un badge numérique tant qu'elles n'ont pas été consultées (marqué
  « vu » localement sur l'appareil, dès l'ouverture de l'onglet).

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
data/devoirs-*.json       Devoirs par enfant (généré par la GitHub Action, pas à éditer)
data/evaluations-*.json  Évaluations à venir par enfant (généré par la GitHub Action)
data/moyennes-*.json     Moyennes par enfant (généré par la GitHub Action)
data/notifications.json  Notifications du compte parent (généré par la GitHub Action)
manifest.json           Pour l'ajout à l'écran d'accueil
OneSignalSDKWorker.js    Requis par OneSignal
icons/                   Icônes de l'application
scripts/fetch_devoirs.py     Script Pronote → JSON, lancé par la GitHub Action
.github/workflows/devoirs.yml  Récupère les devoirs Pronote et les dépose en FTP
.github/workflows/deploy.yml   Déploie tout le site (sauf data/) en FTP à chaque push
```
