from jinja2 import Environment, FileSystemLoader
from config import QUARTIERS, CATEGORIES_POI

env = Environment(loader=FileSystemLoader("templates"))
tmpl = env.get_template("index.html")

q = [str(k) for k in QUARTIERS.keys()]
c = [str(k) for k in CATEGORIES_POI.keys()]

try:
    html = tmpl.render(quartiers=q, categories=c)
    print("RENDU OK — longueur:", len(html))
except Exception as e:
    import traceback
    traceback.print_exc()
