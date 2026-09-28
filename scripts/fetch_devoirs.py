#!/usr/bin/env python3
"""
Récupère depuis Pronote (compte parent) : devoirs, évaluations à venir, moyennes
et notifications (informations/actualités), pour Sören et Loïse. Écrit un
fichier JSON par enfant et par catégorie dans ./out/, prêt à être déployé en
FTP dans data/ à la racine du site.

Utilise la bibliothèque non-officielle "pronotepy" avec les identifiants du
compte parent fournis via variables d'environnement (secrets GitHub Actions) :
PRONOTE_URL, PRONOTE_USERNAME, PRONOTE_PASSWORD.

Ce script ne fait rien d'autre que se connecter avec les identifiants de la
famille pour lire les propres données scolaires des enfants — comme le
ferait un parent en se connectant sur pronote.index-education.fr.

Chaque section (évaluations, moyennes, notifications) est protégée par son
propre try/except : si l'API pronotepy diffère légèrement d'une version à
l'autre pour l'une d'elles, les autres sections continuent d'être écrites
plutôt que de faire échouer tout le script.

Le menu de cantine n'est PAS géré par ce script : la famille préfère le
saisir à la main (data/menu.json), donc ce fichier n'est jamais touché ici.

Récupère aussi le calendrier d'équipe de hockey de Sören (flux iCalendar
public exporté par SportEasy, URL fournie via HOCKEY_ICS_URL_SOREN) — sans
rapport avec Pronote, indépendant de la connexion à ce dernier.
"""

import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pronotepy

PARIS_TZ = ZoneInfo("Europe/Paris")

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")
DAYS_AHEAD = 14

# Site déjà déployé (public, en lecture) : sert à relire l'état précédent d'un
# fichier avant de l'écraser, pour savoir ce qui est vraiment nouveau (ex. ne
# notifier qu'une seule fois par alerte plutôt qu'à chaque exécution).
SITE_DATA_BASE = "https://games.preprod-eskem-studio.xyz/cal/data/"

# Public par nature (embarqué côté client dans js/push.js) — contrairement à
# ONESIGNAL_REST_API_KEY (secret GitHub), ce n'est pas une donnée sensible.
ONESIGNAL_APP_ID = "41619346-065e-4c78-9b6b-cf8c3e5bc639"


def normalize(text):
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.lower()


def child_key(name):
    norm = normalize(name)
    if "soren" in norm:
        return "soren"
    if "loise" in norm:
        return "loise"
    return None


def strip_html(text):
    if not text:
        return ""
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def get_val(obj, name, default=None):
    """getattr, mais appelle la valeur si pronotepy l'expose comme une méthode
    plutôt qu'un attribut simple (ça varie selon les versions/objets)."""
    val = getattr(obj, name, default)
    if callable(val):
        try:
            val = val()
        except TypeError:
            pass  # ce n'était pas vraiment une méthode sans arguments : on garde tel quel
    return val


