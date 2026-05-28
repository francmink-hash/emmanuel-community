"""
Client cartographie gratuit — OpenStreetMap + OSRM + Overpass.
Remplace TomTom (clé API, quotas, coûts).
"""
import math
import os
import urllib.parse
from datetime import datetime

import httpx
from dotenv import load_dotenv

from config import QUARTIERS, CATEGORIES_POI

load_dotenv()

OSRM_BASE = os.getenv("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "EmmanuelTrafic/1.0 (communaute-emmanuelle; usage local)"

_HEADERS = {"User-Agent": USER_AGENT}


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return int(2 * r * math.asin(math.sqrt(a)))


def _estimate_traffic_delay_min(duration_min: int) -> int:
    """Estimation locale (heures de pointe Douala) — OSRM public sans trafic temps réel."""
    hour = datetime.now().hour
    if 7 <= hour <= 9 or 17 <= hour <= 19:
        return max(1, round(duration_min * 0.35))
    if 12 <= hour <= 14:
        return max(0, round(duration_min * 0.12))
    return max(0, round(duration_min * 0.05))


async def geocode(query: str) -> dict:
    q = (query or "").strip()
    if not q:
        raise ValueError("Lieu vide")

    q_lower = q.lower()
    for name, coords in QUARTIERS.items():
        if name.lower() in q_lower or q_lower in name.lower():
            return {"lat": coords["lat"], "lon": coords["lon"], "label": name}

    search = q if "douala" in q_lower or "cameroun" in q_lower else f"{q}, Douala, Cameroun"
    params = {"q": search, "format": "json", "limit": 1, "countrycodes": "cm"}
    url = f"{NOMINATIM_BASE}/search"

    async with httpx.AsyncClient(headers=_HEADERS, timeout=20) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()

    if not data:
        params["countrycodes"] = ""
        async with httpx.AsyncClient(headers=_HEADERS, timeout=20) as client:
            r = await client.get(url, params={"q": search, "format": "json", "limit": 1})
            r.raise_for_status()
            data = r.json()

    if not data:
        raise ValueError(f"Lieu introuvable : {query}")

    item = data[0]
    return {
        "lat": float(item["lat"]),
        "lon": float(item["lon"]),
        "label": item.get("display_name", query),
    }


async def get_route(origin: dict, destination: dict) -> dict:
    coords = f"{origin['lon']},{origin['lat']};{destination['lon']},{destination['lat']}"
    url = f"{OSRM_BASE}/route/v1/driving/{coords}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false"}

    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError("Impossible de calculer l'itinéraire entre ces deux points.")

    route = data["routes"][0]
    distance_m = route.get("distance", 0)
    duration_s = route.get("duration", 0)
    duree_normale = max(1, round(duration_s / 60))
    delai = _estimate_traffic_delay_min(duree_normale)
    duree_trafic = duree_normale + delai

    points = []
    geom = route.get("geometry", {})
    for lon, lat in geom.get("coordinates", []):
        points.append({"lat": lat, "lon": lon})

    if len(points) < 2:
        points = [
            {"lat": origin["lat"], "lon": origin["lon"]},
            {"lat": destination["lat"], "lon": destination["lon"]},
        ]

    return {
        "distance_km": round(distance_m / 1000, 1),
        "duree_normale_min": duree_normale,
        "duree_trafic_min": duree_trafic,
        "delai_trafic_min": delai,
        "points": points,
    }


async def get_incidents(origin: dict, destination: dict) -> list:
    """Chantiers / perturbations OSM dans la zone du trajet."""
    lat_min = min(origin["lat"], destination["lat"]) - 0.03
    lat_max = max(origin["lat"], destination["lat"]) + 0.03
    lon_min = min(origin["lon"], destination["lon"]) - 0.03
    lon_max = max(origin["lon"], destination["lon"]) + 0.03
    bbox = f"{lat_min},{lon_min},{lat_max},{lat_max}"

    query = f"""
    [out:json][timeout:20];
    (
      node["highway"="construction"]({bbox});
      way["highway"="construction"]({bbox});
      node["construction"]({bbox});
    );
    out center 15;
  """

    incidents = []
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r = await client.post(OVERPASS_URL, data={"data": query})
            r.raise_for_status()
            data = r.json()

        for el in data.get("elements", [])[:8]:
            tags = el.get("tags", {})
            lat = el.get("lat") or el.get("center", {}).get("lat")
            lon = el.get("lon") or el.get("center", {}).get("lon")
            desc = tags.get("description") or tags.get("note") or "Travaux ou obstruction signalée"
            road = tags.get("name") or tags.get("highway") or "Voie sur le trajet"
            incidents.append({
                "description": desc[:120],
                "de": road,
                "vers": "Zone du trajet",
                "delai_min": 5,
                "niveau": "🟠 Dense",
            })
    except Exception:
        pass

    return incidents


async def get_poi(lat: float, lon: float, categorie_label: str, rayon: int = 2500) -> list:
    amenity = CATEGORIES_POI.get(categorie_label, categorie_label.lower())
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="{amenity}"](around:{rayon},{lat},{lon});
      way["amenity"="{amenity}"](around:{rayon},{lat},{lon});
      node["shop"="{amenity}"](around:{rayon},{lat},{lon});
    );
    out center 12;
  """

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(OVERPASS_URL, data={"data": query})
        r.raise_for_status()
        data = r.json()

    results = []
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        lat_p = el.get("lat") or el.get("center", {}).get("lat")
        lon_p = el.get("lon") or el.get("center", {}).get("lon")
        if lat_p is None or lon_p is None:
            continue

        nom = (
            tags.get("name")
            or tags.get("brand")
            or tags.get("operator")
            or f"{categorie_label}"
        )
        parts = [
            tags.get("addr:street"),
            tags.get("addr:housenumber"),
            tags.get("addr:city", "Douala"),
        ]
        adresse = ", ".join(p for p in parts if p) or tags.get("addr:full", "Adresse non renseignée")
        dist = _haversine_m(lat, lon, lat_p, lon_p)
        nom_encode = urllib.parse.quote(nom)
        gmaps = f"https://www.google.com/maps/search/?api=1&query={lat_p},{lon_p}"

        results.append({
            "nom": nom,
            "adresse": adresse,
            "distance_m": dist,
            "gmaps": gmaps,
            "lat": lat_p,
            "lon": lon_p,
        })

    results.sort(key=lambda x: x["distance_m"])
    return results[:12]
