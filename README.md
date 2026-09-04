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
manifest.json           Pour l'ajout à l'écran d'accueil
OneSignalSDKWorker.js    Requis par OneSignal
icons/                   Icônes de l'application
```
