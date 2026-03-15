from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from django.db.models import Max
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import Account, Category, Enrollment, Transaction
from .serializers import AccountSerializer, CategorySerializer, EnrollmentSerializer, TransactionSerializer
from . import teller, categorizer


def _apply_auto_categorize(transaction):
    """Run auto-categorizer on a freshly-created transaction and save changes."""
    try:
        category, should_decline = categorizer.auto_categorize(transaction)
        if should_decline:
            transaction.declined = True
            transaction.save(update_fields=['declined'])
        elif category is not None:
            transaction.category = category
            transaction.save(update_fields=['category'])
    except Exception:
        pass  # never block a sync because the categorizer failed

# ---------------------------------------------------------------------------
# Exception handler — always return JSON, never Django's HTML debug page
# ---------------------------------------------------------------------------

def drf_exception_handler(exc, context):
    from rest_framework.views import exception_handler
    import traceback
    response = exception_handler(exc, context)
    if response is None:
        # Unhandled exception — return JSON 500 instead of letting Django render HTML
        traceback.print_exc()
        response = Response({'error': str(exc)}, status=500)
    return response


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def auth_register(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    if not username or not password:
        return Response({'error': 'Username and password required.'}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username already taken.'}, status=400)
    User.objects.create_user(username=username, password=password)
    return Response({'username': username}, status=201)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def auth_login(request):
    username = request.data.get('username', '')
    password = request.data.get('password', '')
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'error': 'Invalid credentials.'}, status=401)
    login(request, user)
    return Response({'username': user.username})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def auth_logout(request):
    logout(request)
    return Response(status=204)


@ensure_csrf_cookie
@api_view(['GET'])
@permission_classes([AllowAny])
def auth_me(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated.'}, status=401)
    return Response({'username': request.user.username})


# ---------------------------------------------------------------------------
# Enrollments (bank connections)
# ---------------------------------------------------------------------------

def _sync_enrollment_accounts(enrollment):
    """Fetch accounts + balances from Teller and upsert into DB. Returns list of Account objects."""
    remote_accounts = teller.get_accounts(enrollment.access_token)
    accounts = []
    for remote in remote_accounts:
        account, _ = Account.objects.update_or_create(
            teller_id=remote['id'],
            defaults={
                'enrollment': enrollment,
                'name': remote.get('name', ''),
                'last_four': remote.get('last_four', ''),
                'account_type': remote.get('type', ''),
            },
        )
        try:
            bal = teller.get_balance(enrollment.access_token, remote['id'])
            account.balance_ledger = bal.get('ledger')
            account.balance_available = bal.get('available')
            account.save(update_fields=['balance_ledger', 'balance_available'])
        except Exception:
            pass
        accounts.append(account)
    return accounts


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def enrollment_list_create(request):
    if request.method == 'GET':
        enrollments = (
            Enrollment.objects
            .filter(user=request.user)
            .prefetch_related('accounts')
            .order_by('-created_at')
        )
        return Response(EnrollmentSerializer(enrollments, many=True).data)

    # POST — receive access token from Teller Connect
    access_token = request.data.get('access_token', '').strip()
    institution_name = request.data.get('institution_name', 'Unknown Bank').strip()
    days_back = max(1, min(int(request.data.get('days_back', 90)), 730))

    if not access_token:
        return Response({'error': 'access_token is required.'}, status=400)

    enrollment, created = Enrollment.objects.get_or_create(
        access_token=access_token,
        defaults={'user': request.user, 'institution_name': institution_name},
    )

    try:
        accounts = _sync_enrollment_accounts(enrollment)
    except Exception as e:
        if created:
            enrollment.delete()
        return Response({'error': f'Could not fetch accounts from Teller: {e}'}, status=502)

    # Sync initial transactions with date cutoff
    since = date.today() - timedelta(days=days_back)
    synced = 0
    for account in accounts:
        if not account.tracked:
            continue
        try:
            txns = teller.get_transactions_since(enrollment.access_token, account.teller_id, since)
        except Exception:
            continue
        for t in txns:
            txn, created_txn = Transaction.objects.get_or_create(
                teller_id=t['id'],
                defaults={
                    'account': account,
                    'date': t['date'],
                    'amount': t['amount'],
                    'merchant': ((t.get('details') or {}).get('counterparty') or {}).get('name', '') or t.get('description', ''),
                    'description': '',
                    'confirmed': False,
                },
            )
            if created_txn:
                _apply_auto_categorize(txn)
                synced += 1

    enrollment.refresh_from_db()
    return Response(
        {**EnrollmentSerializer(enrollment).data, 'synced': synced},
        status=201 if created else 200,
    )


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def enrollment_delete(request, pk):
    try:
        enrollment = Enrollment.objects.get(pk=pk, user=request.user)
    except Enrollment.DoesNotExist:
        return Response(status=404)
    enrollment.delete()
    return Response(status=204)


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

class AccountListView(generics.ListAPIView):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Account.objects
            .filter(enrollment__user=self.request.user)
            .select_related('enrollment')
            .order_by('name')
        )


