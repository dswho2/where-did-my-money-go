import type { Account, Category, DashboardData, Enrollment, Transaction, SpendingSummary, PaginatedTransactions } from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

function getCsrfToken(): string {
  return document.cookie
    .split('; ')
    .find(r => r.startsWith('csrftoken='))
    ?.split('=')[1] ?? ''
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': getCsrfToken(),
      ...options?.headers,
    },
    ...options,
  })
  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const json = await res.json().catch(() => null)
      const detail = json?.detail ?? json?.error ?? JSON.stringify(json)
      throw new Error(`${res.status}: ${detail}`)
    }
    // HTML error page (Django debug) — just show the status
    throw new Error(`${res.status} ${res.statusText}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Auth
export const login = (username: string, password: string) =>
  request<{ username: string }>('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const register = (username: string, password: string) =>
  request<{ username: string }>('/api/auth/register/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const logout = () =>
  request<void>('/api/auth/logout/', { method: 'POST' })

export const getMe = () =>
  request<{ username: string }>('/api/auth/me/')

// Enrollments
export const getEnrollments = () => request<Enrollment[]>('/api/enrollments/')

export const createEnrollment = (access_token: string, institution_name: string, days_back: number) =>
  request<Enrollment>('/api/enrollments/', {
    method: 'POST',
    body: JSON.stringify({ access_token, institution_name, days_back }),
  })

export const deleteEnrollment = (id: number) =>
  request<void>(`/api/enrollments/${id}/`, { method: 'DELETE' })

// Accounts
export const getAccounts = () => request<Account[]>('/api/accounts/')

export const updateAccount = (id: number, data: { tracked: boolean }) =>
  request<Account>(`/api/accounts/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

// Categories
export const getCategories = () => request<Category[]>('/api/categories/')

// Transactions
export const getTransactions = (params: Record<string, string> = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request<PaginatedTransactions>(`/api/transactions/${qs ? `?${qs}` : ''}`)
}

export const updateTransaction = (id: number, data: Partial<Transaction>) =>
  request<Transaction>(`/api/transactions/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const confirmTransaction = (id: number) =>
  updateTransaction(id, { confirmed: true })

export const declineTransaction = (id: number) =>
  updateTransaction(id, { declined: true })

export const createCategory = (name: string, color?: string) =>
  request<Category>('/api/categories/', {
    method: 'POST',
    body: JSON.stringify({ name, ...(color ? { color } : {}) }),
  })

export const updateCategory = (id: number, data: { name?: string; color?: string }) =>
  request<Category>(`/api/categories/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const deleteCategory = (id: number) =>
  request<void>(`/api/categories/${id}/`, { method: 'DELETE' })

// Sync: pull latest transactions from Teller for all accounts
export const syncTransactions = () =>
  request<{ synced: number }>('/api/sync/', { method: 'POST' })

// Spending summary
export const getSpending = (params: Record<string, string> = {}) => {
  const qs = new URLSearchParams(params).toString()
  return request<SpendingSummary>(`/api/spending/${qs ? `?${qs}` : ''}`)
}

export const getDashboard = (month?: string) =>
  request<DashboardData>(`/api/dashboard/${month ? `?month=${month}` : ''}`)
