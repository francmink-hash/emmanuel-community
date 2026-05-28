import asyncio, httpx, os, json
from dotenv import load_dotenv
load_dotenv()
API_KEY = os.getenv("TOMTOM_API_KEY")

async def test():
    url = "https://api.tomtom.com/search/2/poiSearch/pharmacy.json"
    params = {"key": API_KEY, "lat": 4.0511, "lon": 9.7085, "radius": 2000, "limit": 3}
    async with httpx.AsyncClient() as client:
        r = await client.get(url, params=params, timeout=15)
        data = r.json()
    for item in data.get("results", []):
        name = item.get("poi", {}).get("name", "")
        pos = item.get("position", {})
        addr = item.get("address", {})
        print(f"NOM: {name}")
        print(f"POSITION: {pos}")
        print(f"ADRESSE: {addr.get('freeformAddress')}")
        print(f"ENTRY POINTS: {item.get('entryPoints')}")
        print("---")

asyncio.run(test())
