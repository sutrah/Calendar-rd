#!/usr/bin/env python3
"""
Récupère depuis Pronote (compte parent) : devoirs, évaluations à venir, moyennes,
menu de cantine et notifications (informations/actualités), pour Sören et Loïse.
Écrit un fichier JSON par enfant et par catégorie dans ./out/, prêt à être
déployé en FTP dans data/ à la racine du site.

Utilise la bibliothèque non-officielle "pronotepy" avec les identifiants du
compte parent fournis via variables d'environnement (secrets GitHub Actions) :
PRONOTE_URL, PRONOTE_USERNAME, PRONOTE_PASSWORD.

Ce script ne fait rien d'autre que se connecter avec les identifiants de la
famille pour lire les propres données scolaires des enfants — comme le
ferait un parent en se connectant sur pronote.index-education.fr.

Chaque section (évaluations, moyennes, notifications, menu) est protégée par
son propre try/except : si l'API pronotepy diffère légèrement d'une version à
l'autre pour l'une d'elles, les autres sections continuent d'être écrites
plutôt que de faire échouer tout le script.

Le menu de cantine est un cas particulier : l'établissement le publie en PDF
(une image scannée, sans texte sélectionnable) sur la page d'accueil Pronote,
un widget non couvert par les méthodes documentées de pronotepy — il faut
appeler directement la fonction Pronote sous-jacente ("PageAccueil", trouvée
en inspectant les requêtes réseau réelles du site). Le PDF ainsi récupéré
est envoyé à l'API Claude (secret ANTHROPIC_API_KEY) pour en extraire le
contenu structuré. Si le secret n'est pas défini, cette section est
simplement ignorée (le reste du script fonctionne normalement).
"""

import base64
import json
import os
import re
import sys
import unicodedata
from datetime import date, datetime, timedelta

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

    overall = to_float(get_val(period, "overall_average", None))
    if overall is None and subjects:
        # Repli : moyenne simple des moyennes par matière (les coefficients
        # officiels du bac ne sont pas ré-appliqués ici, on fait confiance aux
        # coefficients déjà configurés par l'établissement dans Pronote pour
        # le calcul de la moyenne générale native).
        overall = round(sum(s["student"] for s in subjects) / len(subjects), 2)

    path = write_json(
        f"moyennes-{key}.json",
        {"updatedAt": date.today().isoformat(), "periodName": get_val(period, "name", ""), "overall": overall, "subjects": subjects},
    )
    print(f"Écrit {path} : moyenne générale {overall}, {len(subjects)} matière(s)")


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


# --- Menu de cantine (PDF joint à un évènement d'agenda, lu par l'API Claude) --
#
# Ni le module "Menus" natif de Pronote (client.menus() renvoie 0 jour,
# l'établissement ne l'utilise pas) ni les informations/actualités
# (information_and_surveys()) n'exposent le menu. Il vient en fait de
# l'agenda de la page d'accueil ("PageAccueil", onglet 7 — introuvable dans
# pronotepy, trouvé en inspectant les vraies requêtes réseau du site) :
# dataSec.data.agenda.listeEvenements contient des évènements "Menu du self
# du ... au ...", avec des pièces jointes au format JSON exact attendu par
# la classe Attachment de pronotepy ({"L": nom, "N": id, "G": type}) — donc
# réutilisable telle quelle pour construire l'URL signée et télécharger le
# PDF, sans deviner de format manuellement. Le PDF est une image scannée
# (sans texte, illisible par extraction classique), donc envoyé à l'API
# Claude pour en extraire le contenu structuré.

MENU_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "days": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "Date ISO YYYY-MM-DD"},
                    "entrees": {"type": "array", "items": {"type": "string"}},
                    "plats": {"type": "array", "items": {"type": "string"}},
                    "laitiers": {"type": "array", "items": {"type": "string"}},
                    "desserts": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["date", "entrees", "plats", "laitiers", "desserts"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["days"],
    "additionalProperties": False,
}

