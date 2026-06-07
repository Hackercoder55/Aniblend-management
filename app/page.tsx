'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'manager' | 'head'>('manager')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Invalid credentials or role. Please try again.')
        setLoading(false)
        return
      }

      localStorage.setItem('AniBlend_user', JSON.stringify(result.user))

      router.push('/manager')
    } catch {
      setError('An error occurred. Please try again.')
    }

    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
    >
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <img
              src="/logo.png"
              alt="The Future Animations Logo"
              className="w-24 h-24 object-contain drop-shadow-2xl"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=AniBlend&background=667eea&color=fff&rounded=true&size=128';
              }}
            />
          </div>
          <h1 className="text-3xl font-bold text-white">AniBlend Dashboard</h1>
          <p className="mt-1" style={{ color: '#d8b4fe' }}>The Future Animation Agency</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6">Welcome back</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Login as</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole('head')}
                  className="py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all"
                  style={{
                    borderColor: role === 'head' ? '#667eea' : '#e5e7eb',
                    backgroundColor: role === 'head' ? '#f0f0ff' : 'white',
                    color: role === 'head' ? '#667eea' : '#6b7280',
                  }}
                >
                  Head
                </button>
                <button
                  type="button"
                  onClick={() => setRole('manager')}
                  className="py-2.5 px-4 rounded-lg border-2 text-sm font-medium transition-all"
                  style={{
                    borderColor: role === 'manager' ? '#667eea' : '#e5e7eb',
                    backgroundColor: role === 'manager' ? '#f0f0ff' : 'white',
                    color: role === 'manager' ? '#667eea' : '#6b7280',
                  }}
                >
                  Manager
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 text-gray-800 text-sm"
                style={{ '--tw-ring-color': '#a78bfa' } as React.CSSProperties}
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 text-gray-800 text-sm"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg text-white font-semibold text-sm transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#d8b4fe' }}>
          © 2026 The Future Animation Agency
        </p>
      </div>
    </div>
  )
}
