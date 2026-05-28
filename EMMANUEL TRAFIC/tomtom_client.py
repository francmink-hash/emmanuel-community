import httpx
import os
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("TOMTOM_API_KEY")

BASE_ROUTING = "https://api.tomtom.com/routing/1/calculateRoute"
BASE_TRAFFIC = "https://api.tomtom.com/traffic/services/5/incidentDetails"
BASE_POI = "https://api.tomtom.com/search/2/poiSearch"
BASE_FLOW = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
BASE_GEOCODE = "https://api.tomtom.com/search/2/geocode"

import urllib.parse

async def geocode(query: str) -> dict:
    query_encoded = urllib.parse.quote(query)
    url = f"{BASE_GEOCODE}/{query_encoded}.json"
    params = {"key": API_KEY, "limit": 1}
    async with httpx.AsyncClient() as client:
        r = await client.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
    if not data.get("results"):
        raise ValueError(f"Lieu introuvable : {query}")
    pos = data["results"][0]["position"]
    return {"lat": pos["lat"], "lon": pos["lon"]}

async def get_route(origin: dict, destination: dict) -> dict:
    url = f"{BASE_ROUTING}/{origin['lat']},{origin['lon']}:{destination['lat']},{destination['lon']}/json"
    params = {
        "key": API_KEY,
        "traffic": "true",
        "travelMode": "car",
        "routeType": "fastest",
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()

    route = data["routes"][0]["summary"]
    points_data = data["routes"][0]["legs"][0]["points"]
    points = [{"lat": p["latitude"], "lon": p["longitude"]} for p in points_data]

    return {
        "distance_km": round(route["lengthInMeters"] / 1000, 1),
        "duree_normale_min": round(route["travelTimeInSeconds"] / 60),
        "duree_trafic_min": round(route["trafficDelayInSeconds"] / 60 + route["travelTimeInSeconds"] / 60),
        "delai_trafic_min": round(route["trafficDelayInSeconds"] / 60),
        "points": points,
    }


async def get_incidents(origin: dict, destination: dict) -> list:
    lat_min = min(origin["lat"], destination["lat"]) - 0.02
    lat_max = max(origin["lat"], destination["lat"]) + 0.02
    lon_min = min(origin["lon"], destination["lon"]) - 0.02
    lon_max = max(origin["lon"], destination["lon"]) + 0.02

    bbox = f"{lon_min},{lat_min},{lon_max},{lat_max}"
    params = {
        "key": API_KEY,
        "bbox": bbox,
        "fields": "{incidents{type,geometry{coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}",
        "language": "fr-FR",
        "categoryFilter": "0,1,2,3,4,5,6,7,8,9,10,11",
        "timeValidityFilter": "present",
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(BASE_TRAFFIC, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()

    incidents = []
    for inc in data.get("incidents", []):
        props = inc.get("properties", {})
        mag = props.get("magnitudeOfDelay", 0)
        if mag >= 2:
            desc = props.get("events", [{}])[0].get("description", "Congestion")
            incidents.append({
                "description": desc,
                "de": props.get("from", ""),
                "vers": props.get("to", ""),
                "delai_min": round(props.get("delay", 0) / 60),
                "niveau": "🔴 Très dense" if mag >= 3 else "🟠 Dense",
            })
    return incidents


async def get_poi(lat: float, lon: float, categorie: str, rayon: int = 2000) -> list:
    url = f"{BASE_POI}/{categorie}.json"
    params = {
        "key": API_KEY,
        "lat": lat,
        "lon": lon,
        "radius": rayon,
        "limit": 10,
        "language": "fr-FR",
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()

    results = []
    for item in data.get("results", []):
        poi = item.get("poi", {})
        addr = item.get("address", {})
        pos = item.get("position", {})
        nom = poi.get("name", "")
        adresse = addr.get("freeformAddress", "")
        entry = item.get("entryPoints", [{}])
        lat_poi = entry[0].get("position", pos).get("lat") if entry else pos.get("lat")
        lon_poi = entry[0].get("position", pos).get("lon") if entry else pos.get("lon")
        nom_encode = nom.replace(" ", "+")
        gmaps = f"https://www.google.com/maps/search/{nom_encode}/@{lat_poi},{lon_poi},18z"
        results.append({
            "nom": nom,
            "adresse": adresse,
            "distance_m": round(item.get("dist", 0)),
            "gmaps": gmaps,
            "lat": lat_poi,
            "lon": lon_poi
        })
    return results
