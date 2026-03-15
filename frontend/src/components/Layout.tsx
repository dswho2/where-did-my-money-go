import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { logout } from '../lib/api'

const nav = [
  { to: '/', label: 'Home', end: true },
  { to: '/review', label: 'Review' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/spending', label: 'Spending' },
  { to: '/budget', label: 'Budget' },
  { to: '/categories', label: 'Categories' },
  { to: '/accounts', label: 'Accounts' },
]

export default function Layout({ onLogout, accountTier }: { onLogout: () => void; accountTier: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  async function handleLogout() {
    try { await logout() } catch { /* ignore */ }
    onLogout()
  }

  // Close menu on navigation
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      <header className="border-b border-neutral-800 px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm font-medium tracking-tight text-neutral-400 hover:text-neutral-200 transition-colors">
          where did my money go
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          <nav className="flex gap-0.5 mr-2">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-neutral-800 text-white'
                      : 'text-neutral-500 hover:text-white hover:bg-neutral-800/50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-300 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="md:hidden p-2 text-neutral-400 hover:text-neutral-200 transition-colors"
          aria-label="Menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile menu dropdown */}
      {menuOpen && (
        <div className="md:hidden border-b border-neutral-800 bg-neutral-950">
          <nav className="flex flex-col px-4 py-2">
            {nav.map((item) => {
              const isActive = item.end
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={closeMenu}
                  className={`px-3 py-3 rounded text-sm transition-colors ${
                    isActive
                      ? 'text-white bg-neutral-800'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
            <button
              onClick={() => { closeMenu(); handleLogout() }}
              className="px-3 py-3 text-left text-sm text-neutral-600 hover:text-neutral-300 transition-colors"
            >
              Sign out
            </button>
          </nav>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
        <Outlet context={{ accountTier }} />
      </main>
    </div>
  )
}
