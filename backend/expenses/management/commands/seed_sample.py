"""
Management command: seed_sample

Creates (or resets) the demo account with realistic fake data.

Usage:
    python manage.py seed_sample
"""

import random
from datetime import date, timedelta
from django.contrib.auth.models import Group, User
from django.core.management.base import BaseCommand

from expenses.models import (
    Account, Category, Enrollment, MerchantRule,
    Transaction, UserBudgetConfig,
)


# ---------------------------------------------------------------------------
# Static sample data
# ---------------------------------------------------------------------------

CATEGORIES = [
    ("Groceries",     "#4ade80"),
    ("Dining",        "#fb923c"),
    ("Coffee",        "#a78bfa"),
    ("Transport",     "#38bdf8"),
    ("Entertainment", "#f472b6"),
    ("Shopping",      "#facc15"),
    ("Utilities",     "#94a3b8"),
    ("Health",        "#34d399"),
    ("Travel",        "#f87171"),
    ("Subscriptions", "#818cf8"),
]

# (merchant_name, category_name, amount_range, account_key)
# account_key: "chase_credit" | "chase_checking" | "amex"
MERCHANT_TEMPLATES = [
    # Groceries
    ("Whole Foods Market",    "Groceries",     (45,  180), "amex"),
    ("Trader Joe's",          "Groceries",     (30,  90),  "chase_credit"),
    ("Costco",                "Groceries",     (80,  220), "chase_credit"),
    ("Kroger",                "Groceries",     (25,  70),  "amex"),
    # Dining
    ("Chipotle",              "Dining",        (10,  18),  "chase_credit"),
    ("Sweetgreen",            "Dining",        (12,  20),  "chase_credit"),
    ("Nobu Restaurant",       "Dining",        (85,  220), "amex"),
    ("The Capital Grille",    "Dining",        (70,  180), "amex"),
    ("Olive Garden",          "Dining",        (20,  55),  "chase_credit"),
    ("Panera Bread",          "Dining",        (9,   18),  "chase_credit"),
    # Coffee
    ("Starbucks",             "Coffee",        (5,   12),  "chase_credit"),
    ("Blue Bottle Coffee",    "Coffee",        (5,   14),  "amex"),
    ("Dunkin",                "Coffee",        (3,   8),   "chase_credit"),
    # Transport
    ("Uber",                  "Transport",     (8,   45),  "chase_credit"),
    ("Lyft",                  "Transport",     (8,   40),  "chase_credit"),
    ("Shell",                 "Transport",     (40,  90),  "chase_checking"),
    ("BP Gas Station",        "Transport",     (35,  85),  "chase_checking"),
    ("MTA New York City",     "Transport",     (33,  33),  "chase_checking"),
    # Entertainment
    ("AMC Theaters",          "Entertainment", (14,  28),  "chase_credit"),
    ("Ticketmaster",          "Entertainment", (40,  180), "amex"),
    ("Steam",                 "Entertainment", (5,   60),  "chase_credit"),
    # Shopping
    ("Amazon",                "Shopping",      (12,  150), "chase_credit"),
    ("Target",                "Shopping",      (25,  120), "chase_credit"),
    ("Uniqlo",                "Shopping",      (30,  150), "amex"),
    ("Best Buy",              "Shopping",      (25,  400), "amex"),
    # Utilities
    ("Con Edison",            "Utilities",     (80,  160), "chase_checking"),
    ("Verizon",               "Utilities",     (85,  110), "chase_checking"),
    # Health
    ("CVS Pharmacy",          "Health",        (8,   60),  "chase_credit"),
    ("Equinox",               "Health",        (185, 185), "chase_checking"),
    # Travel
    ("Delta Air Lines",       "Travel",        (180, 650), "amex"),
    ("Airbnb",                "Travel",        (120, 400), "amex"),
    ("Marriott Hotels",       "Travel",        (150, 380), "amex"),
    # Subscriptions
    ("Netflix",               "Subscriptions", (15,  23),  "chase_credit"),
    ("Spotify",               "Subscriptions", (10,  16),  "chase_credit"),
    ("Adobe Creative Cloud",  "Subscriptions", (55,  55),  "chase_credit"),
    ("GitHub",                "Subscriptions", (4,   19),  "chase_credit"),
    ("New York Times",        "Subscriptions", (17,  17),  "chase_credit"),
]

