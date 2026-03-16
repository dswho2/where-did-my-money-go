# Where's My Money

A personal finance app that connects to your bank accounts via Teller, automatically pulls in transactions, and helps you review, categorize, analyze, and budget your spending.

## Architecture

| Layer | Stack |
|---|---|
| Frontend | Vite + React 19 + TypeScript + Tailwind CSS 4 — deployed on Vercel |
| Backend | Django 6 + Django REST Framework (Python serverless) — deployed on Vercel |
| Database | Neon Postgres (Vercel native integration) |
| Bank connectivity | Teller API + Teller Connect JS SDK |
| Charts | Recharts |
| Auth | Django token auth, single superuser account |

## Features

### Dashboard (Home)

The home page gives a monthly spending snapshot:

- **Monthly total** with % change vs. your 6-month average
- **Top spending categories** ranked by amount with visual progress bars
- **Review queue counter** — how many unreviewed transactions need attention
- **Account balances** for all connected accounts
- **Days remaining** in the current month
- Month navigation (prev/next arrows and a month picker)

### Review Page

A card stack for processing new transactions one at a time:

- Cards are displayed with a stacked depth/rotation effect
- Each card shows: date, merchant name, amount, and which account it came from
- Assign a category inline via a dropdown (or create a new one on the fly)
- Add a note/description to any transaction
- Track (right) or Exclude (left) with swipe animations
- When you categorize a merchant, the same category is automatically propagated to other unreviewed transactions from that merchant in the queue
- Queue count shown so you know how many are left

### Transactions Page

A full searchable, filterable list of all transactions:

- Filters: month, status (unreviewed / tracked / excluded), category, account, and free-text search
- Full-text search uses PostgreSQL trigram similarity to match merchant names and descriptions
- Inline editing — click to change category or description without leaving the list
- Pagination (50 per page by default, configurable up to 500)
- Shows amount in green for credits, normal for debits
- Shows account name and last 4 digits for each transaction

### Accounts Page

Manage your bank connections:

- Lists all connected enrollments (one per bank login)
- Per account: name, type (credit/depository), last 4 digits, ledger balance, available balance
- Toggle tracking per account — untracked accounts won't have transactions imported
- Connect bank button launches the Teller Connect SDK in the browser to authorize a new institution
- On connection, choose how far back to import transactions (30–365 days lookback)
- Sync button to manually pull the latest transactions
- Disconnect to remove an enrollment and all its data

### Spending Page

Visual spending analysis with charts:

- **Stacked bar chart** showing monthly spending broken down by category (using Recharts)
- **View modes:** Stacked (by category) or Total (combined bar)
- **Time presets:** 3M, 6M, YTD, 1Y, All, or a custom date range
- **Filters:** category pills and account pills to drill down
- **Monthly average** reference line with hover tooltip
- **Click any bar** to open a drilldown showing the individual transactions for that month
- Grand total and monthly average shown below the chart

### Budget Page

Full budget planning and tracking:

- **Income setup:** annual salary, pay frequency (weekly, biweekly, semi-monthly, monthly), and estimated tax rate
- **Pre-tax deductions** (401k, HSA, etc.) entered per paycheck
- **Post-tax deductions** (health insurance, etc.) entered per paycheck
- **Fixed monthly expenses** (rent, subscriptions, car payment, etc.)
- **Category budgets** — set a monthly spending target per category
- **Budget equation:** Take-home Pay − Fixed Expenses − Variable Budgets = Remaining
- **Actual vs. budgeted** — shows real spending from the current month alongside your targets
- Month navigation to view and compare historical months
- All budget settings are auto-saved to the backend with an 800ms debounce

### Categories Page

Manage your expense categories:

- Create, rename, and delete categories
- Assign a color to each category (shown as colored pills throughout the app)
- View usage count per category
- Delete prompts for confirmation

## How Transaction Import Works

1. User connects a bank via Teller Connect (browser OAuth flow)
2. Backend stores the access token and fetches accounts via Teller's API (mutual TLS)
3. Transactions are pulled for the chosen lookback period and saved to the database
4. Each new transaction goes through the auto-categorizer:
   - Payment/transfer detection → automatically excluded (filtered out)
   - User's merchant rules (built up over time as you review) → applied immediately
   - Built-in keyword rules → applied as a fallback
5. Unmatched transactions land in the review queue
6. As you review and track transactions, merchant rules are created so future transactions from the same merchant are auto-categorized
7. Tracking a merchant also retroactively updates other unreviewed transactions from that same merchant in the queue

## Auto-Sync (Cron Job)

A Vercel cron job runs daily at 7:00 AM UTC and syncs transactions for all users. Each enrollment's accounts are fetched in parallel. New transactions since the last sync (or 90 days back if no prior sync) are imported and auto-categorized.

Manual sync is also available via the Sync button on the Accounts page.

## Demo Account

A read-only demo account is included for showing the app to others without exposing real data.

**Credentials:** `username: sample` / `password: sample`

