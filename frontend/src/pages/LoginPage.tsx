import { useState } from 'react'
import { login, register } from '../lib/api'

type Mode = 'signin' | 'signup'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === 'signup') {
        await register(username, password)
      }
      await login(username, password)
      onLogin()
    } catch {
      setError(mode === 'signup' ? 'Could not create account.' : 'Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <p className="text-neutral-500 text-xs uppercase tracking-widest mb-1">personal finance</p>
        <h1 className="text-white text-2xl font-semibold tracking-tight mb-8">
          where did my money go
        </h1>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-1 mb-4">
          {(['signin', 'signup'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${
                mode === m
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
            required
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
          />

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-neutral-900 text-sm font-medium rounded-lg py-2.5 hover:bg-neutral-100 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