def write_json(name, payload):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def fetch_live_json(name, default):
    """Relit un fichier déjà déployé sur le site public (avant de l'écraser),
    pour comparer à l'état précédent. Renvoie `default` si le fichier n'existe
    pas encore ou si la requête échoue (jamais fatal)."""
    try:
        with urllib.request.urlopen(SITE_DATA_BASE + name, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return default


# --- Devoirs -----------------------------------------------------------------

def fetch_devoirs(client, key):
    today = date.today()
    homeworks = client.homework(date_from=today, date_to=today + timedelta(days=DAYS_AHEAD))
    by_date = {}
    for hw in homeworks:
        try:
            subject = get_val(hw, "subject", None)
            iso = hw.date.isoformat()
            by_date.setdefault(iso, []).append(
                {
                    "subject": get_val(subject, "name", "") if subject else "",
                    "description": strip_html(get_val(hw, "description", "")),
                    "done": bool(get_val(hw, "done", False)),
                }
            )
        except Exception as e:
            print(f"[devoirs] devoir ignoré (erreur : {e})", file=sys.stderr)
    for items in by_date.values():
        items.sort(key=lambda i: i["subject"])
    path = write_json(f"devoirs-{key}.json", {"updatedAt": today.isoformat(), "byDate": by_date})
    total = sum(len(v) for v in by_date.values())
    print(f"Écrit {path} : {total} devoir(s) sur {len(by_date)} date(s)")


# --- Évaluations (cours marqués contrôle/devoir OU évaluation de compétences) --
#
# pronotepy's lesson.test ne lit que cahierDeTextes.V.estDevoir (la case
# "devoir/contrôle" classique). Les évaluations créées via le module
# "Évaluations par compétences" posent un champ voisin dans le même objet,
# cahierDeTextes.V.estEval, que la classe Lesson de pronotepy ne conserve
# nulle part (elle jette le JSON brut une fois l'objet construit) — trouvé
# en inspectant la réponse réelle de PageAccueil sur le compte de la
# famille (le cours PHYSIQUE-CHIMIE du 10/09 a bien cahierDeTextes.V =
# {"estEval": true, "originesCategorie": [{"L": "Évaluation de
# compétences"}]}, sans estDevoir).
#
# On reproduit donc l'appel que fait client.lessons() en interne
# (PageEmploiDuTemps, onglet 16) pour garder le dict JSON brut de chaque
# cours à côté de l'objet Lesson, plutôt que d'appeler client.lessons()
# telle quelle.

def raw_lessons(client, date_from, date_to):
    """Comme client.lessons(), mais renvoie des couples (Lesson, dict brut)
    au lieu de simples Lesson — pour accéder aux champs que pronotepy ne
    conserve pas (ex. cahierDeTextes.V.estEval)."""
    user = client.parametres_utilisateur["dataSec"]["data"]["ressource"]
    base_data = {
        "ressource": user,
        "avecAbsencesEleve": False,
        "avecConseilDeClasse": True,
        "estEDTPermanence": False,
        "avecAbsencesRessource": True,
        "avecDisponibilites": True,
        "avecInfosPrefsGrille": True,
        "Ressource": user,
    }
    if not isinstance(date_from, datetime):
        date_from = datetime.combine(date_from, datetime.min.time())
    if not isinstance(date_to, datetime):
        date_to = datetime.combine(date_to, datetime.min.time())

    pairs = []
    for week in range(client.get_week(date_from), client.get_week(date_to) + 1):
        data = dict(base_data, NumeroSemaine=week, numeroSemaine=week)
        response = client.post("PageEmploiDuTemps", 16, data)
        for raw in response["dataSec"]["data"]["ListeCours"]:
            lesson = pronotepy.dataClasses.Lesson(client, raw)
            if date_from <= lesson.start <= date_to:
                pairs.append((lesson, raw))
    return pairs


def is_flagged_eval(raw_lesson):
    cdt = (raw_lesson.get("cahierDeTextes") or {}).get("V") or {}
    return bool(cdt.get("estDevoir")) or bool(cdt.get("estEval"))


def fetch_evaluations(client, key):
    today = date.today()
    try:
        pairs = raw_lessons(client, today, today + timedelta(days=DAYS_AHEAD))
    except Exception as e:
        print(f"[évaluations] impossible de récupérer les cours : {e}", file=sys.stderr)
        return

    by_date = {}
    for lesson, raw in pairs:
        try:
            if not is_flagged_eval(raw):
                continue
            d = get_val(lesson, "start", None)
            if d is None:
                continue
            subject = get_val(lesson, "subject", None)
            subject_name = get_val(subject, "name", "") if subject else ""
            end = get_val(lesson, "end", None)
            by_date.setdefault(d.date().isoformat(), []).append(
                {
                    "subject": subject_name,
                    "start": d.strftime("%H:%M"),
                    "end": end.strftime("%H:%M") if end else "",
                }
            )
        except Exception as e:
            print(f"[évaluations] cours ignoré (erreur : {e})", file=sys.stderr)
    for items in by_date.values():
        items.sort(key=lambda i: i["start"])
    path = write_json(f"evaluations-{key}.json", {"updatedAt": today.isoformat(), "byDate": by_date})
    total = sum(len(v) for v in by_date.values())
    print(f"Écrit {path} : {total} évaluation(s) sur {len(by_date)} date(s)")


# --- Emploi du temps réel (source de vérité : Pronote, jamais le fichier saisi à la main) -
#
# soren.json/loise.json restent la référence pour ce que Pronote ne connaît pas du tout
# (CHA, hockey, taekwondo, muay thai — marqués "pronote": false dans ces fichiers) et pour
# les dates hors de la fenêtre récupérée ici (trop loin devant). Mais pour tout ce que
# Pronote couvre (les DAYS_AHEAD prochains jours), ce fichier-ci fait foi : le site
# l'utilise à la place de l'emploi du temps saisi à la main, silencieusement — plus besoin
# de comparer à la main à chaque fois que Pronote change quelque chose (matière, salle,
# horaire...). Chaque date de la fenêtre reçoit une clé même sans cours (liste vide), pour
# distinguer "Pronote dit qu'il n'y a rien ce jour-là" de "date hors de la fenêtre connue".

def fetch_lessons(client, key):
    today = date.today()
    try:
        pairs = raw_lessons(client, today, today + timedelta(days=DAYS_AHEAD))
    except Exception as e:
        print(f"[emploi du temps] impossible de récupérer les cours : {e}", file=sys.stderr)
        return

    by_date = {(today + timedelta(days=i)).isoformat(): [] for i in range(DAYS_AHEAD + 1)}
    for lesson, raw in pairs:
        try:
            d = get_val(lesson, "start", None)
            if d is None:
                continue
            iso = d.date().isoformat()
            if iso not in by_date:
                continue
            subject = get_val(lesson, "subject", None)
            subject_name = get_val(subject, "name", "") if subject else ""
            end = get_val(lesson, "end", None)
            by_date[iso].append(
                {
                    "subject": subject_name,
                    "teacher": get_val(lesson, "teacher_name", "") or "",
                    "room": get_val(lesson, "classroom", "") or "",
                    "start": d.strftime("%H:%M"),
                    "end": end.strftime("%H:%M") if end else "",
                }
            )
        except Exception as e:
            print(f"[emploi du temps] cours ignoré (erreur : {e})", file=sys.stderr)
    for items in by_date.values():
        items.sort(key=lambda i: i["start"])
    path = write_json(f"lessons-{key}.json", {"updatedAt": today.isoformat(), "byDate": by_date})
    total = sum(len(v) for v in by_date.values())
    print(f"Écrit {path} : {total} cours sur {len(by_date)} jour(s)")


# --- Alertes emploi du temps (prof absent, cours annulé, cours modifié, salle) --
#
# Confirmé en direct sur le compte de la famille : Pronote fournit déjà, sur
# chaque cours, un champ Statut (exposé par pronotepy comme lesson.status) qui
# porte exactement le même texte que les badges affichés dans son propre
# planning ("Prof. absent", "Prof./pers. absent", "Cours annulé", "Cours
# modifié", "Changement de salle"...). Pas besoin de comparer nous-mêmes la
# salle du jour à la salle habituelle : on relit juste ce texte.

ALERT_CATEGORIES = (
    ("absent", re.compile(r"prof.*absent", re.IGNORECASE)),
    ("annule", re.compile(r"annul[ée]", re.IGNORECASE)),
    ("modifie", re.compile(r"modifi[ée]", re.IGNORECASE)),
    ("salle", re.compile(r"salle", re.IGNORECASE)),
)


def alert_category(status):
    if not status:
        return None
    for category, pattern in ALERT_CATEGORIES:
        if pattern.search(status):
            return category
    return None


def fetch_alerts(client, key):
    today = date.today()
    try:
        pairs = raw_lessons(client, today, today + timedelta(days=DAYS_AHEAD))
    except Exception as e:
        print(f"[alertes] impossible de récupérer les cours : {e}", file=sys.stderr)
        return

    by_date = {}
    for lesson, raw in pairs:
        try:
            status = get_val(lesson, "status", None)
            category = alert_category(status)
            if not category:
                continue
            d = get_val(lesson, "start", None)
            if d is None:
                continue
            subject = get_val(lesson, "subject", None)
            subject_name = get_val(subject, "name", "") if subject else ""
            end = get_val(lesson, "end", None)
            by_date.setdefault(d.date().isoformat(), []).append(
                {
                    "subject": subject_name,
                    "start": d.strftime("%H:%M"),
                    "end": end.strftime("%H:%M") if end else "",
                    "status": status,
                    "category": category,
                }
            )
        except Exception as e:
            print(f"[alertes] cours ignoré (erreur : {e})", file=sys.stderr)
    for items in by_date.values():
        items.sort(key=lambda i: i["start"])
    path = write_json(f"alerts-{key}.json", {"updatedAt": today.isoformat(), "byDate": by_date})
    total = sum(len(v) for v in by_date.values())
    print(f"Écrit {path} : {total} alerte(s) sur {len(by_date)} date(s)")

    try:
        notify_new_alerts(key, by_date, today)
    except Exception as e:
        print(f"[alertes] notification push ignorée (erreur : {e})", file=sys.stderr)


# --- Notification push automatique (OneSignal) --------------------------------
#
# Ne pousse que ce qui concerne aujourd'hui ou demain (le reste attend d'être
# sur le point d'arriver — inutile de prévenir 10 jours à l'avance) et
# uniquement les alertes réellement nouvelles : "alerts-notified-{key}.json"
# garde la trace de ce qui a déjà été poussé (le script tourne 5x/jour) pour
# ne jamais renvoyer deux fois la même notification. Ciblage par enfant via un
# tag OneSignal (alert_soren / alert_loise) posé côté navigateur (js/push.js) —
# chacun ne reçoit donc que les alertes du ou des enfants qu'il a choisis.

ALERT_LABELS = {
    "absent": "Prof absent",
    "annule": "Cours annulé",
    "modifie": "Cours modifié",
    "salle": "Salle changée",
}

CHILD_LABELS = {"soren": "Sören", "loise": "Loïse"}


def alert_key(iso_date, item):
    return f"{iso_date}|{item['start']}|{item['subject']}|{item['category']}"


def send_push_notification(key, title, message):
    api_key = os.environ.get("ONESIGNAL_REST_API_KEY")
    if not api_key:
        print("[push] ONESIGNAL_REST_API_KEY absent, notification ignorée", file=sys.stderr)
        return
    payload = {
        "app_id": ONESIGNAL_APP_ID,
        "headings": {"fr": title},
        "contents": {"fr": message},
        "filters": [{"field": "tag", "key": f"alert_{key}", "relation": "=", "value": "true"}],
        "url": "https://games.preprod-eskem-studio.xyz/cal/",
    }
    req = urllib.request.Request(
        "https://api.onesignal.com/notifications",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Key {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            print(f"[push] {key} : notification envoyée ({resp.status})")
    except urllib.error.HTTPError as e:
        print(f"[push] {key} : échec envoi ({e.code} {e.read().decode('utf-8', 'replace')})", file=sys.stderr)
    except urllib.error.URLError as e:
        print(f"[push] {key} : échec envoi ({e})", file=sys.stderr)


def notify_new_alerts(key, by_date, today):
    tomorrow = today + timedelta(days=1)
    candidates = [
        (iso, item)
        for iso in (today.isoformat(), tomorrow.isoformat())
        for item in by_date.get(iso, [])
    ]
    if not candidates:
        return

    notified_path = f"alerts-notified-{key}.json"
    previous = fetch_live_json(notified_path, {"keys": []})
    already_notified = set(previous.get("keys", []))

    new_items = [(iso, item) for iso, item in candidates if alert_key(iso, item) not in already_notified]
    if new_items:
        lines = []
        for iso, item in new_items:
            when = "Aujourd'hui" if iso == today.isoformat() else "Demain"
            label = ALERT_LABELS.get(item["category"], item["status"])
            lines.append(f"{when} {item['start']} {item['subject']} : {label}")
        title = f"{CHILD_LABELS.get(key, key)} — emploi du temps"
        send_push_notification(key, title, "\n".join(lines))

    # On ne garde que les 3 derniers jours dans le fichier de suivi : largement
    # assez pour ne jamais repousser aujourd'hui/demain deux fois, sans laisser
    # le fichier grossir indéfiniment.
    cutoff = (today - timedelta(days=3)).isoformat()
    kept = {k for k in already_notified if k.split("|", 1)[0] >= cutoff}
    kept.update(alert_key(iso, item) for iso, item in candidates)
    write_json(notified_path, {"updatedAt": today.isoformat(), "keys": sorted(kept)})


# --- Moyennes ------------------------------------------------------------------

def to_float(value):
    try:
        return round(float(str(value).replace(",", ".")), 2)
    except (TypeError, ValueError):
        return None


def fetch_moyennes(client, key):
    try:
        period = client.current_period
        averages = period.averages
    except Exception as e:
        print(f"[moyennes] impossible de récupérer les moyennes : {e}", file=sys.stderr)
        return

    subjects = []
    for avg in averages:
        try:
            student = to_float(get_val(avg, "student", None))
            if student is None:
                continue
            subject = get_val(avg, "subject", None)
            subjects.append(
                {
                    "subject": get_val(subject, "name", "") if subject else "",
                    "student": student,
                    "classAverage": to_float(get_val(avg, "class_average", None)),
                    "outOf": to_float(get_val(avg, "out_of", None)) or 20,
                }
            )
        except Exception as e:
            print(f"[moyennes] matière ignorée (erreur : {e})", file=sys.stderr)

    # overall_average lit moyGenerale, la moyenne générale que Pronote calcule
    # lui-même en pondérant chaque matière par son coefficient (configuré par
    # l'établissement — normalement les coefficients du bac pour Loïse) ; on ne
    # recalcule donc rien ici. Vérifié en direct sur les deux comptes : Pronote la
    # fournit systématiquement, ce repli n'est donc a priori jamais utilisé — il ne
    # reste que pour le cas où moyGenerale serait absente (établissement qui n'a pas
    # configuré de coefficients), auquel cas la moyenne devient une simple moyenne
    # non pondérée des matières, comme le fait pronotepy lui-même dans ce cas.
    overall = to_float(get_val(period, "overall_average", None))
    if overall is None and subjects:
        overall = round(sum(s["student"] for s in subjects) / len(subjects), 2)

    path = write_json(
        f"moyennes-{key}.json",
        {"updatedAt": date.today().isoformat(), "periodName": get_val(period, "name", ""), "overall": overall, "subjects": subjects},
    )
    print(f"Écrit {path} : moyenne générale {overall}, {len(subjects)} matière(s)")


# --- Hockey de Sören (calendrier SportEasy de l'équipe, format iCalendar) -----
#
# N'a rien à voir avec Pronote : c'est un flux ICS public en lecture seule
# (URL non devinable mais non authentifiée) exporté par SportEasy pour
# l'équipe. On ne s'appuie sur aucune bibliothèque icalendar externe : le
# format produit par SportEasy est simple (pas de règles de récurrence, pas
# de fuseaux horaires personnalisés — tout est en UTC avec un "Z"), un petit
# analyseur RFC 5545 minimal suffit. Ce flux liste des événements ponctuels
# (matchs, tournois, hors-glace exceptionnel, réunions) qui s'ajoutent aux
# créneaux hebdomadaires fixes déjà saisis à la main dans soren.json — il ne
# les remplace pas.


def unfold_ics_lines(text):
    """Défait le "line folding" RFC 5545 : une ligne qui continue la
    précédente commence par une espace ou une tabulation."""
    lines = text.replace("\r\n", "\n").split("\n")
    unfolded = []
    for line in lines:
        if line.startswith((" ", "\t")) and unfolded:
            unfolded[-1] += line[1:]
        else:
            unfolded.append(line)
    return unfolded


def unescape_ics_value(value):
    return (
        value.replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\\\", "\\")
    )


def parse_ics_events(text):
    events = []
    current = None
    for raw_line in unfold_ics_lines(text):
        line = raw_line.strip()
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current is not None:
                events.append(current)
            current = None
        elif current is not None and ":" in line:
            key_part, value = line.split(":", 1)
            key = key_part.split(";", 1)[0].upper()
            current[key] = unescape_ics_value(value)
    return events


def parse_ics_datetime(value):
    value = value.strip()
    if value.endswith("Z"):
        dt = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=ZoneInfo("UTC"))
    elif "T" in value:
        # Pas de "Z" ni de TZID : on suppose une heure déjà locale (Europe/Paris).
        dt = datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=PARIS_TZ)
    else:
        dt = datetime.strptime(value, "%Y%m%d").replace(tzinfo=PARIS_TZ)
    return dt.astimezone(PARIS_TZ)


def fetch_hockey_soren():
    url = os.environ.get("HOCKEY_ICS_URL_SOREN")
    if not url:
        print("[hockey] HOCKEY_ICS_URL_SOREN absent, section ignorée", file=sys.stderr)
        return

    try:
        with urllib.request.urlopen(url.replace("webcal://", "https://", 1), timeout=30) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"[hockey] impossible de récupérer le calendrier SportEasy : {e}", file=sys.stderr)
        return

    today = date.today()
    by_date = {}
    for ev in parse_ics_events(text):
        try:
            dtstart = ev.get("DTSTART")
            if not dtstart:
                continue
            start = parse_ics_datetime(dtstart)
            if start.date() < today:
                continue
            dtend = ev.get("DTEND")
            end = parse_ics_datetime(dtend) if dtend else None
            # Le résumé SportEasy est "<Nom d'équipe> - <type d'événement>" :
            # on ne garde que le type (ex. "Practice", "Tournoi").
            summary = ev.get("SUMMARY", "").split(" - ", 1)
            label = (summary[1] if len(summary) > 1 else summary[0]).strip()
            by_date.setdefault(start.date().isoformat(), []).append(
                {
                    "label": label,
                    "start": start.strftime("%H:%M"),
                    "end": end.strftime("%H:%M") if end else "",
                    "location": (ev.get("LOCATION") or "").strip(),
                }
            )
        except Exception as e:
            print(f"[hockey] événement ignoré (erreur : {e})", file=sys.stderr)

    for items in by_date.values():
        items.sort(key=lambda i: i["start"])
    path = write_json("hockey-soren.json", {"updatedAt": today.isoformat(), "byDate": by_date})
    total = sum(len(v) for v in by_date.values())
    print(f"Écrit {path} : {total} événement(s) sur {len(by_date)} date(s)")


