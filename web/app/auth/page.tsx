'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

function AuthPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  useEffect(() => {
    const m = searchParams.get('mode')
    if (m === 'signup' || m === 'signin') setMode(m)
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  async function handleSubmit() {
    setError(null)
    setMessage(null)
    setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Account created! Check your email to confirm, then sign in.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        // Check if user has a saved character to decide redirect
        const charRes = await fetch('/api/character/get')
        const charData = await charRes.json()
        router.push(charData.character ? '/map' : '/score')
        router.refresh()
      }
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0f',
      fontFamily: '"Cinzel", serif',
      padding: '2rem',
      position: 'relative',
    }}>
      {/* Background rune pattern */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(99,57,134,0.15) 0%, transparent 60%),
                          radial-gradient(ellipse at 80% 20%, rgba(30,80,160,0.1) 0%, transparent 50%)`,
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: '420px',
        position: 'relative',
      }}>
        {/* Decorative top line */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '2rem',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #6339864d)' }} />
          <span style={{ color: '#9b72cf', fontSize: '18px', letterSpacing: '4px' }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #6339864d)' }} />
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '700',
            color: '#e8e0f0',
            letterSpacing: '0.12em',
            margin: 0,
            textTransform: 'uppercase',
          }}>
            World Scale
          </h1>
          <p style={{
            fontFamily: '"Crimson Text", serif',
            color: '#8878a0',
            fontSize: '1rem',
            marginTop: '0.5rem',
            letterSpacing: '0.05em',
          }}>
            {mode === 'signin' ? 'Return to your realm' : 'Begin your ascent'}
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(155,114,207,0.2)',
          borderRadius: '12px',
          padding: '2rem',
          backdropFilter: 'blur(8px)',
        }}>
          {/* Mode toggle */}
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '8px',
            padding: '4px',
            marginBottom: '1.75rem',
          }}>
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setMessage(null) }}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontFamily: '"Cinzel", serif',
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  transition: 'all 0.2s',
                  background: mode === m ? 'rgba(155,114,207,0.25)' : 'transparent',
                  color: mode === m ? '#c8a8f0' : '#6b5c80',
                  fontWeight: mode === m ? '600' : '400',
                }}
              >
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Email field */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              fontFamily: '"Cinzel", serif',
              fontSize: '0.7rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#8878a0',
              marginBottom: '0.5rem',
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(155,114,207,0.25)',
                borderRadius: '8px',
                color: '#e8e0f0',
                fontFamily: '"Crimson Text", serif',
                fontSize: '1rem',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(155,114,207,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(155,114,207,0.25)'}
            />
          </div>

          {/* Password field */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              fontFamily: '"Cinzel", serif',
              fontSize: '0.7rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#8878a0',
              marginBottom: '0.5rem',
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(155,114,207,0.25)',
                borderRadius: '8px',
                color: '#e8e0f0',
                fontFamily: '"Crimson Text", serif',
                fontSize: '1rem',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(155,114,207,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(155,114,207,0.25)'}
            />
          </div>

          {/* Error / success message */}
          {error && (
            <div style={{
              background: 'rgba(163,45,45,0.15)',
              border: '1px solid rgba(163,45,45,0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: '#f09595',
              fontFamily: '"Crimson Text", serif',
              fontSize: '0.95rem',
            }}>
              {error}
            </div>
          )}
          {message && (
            <div style={{
              background: 'rgba(30,120,80,0.15)',
              border: '1px solid rgba(30,120,80,0.3)',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: '#5dcaa5',
              fontFamily: '"Crimson Text", serif',
              fontSize: '0.95rem',
            }}>
              {message}
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              background: loading
                ? 'rgba(155,114,207,0.15)'
                : 'linear-gradient(135deg, rgba(155,114,207,0.35), rgba(99,57,134,0.45))',
              border: '1px solid rgba(155,114,207,0.4)',
              borderRadius: '8px',
              color: loading ? '#6b5c80' : '#e8e0f0',
              fontFamily: '"Cinzel", serif',
              fontSize: '0.8rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'Casting...' : mode === 'signin' ? 'Enter the Realm' : 'Create Character'}
          </button>
        </div>

        {/* Decorative bottom line */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginTop: '2rem',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, #6339864d)' }} />
          <span style={{ color: '#4a3860', fontSize: '12px', letterSpacing: '4px' }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, #6339864d)' }} />
        </div>
      </div>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');
        input::placeholder { color: #4a3860; }
      `}</style>

      <a
        href="/legal/privacy"
        style={{
          position: 'absolute', bottom: '24px',
          fontFamily: '"Cinzel", serif',
          fontSize: '0.65rem', color: 'rgba(155,114,207,0.3)',
          textDecoration: 'none', letterSpacing: '0.1em', textTransform: 'uppercase',
        }}
      >
        Privacy Policy
      </a>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageInner />
    </Suspense>
  )
}
