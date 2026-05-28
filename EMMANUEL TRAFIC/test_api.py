import asyncio
import traceback
import httpx
import os
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("TOMTOM_API_KEY")
print(f"Cle API chargee : {API_KEY[:8]}...")

async def test():
    # Test 1 : Route
    print("\n=== TEST ROUTE ===")
    try:
        url = f"https://api.tomtom.com/routing/1/calculateRoute/4.0511,9.7085:4.0600,9.7300/json"
        async with httpx.AsyncClient() as client:
            r = await client.get(url, params={"key": API_KEY, "traffic": "true", "travelMode": "car"}, timeout=15)
            print(f"Status: {r.status_code}")
            data = r.json()
            if r.status_code == 200:
                s = data["routes"][0]["summary"]
                print(f"Distance: {s['lengthInMeters']}m, Duree: {s['travelTimeInSeconds']}s")
            else:
                print(f"Erreur: {data}")
    except Exception as e:
        traceback.print_exc()

    # Test 2 : Traffic Incidents
    print("\n=== TEST INCIDENTS ===")
    try:
        url = "https://api.tomtom.com/traffic/services/5/incidentDetails"
        params = {
            "key": API_KEY,
            "bbox": "9.69,4.03,9.75,4.09",
            "fields": "{incidents{type,properties{iconCategory,magnitudeOfDelay,from,to,delay}}}",
            "language": "fr-FR",
            "timeValidityFilter": "present",
        }
        async with httpx.AsyncClient() as client:
            r = await client.get(url, params=params, timeout=15)
            print(f"Status: {r.status_code}")
            data = r.json()
            if r.status_code == 200:
                print(f"Incidents trouves: {len(data.get('incidents', []))}")
            else:
                print(f"Erreur: {data}")
    except Exception as e:
        traceback.print_exc()

    # Test 3 : POI
    print("\n=== TEST POI ===")
    try:
        url = "https://api.tomtom.com/search/2/poiSearch/pharmacy.json"
        params = {"key": API_KEY, "lat": 4.0511, "lon": 9.7085, "radius": 2000, "limit": 5}
        async with httpx.AsyncClient() as client:
            r = await client.get(url, params=params, timeout=15)
            print(f"Status: {r.status_code}")
            data = r.json()
            if r.status_code == 200:
                print(f"POI trouves: {len(data.get('results', []))}")
                for p in data.get("results", [])[:2]:
                    print(f"  - {p['poi']['name']} | {p['address'].get('freeformAddress','')}")
            else:
                print(f"Erreur: {data}")
    except Exception as e:
        traceback.print_exc()

asyncio.run(test())