# --- Notifications (informations, actualités, sécurité...) -------------------

def fetch_notifications(login_fn):
    """login_fn : fonction sans argument qui renvoie une connexion Pronote
    fraîche (ex. la fonction login() elle-même).

    Information.content() (pronotepy) déclenche sa PROPRE requête Pronote à
    chaque accès. En enchaîner plusieurs sur une même session expire
    systématiquement celle-ci ("La page a expiré !") dès qu'il y a plus d'une
    ou deux informations — c'est ce qui faisait échouer 100% des notifications
    en pratique. On récupère donc la liste une première fois (léger, pas de
    contenu), puis on rouvre une session dédiée pour le contenu de chaque
    information, comme pour les autres sections."""
    try:
        infos = login_fn().information_and_surveys()
    except Exception as e:
        print(f"[notifications] impossible de récupérer les informations : {e}", file=sys.stderr)
        return

    items = []
    for info in infos:
        try:
            created = get_val(info, "start_date", None) or get_val(info, "creation_date", None)
            title = get_val(info, "title", "") or ""
            raw_id = get_val(info, "id", None)
            stable_id = str(raw_id) if raw_id is not None else str(hash((title, str(created))))

            content = ""
            try:
                fresh_infos = login_fn().information_and_surveys()
                fresh_info = next((i for i in fresh_infos if get_val(i, "id", None) == raw_id), None)
                if fresh_info is not None:
                    content = strip_html(get_val(fresh_info, "content", ""))
            except Exception as e:
                print(f"[notifications] contenu ignoré pour '{title}' (erreur : {e})", file=sys.stderr)

            items.append(
                {
                    "id": stable_id,
                    "title": title,
                    "content": content,
                    "author": get_val(info, "author", "") or "",
                    "date": created.isoformat() if hasattr(created, "isoformat") else (str(created) if created else None),
                }
            )
        except Exception as e:
            print(f"[notifications] une information a été ignorée (erreur : {e})", file=sys.stderr)
    items.sort(key=lambda i: i["date"] or "", reverse=True)
    path = write_json("notifications.json", {"updatedAt": date.today().isoformat(), "items": items})
    print(f"Écrit {path} : {len(items)} notification(s)")