class AccountDetailView(generics.UpdateAPIView):
    serializer_class = AccountSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['patch']

    def get_queryset(self):
        return Account.objects.filter(enrollment__user=self.request.user)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

CATEGORY_PALETTE = [
    '#818cf8', '#34d399', '#fb923c', '#f472b6',
    '#60a5fa', '#a78bfa', '#facc15', '#2dd4bf',
    '#f87171', '#4ade80', '#e879f9', '#38bdf8',
]


def next_palette_color():
    """Pick the palette color used least often by existing categories."""
    from django.db.models import Count, Q
    counts = {c: 0 for c in CATEGORY_PALETTE}
    for row in Category.objects.values('color').annotate(n=Count('id')):
        if row['color'] in counts:
            counts[row['color']] += row['n']
    return min(counts, key=counts.get)


class CategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        from django.db.models import Count
        return Category.objects.annotate(
            usage=Count('transaction')
        ).order_by('-usage', 'name')

    def perform_create(self, serializer):
        # Auto-assign a color if the client didn't send one
        if 'color' not in self.request.data:
            serializer.save(color=next_palette_color())
        else:
            serializer.save()


class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['patch', 'delete']

    def get_queryset(self):
        from django.db.models import Count
        return Category.objects.annotate(usage=Count('transaction'))


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

