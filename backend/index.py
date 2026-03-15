# Vercel Python entry point.
# Vercel's Python runtime requires a module-level `app` WSGI variable.
from api.wsgi import application as app
