export interface Enrollment {
  id: number
  institution_name: string
  created_at: string
  accounts: Account[]
}

export interface Account {
  id: number
  enrollment: number
  teller_id: string
  name: string
  last_four: string
  account_type: string
  institution_name: string
  balance_ledger: string | null
  balance_available: string | null
  tracked: boolean
}

export interface Category {
  id: number
  name: string
  color: string
  usage?: number
}

export interface SpendingMonth {
  month: string
  label: string
  total: number
  by_category: Record<string, number>
}

export interface SpendingSummary {
  months: SpendingMonth[]
  categories: string[]
  grand_total: number
  monthly_avg: number
}

export interface Transaction {
  id: number
  account: number
  account_name?: string
  teller_id: string
  date: string
  amount: string
  merchant: string
  description: string
  category: number | null
  category_name?: string
  category_color?: string
  status: 'pending' | 'confirmed' | 'declined'
}

export interface PaginatedTransactions {
  count: number
  total_pages: number
  page: number
  total_amount: number
  results: Transaction[]
}

export interface DashboardData {
  review_count: number
  month: {
    year: number
    month: number
    label: string
    total: number
    days_remaining: number
    days_in_month: number
    is_current: boolean
    top_categories: { name: string; color: string; total: number }[]
  }
  avg_6m: number
  accounts: Account[]
}