The demo account has 6 months of realistic fake transactions across two banks (Chase and American Express), pre-built categories, merchant rules, and a budget config. Connect bank, Sync, and Disconnect are visible but disabled.

To create or reset the demo account:

```bash
cd backend
python manage.py migrate
python manage.py seed_sample
```

The seed command is idempotent — running it again wipes and recreates all sample data for the account.

### Account tiers

User accounts have a `account_tier` field returned by `GET /api/auth/me/`. The demo account is assigned to the `demo` Django group on creation, which sets its tier to `"demo"`. All other users get `"standard"`. The frontend uses this to gate write actions on the Accounts page.

To assign the demo tier to any user via the Django admin, add them to the `demo` group.

## Data Model

- **Enrollment** — one per bank login; stores Teller access token and institution name
- **Account** — each credit card or bank account; linked to an enrollment; has a `tracked` flag
- **Transaction** — imported from Teller; stores date, amount, merchant, description, category, and a `status` field (`unreviewed` / `tracked` / `excluded`)
- **Category** — per-user categories with a name and color; a default set is seeded on registration
- **MerchantRule** — per-user mapping of merchant key → category, built up during review
- **UserBudgetConfig** — stores the full budget configuration as a JSON blob

## Project Structure

```
where-did-my-money-go/
├── frontend/
│   └── src/
│       ├── pages/           # HomePage, ReviewPage, TransactionsPage, AccountsPage,
│       │                    # SpendingPage, BudgetPage, CategoriesPage, LoginPage
│       ├── components/      # Layout, CategoryInput, CategoryPill
│       └── lib/             # api.ts (fetch client), types.ts
└── backend/
    ├── api/                 # Django project: settings, urls, auth, wsgi/asgi
    └── expenses/            # Main app: models, views, serializers, urls,
                             # teller.py (API client), categorizer.py (auto-categorization)
```

## Local Development

### Prerequisites

- Node.js (for frontend)
- Python 3.12+ (for backend)
- A Teller developer account with a certificate (for bank connectivity)
- A Postgres database (Neon works; you can also run one locally)

### Frontend

```bash
cd frontend
cp .env.example .env   # set VITE_API_URL and VITE_TELLER_APP_ID
npm install
npm run dev
```

Runs on http://localhost:5173

### Backend

```bash
cd backend
cp .env.example .env   # fill in your values (see below)
python -m venv .venv
.venv/Scripts/activate  # Windows
# source .venv/bin/activate  # Mac/Linux
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Runs on http://localhost:8000. Admin panel at http://localhost:8000/admin.

## Environment Variables

### Backend

```
SECRET_KEY=          # Django secret key
DEBUG=               # True for local dev
ALLOWED_HOSTS=       # Comma-separated: localhost,127.0.0.1,your-domain.vercel.app
DATABASE_URL=        # postgresql://user:pass@host:port/db?sslmode=require
FRONTEND_ORIGINS=    # Comma-separated allowed CORS origins
CRON_SECRET=         # Random secret for the cron sync endpoint (openssl rand -hex 32)

# Teller mutual TLS cert — either file paths (local dev) or inline PEM (Vercel)
TELLER_CERT_PATH=         # /path/to/certificate.pem
TELLER_PRIVATE_KEY_PATH=  # /path/to/private_key.pem
# OR (for Vercel where you can't use file paths):
TELLER_CERT=              # -----BEGIN CERTIFICATE-----...
TELLER_PRIVATE_KEY=       # -----BEGIN PRIVATE KEY-----...
```

### Frontend

```
VITE_API_URL=        # Backend URL, e.g. http://localhost:8000 or https://api.your-domain.vercel.app
VITE_TELLER_APP_ID=  # Your Teller application ID
```

See [backend/.env.example](backend/.env.example) and [frontend/.env.example](frontend/.env.example) for reference.

## API Overview

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login/` | Get auth token |
| POST | `/api/auth/register/` | Create user |
| GET | `/api/auth/me/` | Check auth status |
| GET | `/api/enrollments/` | List bank connections |
| POST | `/api/enrollments/` | Connect a bank |
| DELETE | `/api/enrollments/{id}/` | Disconnect a bank |
| GET/PATCH | `/api/accounts/{id}/` | View/update account (tracked status) |
| GET | `/api/transactions/` | List transactions (paginated, filterable) |
| PATCH | `/api/transactions/{id}/` | Update transaction (category, description, status) |
| GET | `/api/categories/` | List categories |
| POST | `/api/categories/` | Create category |
| PATCH/DELETE | `/api/categories/{id}/` | Update or delete category |
| POST | `/api/sync/` | Manual sync (all enrollments) |
| GET | `/api/cron/sync/` | Cron sync — requires `Authorization: Bearer {CRON_SECRET}` |
| GET | `/api/spending/` | Spending analytics (grouped by month + category) |
| GET | `/api/dashboard/` | Dashboard data |
| GET/PUT | `/api/budget-config/` | Get/save budget config |
