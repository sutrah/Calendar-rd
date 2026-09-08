#!/usr/bin/env python3
"""
Récupère depuis Pronote (compte parent) : devoirs, évaluations à venir, moyennes
et notifications (informations/actualités), pour Sören et Loïse. Écrit un fichier
JSON par enfant et par catégorie dans ./out/, prêt à être déployé en FTP dans
data/ à la racine du site.

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
"""

import json
import os
import re
import sys
import unicodedata
from datetime import date, timedelta

import pronotepy

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "out")
DAYS_AHEAD = 14


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


def write_json(name, payload):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


# --- Devoirs -----------------------------------------------------------------

def fetch_devoirs(client, key):
    today = date.today()
    homeworks = client.homework(date_from=today, date_to=today + timedelta(days=DAYS_AHEAD))
    by_date = {}
    for hw in homeworks:
        iso = hw.date.isoformat()
        by_date.setdefault(iso, []).append(
            {
                "subject": hw.subject.name if hw.subject else "",
                "description": strip_html(hw.description),
                "done": bool(hw.done),
            }
        )
    for items in by_date.values():
        items.sort(key=lambda i: i["subject"])
    path = write_json(f"devoirs-{key}.json", {"updatedAt": today.isoformat(), "byDate": by_date})
    total = sum(len(v) for v in by_date.values())
    print(f"Écrit {path} : {total} devoir(s) sur {len(by_date)} date(s)")


# --- Évaluations (cours marqués comme contrôle/évaluation dans Pronote) ------

def fetch_evaluations(client, key):
    today = date.today()
    try:
        lessons = client.lessons(date_from=today, date_to=today + timedelta(days=DAYS_AHEAD))
    except Exception as e:
        print(f"[évaluations] impossible de récupérer les cours : {e}", file=sys.stderr)
        return

    by_date = {}
    for lesson in lessons:
        is_exam = bool(getattr(lesson, "exam", False) or getattr(lesson, "test", False))
        if not is_exam:
            continue
        d = getattr(lesson, "start", None)
        if d is None:
            continue
        iso = d.date().isoformat()
        by_date.setdefault(iso, []).append(
            {
                "subject": lesson.subject.name if getattr(lesson, "subject", None) else "",
                "start": d.strftime("%H:%M"),
                "end": lesson.end.strftime("%H:%M") if getattr(lesson, "end", None) else "",
            }
        )
    for items in by_date.values():
        items.sort(key=lambda i: i["start"])
    path = write_json(f"evaluations-{key}.json", {"updatedAt": today.isoformat(), "byDate": by_date})
    total = sum(len(v) for v in by_date.values())
    print(f"Écrit {path} : {total} évaluation(s) sur {len(by_date)} date(s)")


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
        student = to_float(getattr(avg, "student", None))
        if student is None:
            continue
        subjects.append(
            {
                "subject": avg.subject.name if getattr(avg, "subject", None) else "",
                "student": student,
                "classAverage": to_float(getattr(avg, "class_average", None)),
                "outOf": to_float(getattr(avg, "out_of", None)) or 20,
            }
        )

    overall = to_float(getattr(period, "overall_average", None))
    if overall is None and subjects:
        # Repli : moyenne simple des moyennes par matière (les coefficients
        # officiels du bac ne sont pas ré-appliqués ici, on fait confiance aux
        # coefficients déjà configurés par l'établissement dans Pronote pour
        # le calcul de la moyenne générale native).
        overall = round(sum(s["student"] for s in subjects) / len(subjects), 2)

    path = write_json(
        f"moyennes-{key}.json",
        {"updatedAt": date.today().isoformat(), "periodName": getattr(period, "name", ""), "overall": overall, "subjects": subjects},
    )
    print(f"Écrit {path} : moyenne générale {overall}, {len(subjects)} matière(s)")


# --- Notifications (informations, actualités, sécurité...) -------------------

def fetch_notifications(client):
    try:
        infos = client.information_and_surveys()
    except Exception as e:
        print(f"[notifications] impossible de récupérer les informations : {e}", file=sys.stderr)
        return

    items = []
    for info in infos:
        created = getattr(info, "start_date", None) or getattr(info, "creation_date", None)
        raw_id = getattr(info, "id", None)
        stable_id = str(raw_id) if raw_id is not None else str(hash((info.title, str(created))))
        items.append(
            {
                "id": stable_id,
                "title": getattr(info, "title", "") or "",
                "content": strip_html(getattr(info, "content", "")),
                "author": getattr(info, "author", "") or "",
                "date": created.isoformat() if created else None,
            }
        )
    items.sort(key=lambda i: i["date"] or "", reverse=True)
    path = write_json("notifications.json", {"updatedAt": date.today().isoformat(), "items": items})
    print(f"Écrit {path} : {len(items)} notification(s)")


def main():
    url = os.environ["PRONOTE_URL"]
    username = os.environ["PRONOTE_USERNAME"]
    password = os.environ["PRONOTE_PASSWORD"]

    client = pronotepy.ParentClient(url, username=username, password=password)
    if not client.logged_in:
        print("Échec de connexion à Pronote (identifiants invalides ?)", file=sys.stderr)
        sys.exit(1)

    # Les notifications sont au niveau du compte parent, pas par enfant.
    fetch_notifications(client)

    found = set()
    for child in client.children:
        key = child_key(child.name)
        if key is None:
            print(f"Enfant non reconnu, ignoré : {child.name!r}", file=sys.stderr)
            continue
        client.set_child(child)
        fetch_devoirs(client, key)
        fetch_evaluations(client, key)
        fetch_moyennes(client, key)
        found.add(key)

    missing = {"soren", "loise"} - found
    if missing:
        print(f"Attention : aucun enfant trouvé pour {sorted(missing)} sur ce compte Pronote", file=sys.stderr)


if __name__ == "__main__":
    main()
