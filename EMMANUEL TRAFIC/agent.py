from config import CATEGORIES_POI
from osm_client import geocode, get_incidents, get_poi, get_route


async def consulter_trafic(depart: str, arrivee: str) -> dict:
    origin = await geocode(depart)
    destination = await geocode(arrivee)

    route = await get_route(origin, destination)
    incidents = await get_incidents(origin, destination)

    ratio = route["duree_trafic_min"] / max(route["duree_normale_min"], 1)
    if ratio >= 2:
        niveau_global = "🔴 Dense"
    elif ratio >= 1.3:
        niveau_global = "🟠 Modéré"
    else:
        niveau_global = "🟢 Fluide"

    return {
        "depart": depart,
        "arrivee": arrivee,
        "distance_km": route["distance_km"],
        "duree_normale_min": route["duree_normale_min"],
        "duree_trafic_min": route["duree_trafic_min"],
        "delai_min": route["delai_trafic_min"],
        "niveau_global": niveau_global,
        "incidents": incidents,
        "points": route["points"],
    }


async def rechercher_lieux(quartier: str, categorie_label: str) -> dict:
    coords = await geocode(quartier)
    if categorie_label not in CATEGORIES_POI:
        raise ValueError(f"Catégorie inconnue : {categorie_label}")
    lieux = await get_poi(coords["lat"], coords["lon"], categorie_label)
    return {
        "quartier": quartier,
        "categorie": categorie_label,
        "lieux": lieux,
    }
