import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { getMe, getStoredToken } from './lib/api'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import ReviewPage from './pages/ReviewPage'
import TransactionsPage from './pages/TransactionsPage'
import AccountsPage from './pages/AccountsPage'
import SpendingPage from './pages/SpendingPage'
import CategoriesPage from './pages/CategoriesPage'
import BudgetPage from './pages/BudgetPage'

type AuthState = 'loading' | 'authed' | 'anon'

export default function App() {
  const [auth, setAuth] = useState<AuthState>('loading')
  const [accountTier, setAccountTier] = useState<string>('standard')

  useEffect(() => {
    if (!getStoredToken()) {
      setAuth('anon')
      return
    }
    getMe()
      .then(data => { setAccountTier(data.account_tier); setAuth('authed') })
      .catch(() => setAuth('anon'))
  }, [])

  if (auth === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <span className="text-neutral-600 text-sm">Loading...</span>
      </div>
    )
  }

  if (auth === 'anon') {
    return <LoginPage onLogin={() => {
      getMe()
        .then(data => setAccountTier(data.account_tier))
        .catch(() => {})
      setAuth('authed')
    }} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout onLogout={() => setAuth('anon')} accountTier={accountTier} />}>
          <Route index element={<HomePage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="spending" element={<SpendingPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="categories" element={<CategoriesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
