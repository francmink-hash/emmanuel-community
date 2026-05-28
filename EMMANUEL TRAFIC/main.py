from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel

from agent import consulter_trafic, rechercher_lieux

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES = BASE_DIR / "templates"

app = FastAPI(title="Emmanuel Trafic")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TrafficRequest(BaseModel):
    depart: str
    arrivee: str


class POIRequest(BaseModel):
    quartier: str
    categorie: str


def _read_html(name: str) -> str:
    return (TEMPLATES / name).read_text(encoding="utf-8")


@app.get("/health")
async def health():
    return {"ok": True, "provider": "OpenStreetMap + OSRM"}


@app.get("/login", response_class=HTMLResponse)
@app.get("/login.html", response_class=HTMLResponse)
async def login_page():
    return HTMLResponse(_read_html("login.html"))


@app.get("/auth.js")
async def auth_js():
    return FileResponse(TEMPLATES / "auth.js", media_type="application/javascript")


@app.get("/", response_class=HTMLResponse)
async def index():
    return HTMLResponse(_read_html("index.html"))


@app.post("/trafic")
async def trafic(req: TrafficRequest):
    try:
        result = await consulter_trafic(req.depart.strip(), req.arrivee.strip())
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/lieux")
async def lieux(req: POIRequest):
    try:
        result = await rechercher_lieux(req.quartier.strip(), req.categorie)
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}
