"""Auto-categorizer for new transactions.

Lookup priority:
1. Credit-card / bill-payment patterns → auto-decline
2. User's MerchantRule table (indexed, O(1) per lookup)
3. Built-in keyword rules (short Python list, no DB hit)
4. No match → leave blank for manual input

Merchant keys are normalized so "STARBUCKS #1234" and "Starbucks #5678"
both map to the same rule "starbucks".
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Category, Transaction


# ---------------------------------------------------------------------------
# Merchant key normalization
# ---------------------------------------------------------------------------

def normalize_merchant(raw: str) -> str:
    """
    Produce a stable, deduplicated key from a raw merchant string.

    Examples:
        "STARBUCKS #1234"   → "starbucks"
        "SMART TEA"         → "smart tea"
        "DOORDASH*ORDER42"  → "doordash"
        "UBER* TRIP"        → "uber"
        "Amazon.com*AB1C2D" → "amazon.com"
    """
    s = raw.strip().lower()
    # Strip everything after a * (order IDs, trip codes, etc.)
    s = s.split('*')[0].strip()
    # Strip trailing store/location numbers: " #1234", " - 42", " 1234"
    s = re.sub(r'[\s#\-]+\d+\s*$', '', s)
    # Collapse whitespace
    s = re.sub(r'\s+', ' ', s).strip()
    return s


# ---------------------------------------------------------------------------
# Credit-card payment / internal-transfer detection — auto-decline these
# ---------------------------------------------------------------------------

PAYMENT_PATTERNS = [
    'payment thank you',
    'autopay',
    'credit card payment',
    'online payment',
    'automatic payment',
    'automatic pymt',
    'bill payment',
    'balance transfer',
    'minimum payment',
    'mobile payment',
    'web payment',
    'thank you payment',
    'internet payment',
    'electronic payment',
    'transfer to',
    'transfer from',
    'direct deposit',
    'payroll',
]


def is_payment(merchant: str) -> bool:
    m = merchant.lower()
    return any(p in m for p in PAYMENT_PATTERNS)


# ---------------------------------------------------------------------------
# Built-in keyword rules  (first match wins; keywords are OR-matched against
# the normalized merchant key)
# ---------------------------------------------------------------------------

BUILTIN_RULES: list[tuple[list[str], str]] = [
    (['starbucks', "peet's coffee", 'blue bottle', 'verve coffee', 'dutch bros', 'philz', 'coffee bean', 'intelligentsia', 'la colombe'], 'Coffee'),
    (['uber eats', 'doordash', 'grubhub', 'postmates', 'caviar', 'seamless', 'instacart'], 'Food Delivery'),
    (['uber', 'lyft', 'waymo'], 'Transportation'),
    (['netflix', 'hulu', 'spotify', 'apple.com/bill', 'disney+', 'hbo max', 'paramount+', 'peacock', 'youtube premium', 'apple one', 'amazon prime'], 'Subscriptions'),
    (['amazon', 'amzn mktp'], 'Shopping'),
    (['whole foods', 'trader joe', 'safeway', 'kroger', 'vons', 'albertsons', 'ralphs', 'publix', 'wegmans', 'sprouts', 'aldi', 'costco', "sam's club"], 'Groceries'),
    (['shell', 'chevron', 'exxon', 'bp ', 'sunoco', 'marathon', 'arco', 'valero', 'circle k', '76 '], 'Gas'),
    (['cvs', 'walgreens', 'rite aid', 'duane reade'], 'Pharmacy'),
    (['planet fitness', 'la fitness', 'equinox', 'anytime fitness', "gold's gym", 'ymca', 'crossfit'], 'Gym'),
    (['airbnb', 'vrbo', 'booking.com', 'hotels.com', 'marriott', 'hilton', 'hyatt', 'sheraton', 'westin'], 'Hotels'),
    (['delta', 'united airlines', 'american airlines', 'southwest', 'jetblue', 'alaska air', 'spirit airlines'], 'Flights'),
    (['mcdonald', 'chick-fil-a', 'chipotle', 'subway', 'wendy', 'taco bell', 'burger king', 'in-n-out', 'five guys', 'shake shack', 'raising cane', 'popeyes', 'panda express', 'wingstop'], 'Fast Food'),
]


def _builtin_category(merchant_key: str) -> str | None:
    """Check built-in rules against an already-normalized merchant key."""
    for keywords, cat_name in BUILTIN_RULES:
        if any(kw in merchant_key for kw in keywords):
            return cat_name
    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def auto_categorize(transaction: Transaction) -> tuple['Category | None', bool]:
    """
    Decide the category (or None) and whether to auto-decline.
    Returns (category, should_decline).
    Does NOT save — caller is responsible.
    """
    from .models import Category, MerchantRule

    merchant = (transaction.merchant or '').strip()

    # 1. Credit-card / bill payment → auto-decline
    if is_payment(merchant):
        return None, True

    if not merchant:
        return None, False

    key = normalize_merchant(merchant)
    user = transaction.account.enrollment.user

    # 2. User merchant rule table — single indexed lookup
    try:
        rule = MerchantRule.objects.select_related('category').get(
            user=user, merchant_key=key
        )
        if rule.category:
            return rule.category, False
    except MerchantRule.DoesNotExist:
        pass

    # 3. Built-in keyword rules (pure Python, no DB)
    cat_name = _builtin_category(key)
    if cat_name:
        category, _ = Category.objects.get_or_create(name=cat_name)
        return category, False

    return None, False
