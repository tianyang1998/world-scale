'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getTierStyle } from '@/lib/types'

interface RealmScore {
  power: number
}

interface LeaderboardEntry {
  name: string | null
  realms: Record<string, RealmScore>
  total_power: number
  updated_at: string
}

const REALM_ICONS: Record<string, string> = {
  academia: '📚',
  tech: '⚡',
  finance: '💰',
  medicine: '⚕️',
  creative: '🎨',
  law: '⚖️',
}

export default function LeaderboardPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/leaderboard')
        const data = await res.json()
        if (!res.ok) { setError('Failed to load leaderboard.'); return }
        setEntries(data.leaderboard)
      } catch {
        setError('Network error — could not load leaderboard.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      fontFamily: '"Cinzel", serif',
      padding: '2rem',
      color: '#e8e0f0',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .row-animate { animation: fadeIn 0.4s ease forwards; }
        .leaderboard-row:hover { background: rgba(155,114,207,0.06) !important; }
      `}</style>

      {/* Background */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(99,57,134,0.12) 0%, transparent 60%),
                          radial-gradient(ellipse at 80% 20%, rgba(30,80,160,0.08) 0%, transparent 50%)`,
      }} />

      <div style={{ maxWidth: '860px', margin: '0 auto', position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '0.12em', color: '#e8e0f0' }}>
              World Scale
            </h1>
            <p style={{
              margin: '4px 0 0', fontFamily: '"Crimson Text", serif',
              color: '#6b5c80', fontSize: '0.95rem', letterSpacing: '0.05em',
            }}>
              Hall of Legends — Top 50
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => router.push('/score')} style={{
              padding: '0.5rem 1.25rem', background: 'transparent',
              border: '1px solid rgba(155,114,207,0.3)', borderRadius: '8px',
              color: '#9b72cf', fontFamily: '"Cinzel", serif', fontSize: '0.7rem',
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Score
            </button>
            <button onClick={() => router.push('/profile')} style={{
              padding: '0.5rem 1.25rem', background: 'transparent',
              border: '1px solid rgba(155,114,207,0.2)', borderRadius: '8px',
              color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.7rem',
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}>
              My Character
            </button>
          </div>
        </div>

        {/* Decorative divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(99,57,134,0.3))' }} />
          <span style={{ color: '#4a3860', fontSize: '12px', letterSpacing: '4px' }}>✦</span>
          <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to left, transparent, rgba(99,57,134,0.3))' }} />
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', color: '#6b5c80', fontFamily: '"Crimson Text", serif', fontSize: '1.1rem', marginTop: '4rem' }}>
            Consulting the ancient records...
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '1rem', background: 'rgba(163,45,45,0.15)',
            border: '1px solid rgba(163,45,45,0.3)', borderRadius: '8px',
            color: '#f09595', fontFamily: '"Crimson Text", serif', textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '4rem 2rem',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(155,114,207,0.15)', borderRadius: '16px',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }}>🏆</div>
            <h2 style={{ color: '#8878a0', fontWeight: '400', fontSize: '1.1rem', letterSpacing: '0.1em', margin: '0 0 0.75rem' }}>
              No champions yet
            </h2>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#4a3860', fontSize: '1rem', margin: '0 0 1.5rem' }}>
              Be the first to claim your place in the Hall of Legends
            </p>
            <button onClick={() => router.push('/score')} style={{
              padding: '0.75rem 2rem', background: 'rgba(155,114,207,0.2)',
              border: '1px solid rgba(155,114,207,0.4)', borderRadius: '8px',
              color: '#c8a8f0', fontFamily: '"Cinzel", serif', fontSize: '0.75rem',
              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Begin Scoring
            </button>
          </div>
        )}

        {/* Leaderboard table */}
        {!loading && entries.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(155,114,207,0.15)',
            borderRadius: '16px', overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr auto auto',
              gap: '1rem',
              padding: '0.75rem 1.5rem',
              borderBottom: '1px solid rgba(155,114,207,0.1)',
              background: 'rgba(155,114,207,0.05)',
            }}>
              <span style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: '#4a3860', textTransform: 'uppercase' }}>#</span>
              <span style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: '#4a3860', textTransform: 'uppercase' }}>Character</span>
              <span style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: '#4a3860', textTransform: 'uppercase' }}>Realms</span>
              <span style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: '#4a3860', textTransform: 'uppercase', textAlign: 'right' }}>Power</span>
            </div>

            {/* Rows */}
            {entries.map((entry, index) => {
              const tierStyle = getTierStyle(entry.total_power)
              const realmKeys = Object.keys(entry.realms)
              const isTop3 = index < 3
              const rankColors = ['#EF9F27', '#B4B2A9', '#BA7517']

              return (
                <div
                  key={index}
                  className="leaderboard-row row-animate"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '48px 1fr auto auto',
                    gap: '1rem',
                    padding: '1rem 1.5rem',
                    borderBottom: index < entries.length - 1 ? '1px solid rgba(155,114,207,0.06)' : 'none',
                    alignItems: 'center',
                    transition: 'background 0.15s',
                    animationDelay: `${index * 0.03}s`,
                    opacity: 0,
                  }}
                >
                  {/* Rank */}
                  <div style={{
                    fontWeight: '700',
                    fontSize: isTop3 ? '1.1rem' : '0.85rem',
                    color: isTop3 ? rankColors[index] : '#3a2e50',
                    fontFamily: '"Cinzel", serif',
                  }}>
                    {isTop3 ? ['✦', '✧', '✦'][index] : index + 1}
                  </div>

                  {/* Name + tier */}
                  <div>
                    <div style={{
                      fontFamily: '"Cinzel", serif',
                      fontSize: '0.9rem',
                      color: '#e8e0f0',
                      fontWeight: '600',
                      marginBottom: '4px',
                    }}>
                      {entry.name || 'Unknown Adventurer'}
                    </div>
                    <div style={{
                      display: 'inline-block',
                      padding: '0.15rem 0.6rem',
                      background: tierStyle.bg + '22',
                      border: `1px solid ${tierStyle.color}44`,
                      borderRadius: '999px',
                      color: tierStyle.color,
                      fontSize: '0.6rem',
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                    }}>
                      {tierStyle.name}
                    </div>
                  </div>

                  {/* Realm icons */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {realmKeys.map(realm => (
                      <span key={realm} style={{ fontSize: '14px' }} title={realm}>
                        {REALM_ICONS[realm] ?? '🌐'}
                      </span>
                    ))}
                  </div>

                  {/* Power */}
                  <div style={{
                    fontFamily: '"Crimson Text", serif',
                    fontSize: '1.1rem',
                    color: tierStyle.color,
                    fontWeight: '600',
                    textAlign: 'right',
                    minWidth: '72px',
                  }}>
                    {entry.total_power.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer note */}
        {!loading && entries.length > 0 && (
          <p style={{
            textAlign: 'center', fontFamily: '"Crimson Text", serif',
            color: '#3a2e50', fontSize: '0.85rem', marginTop: '1.5rem',
          }}>
            Rankings update each time a character is saved
          </p>
        )}
      </div>
    </div>
  )
}
