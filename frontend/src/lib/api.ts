import type { Account, Category, DashboardData, Enrollment, Transaction, SpendingSummary, PaginatedTransactions } from './types'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const TOKEN_KEY = 'auth_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Token ${token}` } : {}),
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
export const login = async (username: string, password: string): Promise<{ username: string }> => {
  const res = await request<{ username: string; token: string }>('/api/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setStoredToken(res.token)
  return { username: res.username }
}

export const register = (username: string, password: string) =>
  request<{ username: string }>('/api/auth/register/', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

export const logout = async (): Promise<void> => {
  await request<void>('/api/auth/logout/', { method: 'POST' }).catch(() => {})
  clearStoredToken()
}

export const getMe = () =>
  request<{ username: string; account_tier: string }>('/api/auth/me/')

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
  updateTransaction(id, { status: 'confirmed' })

export const declineTransaction = (id: number) =>
  updateTransaction(id, { status: 'declined' })

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

// Budget config
export const getBudgetConfig = () =>
  request<Record<string, unknown>>('/api/budget-config/')

export const saveBudgetConfig = (config: Record<string, unknown>) =>
  request<Record<string, unknown>>('/api/budget-config/', {
    method: 'PUT',
    body: JSON.stringify(config),
  })