class TransactionListView(generics.ListAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Transaction.objects.filter(
            account__enrollment__user=self.request.user,
            account__tracked=True,
        ).select_related('account', 'account__enrollment', 'category')

        # Status filter
        show_declined = self.request.query_params.get('show_declined') == 'true'
        if not show_declined:
            qs = qs.filter(declined=False)

        confirmed = self.request.query_params.get('confirmed')
        if confirmed == 'true':
            qs = qs.filter(confirmed=True)
        elif confirmed == 'false':
            qs = qs.filter(confirmed=False)

        month = self.request.query_params.get('month')  # expects YYYY-MM
        if month:
            try:
                year, mon = month.split('-')
                qs = qs.filter(date__year=int(year), date__month=int(mon))
            except (ValueError, AttributeError):
                pass

        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)

        account = self.request.query_params.get('account')
        if account:
            qs = qs.filter(account_id=account)

        search = self.request.query_params.get('search', '').strip()
        if search:
            from django.contrib.postgres.search import TrigramSimilarity
            from django.db.models import Q
            from django.db.models.functions import Greatest
            qs = qs.annotate(
                similarity=Greatest(
                    TrigramSimilarity('merchant', search),
                    TrigramSimilarity('description', search),
                )
            ).filter(
                Q(merchant__icontains=search) |
                Q(description__icontains=search) |
                Q(similarity__gt=0.15)
            ).order_by('-similarity', '-date')

        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()

        try:
            page = max(1, int(request.query_params.get('page', 1)))
            limit = min(500, max(1, int(request.query_params.get('limit', 50))))
        except (ValueError, TypeError):
            page, limit = 1, 50

        from django.db.models import Count, Sum, Q
        agg = qs.aggregate(count=Count('id'), total=Sum('amount', filter=Q(amount__gt=0)))
        count = agg['count']
        total_amount = agg['total'] or 0
        total_pages = max(1, -(-count // limit))  # ceiling division
        offset = (page - 1) * limit
        page_qs = qs[offset:offset + limit]

        serializer = self.get_serializer(page_qs, many=True)
        return Response({
            'count': count,
            'total_pages': total_pages,
            'page': page,
            'total_amount': float(total_amount),
            'results': serializer.data,
        })


class TransactionDetailView(generics.UpdateAPIView):
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['patch']

    def get_queryset(self):
        return Transaction.objects.filter(account__enrollment__user=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.save()
        # When confirmed with a category, upsert the merchant rule so future
        # transactions from the same merchant are auto-categorized.
        if instance.category and instance.merchant:
            from .models import MerchantRule
            from .categorizer import normalize_merchant
            key = normalize_merchant(instance.merchant)
            MerchantRule.objects.update_or_create(
                user=self.request.user,
                merchant_key=key,
                defaults={'category': instance.category},
            )
            # Retroactively fill existing unconfirmed, uncategorized transactions
            # from the same merchant already sitting in the review queue.
            pending = (
                Transaction.objects
                .filter(
                    account__enrollment__user=self.request.user,
                    confirmed=False,
                    declined=False,
                    category__isnull=True,
                )
                .exclude(merchant='')
                .values_list('id', 'merchant')
            )
            ids_to_update = [
                txn_id for txn_id, merchant in pending
                if normalize_merchant(merchant) == key
            ]
            if ids_to_update:
                Transaction.objects.filter(id__in=ids_to_update).update(
                    category=instance.category
                )


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

def _sync_account(enrollment, remote_acct) -> int:
    """Sync one account: upsert, refresh balance, import new transactions. Returns count of new transactions."""
    account, _ = Account.objects.update_or_create(
        teller_id=remote_acct['id'],
        defaults={
            'enrollment': enrollment,
            'name': remote_acct.get('name', ''),
            'last_four': remote_acct.get('last_four', ''),
            'account_type': remote_acct.get('type', ''),
        },
    )

    try:
        bal = teller.get_balance(enrollment.access_token, remote_acct['id'])
        account.balance_ledger = bal.get('ledger')
        account.balance_available = bal.get('available')
        account.save(update_fields=['balance_ledger', 'balance_available'])
    except Exception:
        pass

    if not account.tracked:
        return 0

    latest = Transaction.objects.filter(account=account).aggregate(Max('date'))['date__max']
    since = (latest - timedelta(days=2)) if latest else (date.today() - timedelta(days=90))

    try:
        remote_txns = teller.get_transactions_since(enrollment.access_token, remote_acct['id'], since)
    except Exception:
        return 0

    if not remote_txns:
        return 0

    existing_ids = set(
        Transaction.objects.filter(
            account=account,
            teller_id__in=[t['id'] for t in remote_txns],
        ).values_list('teller_id', flat=True)
    )

    new_txns = [
        Transaction(
            teller_id=t['id'],
            account=account,
            date=t['date'],
            amount=t['amount'],
            merchant=((t.get('details') or {}).get('counterparty') or {}).get('name', '') or t.get('description', ''),
            description='',
            confirmed=False,
        )
        for t in remote_txns
        if t['id'] not in existing_ids
    ]

    if not new_txns:
        return 0

    created = Transaction.objects.bulk_create(new_txns, ignore_conflicts=True)
    for txn in created:
        _apply_auto_categorize(txn)
    return len(created)


def _sync_enrollment(enrollment, synced_count: list):
    """Sync all accounts in one enrollment in parallel."""
    try:
        remote_accounts = teller.get_accounts(enrollment.access_token)
    except Exception:
        return

    with ThreadPoolExecutor(max_workers=len(remote_accounts) or 1) as executor:
        futures = [executor.submit(_sync_account, enrollment, acct) for acct in remote_accounts]
        for future in as_completed(futures):
            try:
                synced_count[0] += future.result()
            except Exception:
                pass


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sync_transactions(request):
    """Pull latest transactions from Teller for all of this user's enrollments."""
    synced = [0]
    for enrollment in Enrollment.objects.filter(user=request.user):
        _sync_enrollment(enrollment, synced)
    return Response({'synced': synced[0]})


# ---------------------------------------------------------------------------
# Cron sync — called daily by Vercel cron, no user session required
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([AllowAny])
def cron_sync(request):
    """Sync all users' enrollments. Secured by CRON_SECRET bearer token."""
    import os
    secret = os.environ.get('CRON_SECRET', '')
    auth = request.headers.get('Authorization', '')
    if not secret or auth != f'Bearer {secret}':
        return Response({'error': 'Unauthorized'}, status=401)

    synced = [0]
    for enrollment in Enrollment.objects.all():
        _sync_enrollment(enrollment, synced)
    return Response({'synced': synced[0]})


# ---------------------------------------------------------------------------
# Spending summary (for charts)
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def spending_summary(request):
    from calendar import monthrange
    from collections import defaultdict
    from django.db.models import Sum
    from django.db.models.functions import TruncMonth

    qs = Transaction.objects.filter(
        account__enrollment__user=request.user,
        account__tracked=True,
        declined=False,
        amount__gt=0,  # positive = expense (charge); negative = refund/credit
    )

    # Date range — accepts YYYY-MM-DD or YYYY-MM
    def parse_date(s, end_of_month=False):
        from calendar import monthrange as _mr
        try:
            if len(s) == 10:
                return date.fromisoformat(s)
            y, m = s.split('-')
            d = monthrange(int(y), int(m))[1] if end_of_month else 1
            return date(int(y), int(m), d)
        except Exception:
            return None

    from_date = parse_date(request.query_params.get('from', ''))
    to_date   = parse_date(request.query_params.get('to', ''), end_of_month=True)
    if from_date:
        qs = qs.filter(date__gte=from_date)
    if to_date:
        qs = qs.filter(date__lte=to_date)

    # Category filter
    cats = request.query_params.get('categories', '')
    if cats:
        cat_ids = [int(c) for c in cats.split(',') if c.strip().isdigit()]
        if cat_ids:
            qs = qs.filter(category_id__in=cat_ids)

    # Account filter
    accts = request.query_params.get('accounts', '')
    if accts:
        acct_ids = [int(a) for a in accts.split(',') if a.strip().isdigit()]
        if acct_ids:
            qs = qs.filter(account_id__in=acct_ids)

    rows = (
        qs
        .annotate(month=TruncMonth('date'))
        .values('month', 'category__id', 'category__name')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )

    months_map = defaultdict(lambda: {'total': 0, 'by_category': {}})
    seen_categories = {}

    for row in rows:
        key = row['month'].strftime('%Y-%m')
        cat = row['category__name'] or 'Uncategorized'
        amt = float(row['total'])
        months_map[key]['total'] += amt
        months_map[key]['by_category'][cat] = round(amt, 2)
        seen_categories[cat] = row['category__id']

    months = []
    for key in sorted(months_map):
        y, m = key.split('-')
        months.append({
            'month': key,
            'label': date(int(y), int(m), 1).strftime("%b '%y"),
            'total': round(months_map[key]['total'], 2),
            'by_category': months_map[key]['by_category'],
        })

    grand_total = sum(mo['total'] for mo in months)
    return Response({
        'months': months,
        'categories': sorted(seen_categories.keys()),
        'grand_total': round(grand_total, 2),
        'monthly_avg': round(grand_total / len(months), 2) if months else 0,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    from django.db.models import Sum
    from calendar import monthrange

    user = request.user
    today = date.today()

    # Parse optional ?month=YYYY-MM, default to current month
    month_param = request.query_params.get('month', '')
    try:
        sel_year, sel_month = [int(x) for x in month_param.split('-')]
    except (ValueError, AttributeError):
        sel_year, sel_month = today.year, today.month

    is_current = (sel_year == today.year and sel_month == today.month)

    # Review queue count (always reflects current pending queue)
    review_count = Transaction.objects.filter(
        account__enrollment__user=user,
        account__tracked=True,
        confirmed=False,
        declined=False,
    ).count()

    # Selected month bounds
    days_in_month = monthrange(sel_year, sel_month)[1]
    month_start = date(sel_year, sel_month, 1)
    month_end = date(sel_year, sel_month, days_in_month)
    days_remaining = max(0, (month_end - today).days + 1) if is_current else 0

    # 6-month trailing average: 6 months ending the month before selected
    pm = sel_month - 1 if sel_month > 1 else 12
    py = sel_year if sel_month > 1 else sel_year - 1
    avg_end = date(py, pm, monthrange(py, pm)[1])
    avg_start = date(py if pm >= 6 else py - 1, pm - 5 if pm >= 6 else 12 - (5 - pm), 1)

    # Base: confirmed tracked expenses
    base_qs = Transaction.objects.filter(
        account__enrollment__user=user,
        account__tracked=True,
        confirmed=True,
        declined=False,
        amount__gt=0,
    )

    month_qs = base_qs.filter(date__gte=month_start, date__lte=month_end)
    month_total = month_qs.aggregate(t=Sum('amount'))['t'] or 0

    top_categories = list(
        month_qs
        .filter(category__isnull=False)
        .values('category__name', 'category__color')
        .annotate(total=Sum('amount'))
        .order_by('-total')[:8]
    )

    avg_total = base_qs.filter(
        date__gte=avg_start, date__lte=avg_end
    ).aggregate(t=Sum('amount'))['t'] or 0
    monthly_avg_6m = float(avg_total) / 6

    accounts = Account.objects.filter(
        enrollment__user=user,
        tracked=True,
    ).select_related('enrollment')

    return Response({
        'review_count': review_count,
        'month': {
            'year': sel_year,
            'month': sel_month,
            'label': date(sel_year, sel_month, 1).strftime('%B %Y'),
            'total': float(month_total),
            'days_remaining': days_remaining,
            'days_in_month': days_in_month,
            'is_current': is_current,
            'top_categories': [
                {'name': c['category__name'], 'color': c['category__color'], 'total': float(c['total'])}
                for c in top_categories
            ],
        },
        'avg_6m': monthly_avg_6m,
        'accounts': AccountSerializer(accounts, many=True).data,
    })
