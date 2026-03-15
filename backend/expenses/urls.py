from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path('auth/register/', views.auth_register),
    path('auth/login/', views.auth_login),
    path('auth/logout/', views.auth_logout),
    path('auth/me/', views.auth_me),

    # Enrollments (bank connections)
    path('enrollments/', views.enrollment_list_create),
    path('enrollments/<int:pk>/', views.enrollment_delete),

    # Resources
    path('accounts/', views.AccountListView.as_view()),
    path('accounts/<int:pk>/', views.AccountDetailView.as_view()),
    path('categories/', views.CategoryListCreateView.as_view()),
    path('categories/<int:pk>/', views.CategoryDetailView.as_view()),
    path('transactions/', views.TransactionListView.as_view()),
    path('transactions/<int:pk>/', views.TransactionDetailView.as_view()),

    # Teller sync
    path('sync/', views.sync_transactions),
    path('cron/sync/', views.cron_sync),

    # Spending summary
    path('spending/', views.spending_summary),

    # Dashboard
    path('dashboard/', views.dashboard),

    # Budget config
    path('budget-config/', views.budget_config),
]