MENU_PROMPT = """Ce PDF est le menu de la cantine scolaire pour une semaine (lycée/collège français).
Il liste, pour chaque jour de la semaine (colonnes), les plats servis au déjeuner, groupés par
catégorie (lignes) : Entrées, Plats (parfois séparés en "Plat du jour" + "Légumes du jour"),
Produits laitiers, Desserts.

Extrais le contenu en JSON structuré : un élément de "days" par jour présent sur le document,
avec sa date exacte au format ISO (YYYY-MM-DD ; l'année est {year} sauf indication contraire
explicite sur le document) et la liste des plats de chaque catégorie tels qu'écrits sur le
document (ne traduis pas, ne résume pas, un plat par élément de tableau). Si une catégorie
n'affiche qu'un intitulé générique sans plat précisé (ex. "Plat du jour" seul, sans détail),
laisse le tableau correspondant vide plutôt que d'inventer un plat. N'inclus que les jours qui
ont effectivement une colonne de menu sur le document."""


def parse_menu_pdf(pdf_bytes, filename):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[menu] secret ANTHROPIC_API_KEY absent : section ignorée", file=sys.stderr)
        return None

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    b64 = base64.standard_b64encode(pdf_bytes).decode()
    response = client.messages.create(
        model="claude-opus-5",
        max_tokens=4000,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": b64}},
                    {"type": "text", "text": MENU_PROMPT.format(year=date.today().year)},
                ],
            }
        ],
        output_config={"format": {"type": "json_schema", "schema": MENU_JSON_SCHEMA}},
    )
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def fetch_menu(client):
    try:
        response = client.post("PageAccueil", 7, {})
    except Exception as e:
        print(f"[menu] impossible d'appeler PageAccueil (erreur : {e})", file=sys.stderr)
        return

    events = (response.get("dataSec", {}).get("data", {}).get("agenda", {}) or {}).get("listeEvenements", [])
    menu_events = [e for e in events if "menu" in (e.get("L") or "").lower()]
    if not menu_events:
        print("[menu] aucun évènement d'agenda contenant 'menu' dans le titre", file=sys.stderr)
        return

    by_date = {}
    pdf_count = 0
    for event in menu_events:
        title = event.get("L", "")
        for pj in event.get("PiecesJointes", []) or []:
            name = pj.get("L", "")
            if not name.lower().endswith(".pdf"):
                continue
            pdf_count += 1
            try:
                attachment = pronotepy.dataClasses.Attachment(client, pj)
                parsed = parse_menu_pdf(attachment.data, attachment.name)
                if not parsed:
                    continue
                for day in parsed.get("days", []):
                    d = day.get("date")
                    if not d:
                        continue
                    by_date[d] = {
                        "entrees": day.get("entrees", []),
                        "plats": day.get("plats", []),
                        "laitiers": day.get("laitiers", []),
                        "desserts": day.get("desserts", []),
                    }
            except Exception as e:
                print(f"[menu] pièce jointe de '{title}' ignorée (erreur : {e})", file=sys.stderr)

    if not by_date:
        # Aucun PDF n'a pu être lu (ex. API Claude en panne/sans crédit) :
        # on n'écrase pas un menu.json existant (potentiellement saisi à la
        # main) avec un fichier vide.
        print(f"[menu] aucun des {pdf_count} PDF n'a pu être lu, menu.json non modifié", file=sys.stderr)
        return
    path = write_json("menu.json", {"updatedAt": date.today().isoformat(), "byDate": by_date})
    print(f"Écrit {path} : menu pour {len(by_date)} jour(s), source={pdf_count} PDF(s)")


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
        fetch_menu(login_as_child("loise"))
    except Exception as e:
        print(f"[menu] section entière ignorée (erreur : {e})", file=sys.stderr)

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
            (fetch_moyennes, "moyennes"),
        ):
            try:
                fn(login_as_child(key), key)
            except Exception as e:
                print(f"[{label}] section ignorée pour {key} (erreur : {e})", file=sys.stderr)


if __name__ == "__main__":
    main()
