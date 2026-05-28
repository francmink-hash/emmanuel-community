import asyncio, httpx, os, json
from dotenv import load_dotenv
load_dotenv()
API_KEY = os.getenv("TOMTOM_API_KEY")

async def test():
    # Etape 1 : récupérer les POI avec leur id
    url = "https://api.tomtom.com/search/2/poiSearch/pharmacy.json"
    params = {"key": API_KEY, "lat": 4.0511, "lon": 9.7085, "radius": 2000, "limit": 3}
    async with httpx.AsyncClient() as client:
        r = await client.get(url, params=params, timeout=15)
        data = r.json()

    for item in data.get("results", []):
        poi_id = item.get("id", "")
        name = item.get("poi", {}).get("name", "")
        print(f"NOM: {name} | ID: {poi_id}")

        # Etape 2 : appel Place Details avec cet id
        detail_url = f"https://api.tomtom.com/search/2/place.json"
        detail_params = {"key": API_KEY, "entityId": poi_id}
        async with httpx.AsyncClient() as client:
            r2 = await client.get(detail_url, params=detail_params, timeout=15)
            print(f"  Status details: {r2.status_code}")
            if r2.status_code == 200:
                d = r2.json()
                results = d.get("results", [])
                if results:
                    poi_detail = results[0].get("poi", {})
                    print(f"  PHONE: {poi_detail.get('phone', 'N/A')}")
                    print(f"  PHONES: {poi_detail.get('phones', 'N/A')}")
                    print(f"  URL: {poi_detail.get('url', 'N/A')}")
            else:
                print(f"  Erreur: {r2.text[:200]}")
        print("---")

asyncio.run(test())
