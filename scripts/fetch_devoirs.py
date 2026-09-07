#!/usr/bin/env python3
"""
Récupère les devoirs à venir de Sören et Loïse depuis Pronote (compte parent)
et écrit un fichier JSON par enfant dans ./out/, prêt à être déployé en FTP
dans data/ à la racine du site.

Utilise la bibliothèque non-officielle "pronotepy" avec les identifiants du
compte parent fournis via variables d'environnement (secrets GitHub Actions) :
PRONOTE_URL, PRONOTE_USERNAME, PRONOTE_PASSWORD.

Ce script ne fait rien d'autre que se connecter avec les identifiants de la
famille pour lire les propres données scolaires des enfants — comme le
ferait un parent en se connectant sur pronote.index-education.fr.
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
    return text.strip()


def fetch_for_child(client, child):
    client.set_child(child)
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
    return by_date


def write_output(key, by_date):
    os.makedirs(OUT_DIR, exist_ok=True)
    payload = {"updatedAt": date.today().isoformat(), "byDate": by_date}
    path = os.path.join(OUT_DIR, f"devoirs-{key}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    total = sum(len(v) for v in by_date.values())
    print(f"Écrit {path} : {total} devoir(s) sur {len(by_date)} date(s)")


def main():
    url = os.environ["PRONOTE_URL"]
    username = os.environ["PRONOTE_USERNAME"]
    password = os.environ["PRONOTE_PASSWORD"]

    client = pronotepy.ParentClient(url, username=username, password=password)
    if not client.logged_in:
        print("Échec de connexion à Pronote (identifiants invalides ?)", file=sys.stderr)
        sys.exit(1)

    found = set()
    for child in client.children:
        key = child_key(child.name)
        if key is None:
            print(f"Enfant non reconnu, ignoré : {child.name!r}", file=sys.stderr)
            continue
        by_date = fetch_for_child(client, child)
        write_output(key, by_date)
        found.add(key)

    missing = {"soren", "loise"} - found
    if missing:
        print(f"Attention : aucun enfant trouvé pour {sorted(missing)} sur ce compte Pronote", file=sys.stderr)


if __name__ == "__main__":
    main()
