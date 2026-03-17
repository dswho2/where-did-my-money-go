from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-change-me-in-production')

DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# parsing for env var
ALLOWED_HOSTS = [
    h.strip() for h in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') 
    if h.strip()
]
# support Vercel deployments and preview URLs
ALLOWED_HOSTS.append('.vercel.app')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'django.contrib.postgres',
    'expenses',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# CORS — allow the Vite dev server; add your production frontend URL here too
_frontend_origins = os.environ.get('FRONTEND_ORIGINS', 'http://localhost:5173').split(',')
CORS_ALLOWED_ORIGINS = [o.strip() for o in _frontend_origins]
# Also allow Vercel preview/branch deployments which have dynamic URLs
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https://where-did-my-money-go[a-z0-9\-]*\.vercel\.app$',
]
CORS_ALLOW_CREDENTIALS = True

# CSRF
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS
# Cross-origin deployments (frontend/backend on different domains) require
# SameSite=None + Secure so the browser sends cookies on cross-origin requests.
# In local dev (DEBUG=True) keep Lax so HTTP works without HTTPS.
_cross_origin = not DEBUG
SESSION_COOKIE_SAMESITE = 'None' if _cross_origin else 'Lax'
SESSION_COOKIE_SECURE = _cross_origin
CSRF_COOKIE_SAMESITE = 'None' if _cross_origin else 'Lax'
CSRF_COOKIE_SECURE = _cross_origin

ROOT_URLCONF = 'api.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'api.wsgi.application'

_db_url = os.environ.get('DATABASE_URL', '')
if not _db_url:
    raise RuntimeError('DATABASE_URL is not set. Add it to your .env file.')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'OPTIONS': {
            'service': None,
        },
    }
}

# Parse the connection string manually so we don't need dj-database-url
import urllib.parse as _urlparse
_u = _urlparse.urlparse(_db_url)
DATABASES['default'].update({
    'NAME': _u.path.lstrip('/'),
    'USER': _u.username,
    'PASSWORD': _u.password,
    'HOST': _u.hostname,
    'PORT': _u.port or 5432,
    'OPTIONS': {'sslmode': _urlparse.parse_qs(_u.query).get('sslmode', ['require'])[0]},
})

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'expenses.authentication.DeviceTokenAuthentication',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'EXCEPTION_HANDLER': 'expenses.views.drf_exception_handler',
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Teller API — Option A: file paths (local dev)
TELLER_CERT_PATH = os.environ.get('TELLER_CERT_PATH', '')
TELLER_PRIVATE_KEY_PATH = os.environ.get('TELLER_PRIVATE_KEY_PATH', '')
# Teller API — Option B: inline PEM content (Vercel / production), takes priority
TELLER_CERT = os.environ.get('TELLER_CERT', '')
TELLER_PRIVATE_KEY = os.environ.get('TELLER_PRIVATE_KEY', '')