# Subscriptions recur monthly on a fixed day — pick them out
SUBSCRIPTION_MERCHANTS = {
    "Netflix", "Spotify", "Adobe Creative Cloud", "GitHub", "New York Times",
    "Equinox", "Verizon", "Con Edison", "MTA New York City",
}

BUDGET_CONFIG = {
    "salary_annual": 110000,
    "pay_frequency": "biweekly",
    "tax_rate": 28,
    "pre_tax": [
        {"id": "pt1", "name": "401(k)",  "amount": 750},
        {"id": "pt2", "name": "HSA",     "amount": 150},
    ],
    "post_tax": [
        {"id": "po1", "name": "Health Insurance", "amount": 210},
        {"id": "po2", "name": "Dental / Vision",  "amount": 35},
    ],
    "fixed": [
        {"id": "fx1", "name": "Rent",        "amount": 2400},
        {"id": "fx2", "name": "Electricity", "amount": 120},
        {"id": "fx3", "name": "Internet",    "amount": 65},
    ],
    "category_budgets": {},  # filled in below
}

CATEGORY_BUDGETS = {
    "Groceries":     350,
    "Dining":        300,
    "Coffee":        60,
    "Transport":     180,
    "Entertainment": 100,
    "Shopping":      200,
    "Health":        80,
    "Subscriptions": 130,
    "Travel":        400,
}


def _rand_date_in_month(year: int, month: int) -> date:
    """Return a random weekday date within the given month."""
    if month == 12:
        last_day = 31
    else:
        last_day = (date(year, month + 1, 1) - timedelta(days=1)).day
    for _ in range(50):
        d = date(year, month, random.randint(1, last_day))
        if d.weekday() < 6:  # 0-5 = Mon-Sat
            return d
    return date(year, month, 15)


