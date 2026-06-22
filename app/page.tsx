'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1e2027',
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: '20px',
    }}>
      {/* Background subtle texture */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(102,126,234,0.07) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(118,75,162,0.05) 0%, transparent 60%)',
        pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>

        {/* Logo + Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 140, height: 140, marginBottom: 16,
            background: '#2d3038',
            borderRadius: 24,
            boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
            padding: 12,
          }}>
            <img
              src="/logo.png"
              alt="AniBlend Studio"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.5px' }}>
            AniBlend Studio
          </h1>
          <p style={{ marginTop: 6, fontSize: 13, color: '#6b7280', letterSpacing: '0.05em' }}>
            Management Dashboard
          </p>
        </div>

        {/* Login Card */}
        <div style={{
          background: '#2d3038',
          borderRadius: 20,
          padding: '32px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f9fafb', margin: '0 0 6px' }}>
            Welcome back
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
            Sign in to access your dashboard
          </p>

          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 10, color: '#f87171', fontSize: 13
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* Role toggle */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Login as
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['head', 'manager'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: 10,
                      border: role === r ? '1.5px solid rgba(102,126,234,0.7)' : '1.5px solid rgba(255,255,255,0.08)',
                      background: role === r ? 'rgba(102,126,234,0.18)' : 'rgba(255,255,255,0.03)',
                      color: role === r ? '#a5b4fc' : '#6b7280',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {r === 'head' ? '👑 Head' : '🔧 Manager'}
                  </button>
                ))}
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@aniblend.com"
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1.5px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, color: '#f9fafb', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(102,126,234,0.6)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '12px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1.5px solid rgba(255,255,255,0.08)',
                  borderRadius: 10, color: '#f9fafb', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(102,126,234,0.6)'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '13px 16px',
                borderRadius: 12, border: 'none',
                background: loading ? 'rgba(102,126,234,0.4)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#ffffff', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(102,126,234,0.35)',
              }}
            >
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <svg style={{ animation: 'spin 1s linear infinite', width: 16, height: 16 }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign in →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#374151', marginTop: 24 }}>
          © 2026 AniBlend Studio. All rights reserved.
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #4b5563; }
      `}</style>
    </div>
  )
}
