# Where Did My Money Go

Personal expense tracker that connects to your credit cards via Teller, automatically pulls in transactions, and lets you review, categorize, and confirm each one.

## Architecture

| Layer | Stack |
|---|---|
| Frontend | Vite + React + TypeScript + Tailwind CSS — deployed on Vercel |
| Backend | Django + Django REST Framework (Python serverless) — deployed on Vercel |
| Database | Neon Postgres (Vercel native integration) |
| Bank connectivity | Teller API + Teller Connect JS SDK |
| Auth | Django built-in auth, single superuser account |

## Data Model

- **Enrollment** — one per bank login, stores Teller access token
- **Account** — each credit card / bank account linked to an enrollment
- **Transaction** — pulled from Teller; fields for date, amount, merchant, category, description, confirmed status
- **Category** — custom categories you define

## Project Structure

```
where-did-my-money-go/
├── frontend/          # Vite + React + TypeScript + Tailwind
└── backend/           # Django + DRF
    ├── api/           # Django project (settings, urls, wsgi)
    └── expenses/      # Main app (models, views, serializers)
```

## Local Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:5173

### Backend

```bash
cd backend
cp .env.example .env   # fill in your values
.venv/Scripts/activate  # Windows; use source .venv/bin/activate on Mac/Linux
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Runs on http://localhost:8000

Admin panel: http://localhost:8000/admin

## Environment Variables

See [backend/.env.example](backend/.env.example) for required backend env vars (DB connection, secret key, Teller cert paths).