class Command(BaseCommand):
    help = "Seed the 'sample' user with realistic fake transaction data."

    def handle(self, *args, **kwargs):
        random.seed(42)

        # ------------------------------------------------------------------
        # 1. User
        # ------------------------------------------------------------------
        demo_group, _ = Group.objects.get_or_create(name="demo")

        user, created = User.objects.get_or_create(username="sample")
        user.set_password("sample")
        user.save()
        user.groups.set([demo_group])
        action = "Created" if created else "Reset"
        self.stdout.write(f"{action} user 'sample' (demo group)")

        # ------------------------------------------------------------------
        # 2. Wipe existing sample data
        # ------------------------------------------------------------------
        Enrollment.objects.filter(user=user).delete()
        # Transactions cascade-deleted with accounts/enrollments
        MerchantRule.objects.filter(user=user).delete()
        UserBudgetConfig.objects.filter(user=user).delete()

        # ------------------------------------------------------------------
        # 3. Categories (per-user)
        # ------------------------------------------------------------------
        Category.objects.filter(user=user).delete()
        cat_map: dict[str, Category] = {}
        for name, color in CATEGORIES:
            cat = Category.objects.create(user=user, name=name, color=color)
            cat_map[name] = cat

        # ------------------------------------------------------------------
        # 4. Enrollments & Accounts
        # ------------------------------------------------------------------
        chase_enr = Enrollment.objects.create(
            user=user,
            institution_name="Chase",
            access_token="sample_token_chase_abc123",
        )
        amex_enr = Enrollment.objects.create(
            user=user,
            institution_name="American Express",
            access_token="sample_token_amex_def456",
        )

        chase_credit = Account.objects.create(
            enrollment=chase_enr,
            teller_id="sample_acc_chase_credit",
            name="Sapphire Preferred",
            last_four="4521",
            account_type="credit",
            balance_ledger="1842.57",
            balance_available="8157.43",
            tracked=True,
        )
        chase_checking = Account.objects.create(
            enrollment=chase_enr,
            teller_id="sample_acc_chase_checking",
            name="Total Checking",
            last_four="8832",
            account_type="depository",
            balance_ledger="4311.20",
            balance_available="4311.20",
            tracked=True,
        )
        amex_acc = Account.objects.create(
            enrollment=amex_enr,
            teller_id="sample_acc_amex_gold",
            name="Gold Card",
            last_four="3311",
            account_type="credit",
            balance_ledger="3204.88",
            balance_available="16795.12",
            tracked=True,
        )

        account_key_map = {
            "chase_credit":   chase_credit,
            "chase_checking": chase_checking,
            "amex":           amex_acc,
        }

        # ------------------------------------------------------------------
        # 5. Transactions — 6 months back from a fixed "today"
        # ------------------------------------------------------------------
        anchor = date(2026, 3, 15)  # today in sample-world
        months: list[tuple[int, int]] = []
        for i in range(6):
            m = anchor.month - i
            y = anchor.year
            while m <= 0:
                m += 12
                y -= 1
            months.append((y, m))

        # How many random (non-subscription) transactions per month
        TXN_PER_MONTH = 18

        transactions_to_create: list[Transaction] = []
        txn_counter = 0

        # Fixed-day subscriptions — we track which sub fired per month
        sub_templates = [t for t in MERCHANT_TEMPLATES if t[0] in SUBSCRIPTION_MERCHANTS]
        non_sub_templates = [t for t in MERCHANT_TEMPLATES if t[0] not in SUBSCRIPTION_MERCHANTS]

        for month_idx, (year, month) in enumerate(months):
            # --- subscriptions (once per month, fixed-ish day) ---
            for merchant, cat_name, (lo, hi), acc_key in sub_templates:
                # Fixed amount for recurring bills
                if lo == hi:
                    amount = lo
                else:
                    amount = round(random.uniform(lo, hi), 2)
                day = min(random.randint(1, 5), 28)
                txn_date = date(year, month, day)
                if txn_date > anchor:
                    continue
                txn_counter += 1
                # Subscriptions are confirmed except the most recent month
                status = Transaction.TRACKED if month_idx > 0 else Transaction.UNREVIEWED
                transactions_to_create.append(Transaction(
                    account=account_key_map[acc_key],
                    teller_id=f"sample_txn_{txn_counter:04d}",
                    date=txn_date,
                    amount=amount,
                    merchant=merchant,
                    description=merchant,
                    category=cat_map[cat_name],
                    status=status,
                ))

            # --- random transactions ---
            picks = random.sample(non_sub_templates, min(TXN_PER_MONTH, len(non_sub_templates)))
            # Some months have extras (dining out more, big shopping, etc.)
            extras = random.sample(non_sub_templates, random.randint(3, 7))
            picks += extras

            for merchant, cat_name, (lo, hi), acc_key in picks:
                amount = round(random.uniform(lo, hi), 2)
                txn_date = _rand_date_in_month(year, month)
                if txn_date > anchor:
                    continue
                txn_counter += 1
                # Older months are fully confirmed; current month has a mix
                if month_idx == 0:
                    status = Transaction.UNREVIEWED if random.random() < 0.45 else Transaction.TRACKED
                else:
                    status = Transaction.TRACKED
                transactions_to_create.append(Transaction(
                    account=account_key_map[acc_key],
                    teller_id=f"sample_txn_{txn_counter:04d}",
                    date=txn_date,
                    amount=amount,
                    merchant=merchant,
                    description=merchant,
                    category=cat_map[cat_name],
                    status=status,
                ))

        # Add a handful of declined/payment transactions (hidden from spending)
        for i, merchant in enumerate(["Chase Autopay", "Amex Payment", "Zelle Transfer"]):
            txn_counter += 1
            transactions_to_create.append(Transaction(
                account=chase_checking,
                teller_id=f"sample_txn_{txn_counter:04d}",
                date=date(2026, 3, 1),
                amount=round(random.uniform(500, 3000), 2),
                merchant=merchant,
                description=merchant,
                category=None,
                status=Transaction.EXCLUDED,
            ))

        Transaction.objects.bulk_create(transactions_to_create)
        self.stdout.write(f"Created {len(transactions_to_create)} transactions")

        # ------------------------------------------------------------------
        # 6. Merchant rules — so the review page auto-fills categories
        # ------------------------------------------------------------------
        rules = []
        for merchant, cat_name, _, _ in MERCHANT_TEMPLATES:
            rules.append(MerchantRule(
                user=user,
                merchant_key=merchant.lower(),
                category=cat_map[cat_name],
            ))
        MerchantRule.objects.bulk_create(rules, ignore_conflicts=True)
        self.stdout.write(f"Created {len(rules)} merchant rules")

        # ------------------------------------------------------------------
        # 7. Budget config
        # ------------------------------------------------------------------
        cfg = dict(BUDGET_CONFIG)
        cfg["category_budgets"] = {
            str(cat_map[name].id): amount
            for name, amount in CATEGORY_BUDGETS.items()
            if name in cat_map
        }
        UserBudgetConfig.objects.create(user=user, config=cfg)
        self.stdout.write("Created budget config")

        self.stdout.write(self.style.SUCCESS(
            "\nSample account ready — login with username: sample / password: sample"
        ))