def login():
    """Nouvelle connexion Pronote. Pronote invalide la session ("La page a
    expiré !") si trop de requêtes s'enchaînent sur un même identifiant de
    page — on ouvre donc une session fraîche pour chaque section plutôt que
    d'en réutiliser une seule pour tout (notifications + devoirs +
    évaluations + moyennes × 2 enfants), ce qui faisait échouer les derniers
    appels une fois qu'assez de requêtes s'étaient accumulées."""
    client = pronotepy.ParentClient(
        os.environ["PRONOTE_URL"],
        username=os.environ["PRONOTE_USERNAME"],
        password=os.environ["PRONOTE_PASSWORD"],
    )
    if not client.logged_in:
        raise RuntimeError("Échec de connexion à Pronote (identifiants invalides ?)")
    return client


def login_as_child(key):
    client = login()
    for child in client.children:
        if child_key(child.name) == key:
            client.set_child(child)
            return client
    raise RuntimeError(f"Enfant '{key}' introuvable sur ce compte Pronote")


def list_child_keys():
    client = login()
    return {child_key(c.name) for c in client.children if child_key(c.name)}


def main():
    # Chaque section (et, pour les enfants, chaque catégorie de données) se
    # connecte séparément et est protégée par son propre try/except : une
    # erreur inattendue dans l'une n'empêche pas les autres d'être écrites.

    try:
        fetch_notifications(login)
    except Exception as e:
        print(f"[notifications] section entière ignorée (erreur : {e})", file=sys.stderr)

    try:
        fetch_hockey_soren()
    except Exception as e:
        print(f"[hockey] section entière ignorée (erreur : {e})", file=sys.stderr)

    try:
        found = list_child_keys()
    except Exception as e:
        print(f"Impossible de lister les enfants du compte Pronote (erreur : {e})", file=sys.stderr)
        sys.exit(1)

    for key in ("soren", "loise"):
        if key not in found:
            print(f"Attention : aucun enfant trouvé pour '{key}' sur ce compte Pronote", file=sys.stderr)
            continue
        for fn, label in (
            (fetch_devoirs, "devoirs"),
            (fetch_evaluations, "évaluations"),
            (fetch_lessons, "emploi du temps"),
            (fetch_alerts, "alertes"),
            (fetch_moyennes, "moyennes"),
        ):
            try:
                fn(login_as_child(key), key)
            except Exception as e:
                print(f"[{label}] section ignorée pour {key} (erreur : {e})", file=sys.stderr)


if __name__ == "__main__":
    main()
