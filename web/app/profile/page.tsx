'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { getTierStyle } from '@/lib/types'

interface RealmScore {
  power: number
  stats: {
    expertise: number
    prestige: number
    impact: number
    credentials: number
    network: number
  }
}

interface Character {
  name: string | null
  realms: Record<string, RealmScore>
  total_power: number
  updated_at: string
}

const STAT_LABELS: Record<string, string> = {
  expertise: 'Expertise',
  prestige: 'Prestige',
  impact: 'Impact',
  credentials: 'Credentials',
  network: 'Network',
}

const REALM_LABELS: Record<string, string> = {
  academia: 'Academia',
  tech: 'Tech',
  finance: 'Finance',
  medicine: 'Medicine',
  creative: 'Creative',
  law: 'Law',
}

export default function ProfilePage() {
  const router = useRouter()
  const [character, setCharacter] = useState<Character | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setEmail(user.email ?? null)

      const res = await fetch('/api/character/get')
      const data = await res.json()
      setCharacter(data.character)
      setLoading(false)
    }
    load()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const tierStyle = character ? getTierStyle(character.total_power) : null

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
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.5s ease forwards; }
        .stat-bar-fill { transition: width 0.8s ease; }
      `}</style>

      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(99,57,134,0.12) 0%, transparent 60%),
                          radial-gradient(ellipse at 80% 20%, rgba(30,80,160,0.08) 0%, transparent 50%)`,
      }} />

      <div style={{ maxWidth: '760px', margin: '0 auto', position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '0.12em', color: '#e8e0f0' }}>
              World Scale
            </h1>
            {email && (
              <p style={{ margin: '4px 0 0', fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.95rem' }}>
                {email}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={() => router.push('/')} style={{
              padding: '0.5rem 1.25rem', background: 'transparent',
              border: '1px solid rgba(155,114,207,0.3)', borderRadius: '8px',
              color: '#9b72cf', fontFamily: '"Cinzel", serif', fontSize: '0.7rem',
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Score
            </button>
            <button onClick={handleSignOut} style={{
              padding: '0.5rem 1.25rem', background: 'transparent',
              border: '1px solid rgba(155,114,207,0.2)', borderRadius: '8px',
              color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.7rem',
              letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Sign Out
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', color: '#6b5c80', fontFamily: '"Crimson Text", serif', fontSize: '1.1rem', marginTop: '4rem' }}>
            Summoning your character...
          </div>
        )}

        {/* No character yet */}
        {!loading && !character && (
          <div style={{
            textAlign: 'center', padding: '4rem 2rem',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(155,114,207,0.15)', borderRadius: '16px',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.4 }}>⚔</div>
            <h2 style={{ color: '#8878a0', fontWeight: '400', fontSize: '1.1rem', letterSpacing: '0.1em', margin: '0 0 0.75rem' }}>
              No character yet
            </h2>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#4a3860', fontSize: '1rem', margin: '0 0 1.5rem' }}>
              Score a realm to create your character
            </p>
            <button onClick={() => router.push('/')} style={{
              padding: '0.75rem 2rem', background: 'rgba(155,114,207,0.2)',
              border: '1px solid rgba(155,114,207,0.4)', borderRadius: '8px',
              color: '#c8a8f0', fontFamily: '"Cinzel", serif', fontSize: '0.75rem',
              letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            }}>
              Begin Scoring
            </button>
          </div>
        )}

        {/* Character card */}
        {!loading && character && tierStyle && (
          <div className="fade-in">

            {/* Power + tier banner */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${tierStyle.color}44`,
              borderRadius: '16px', padding: '2rem',
              marginBottom: '1.5rem', textAlign: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `radial-gradient(ellipse at 50% 0%, ${tierStyle.color}18 0%, transparent 70%)`,
              }} />

              {/* Character name */}
              {character.name && (
                <div style={{
                  fontFamily: '"Cinzel", serif',
                  fontSize: '1.3rem', fontWeight: '600',
                  color: '#e8e0f0', letterSpacing: '0.08em',
                  marginBottom: '0.75rem',
                }}>
                  {character.name}
                </div>
              )}

              {/* Tier badge */}
              <div style={{
                display: 'inline-block',
                padding: '0.3rem 1rem',
                background: tierStyle.bg + '22',
                border: `1px solid ${tierStyle.color}55`,
                borderRadius: '999px', color: tierStyle.color,
                fontSize: '0.7rem', letterSpacing: '0.2em',
                textTransform: 'uppercase', marginBottom: '1rem',
              }}>
                {tierStyle.name}
              </div>

              {/* Total power */}
              <div style={{
                fontSize: '3.5rem', fontWeight: '700',
                color: tierStyle.color, lineHeight: 1, marginBottom: '0.25rem',
              }}>
                {character.total_power.toLocaleString()}
              </div>
              <div style={{
                fontFamily: '"Crimson Text", serif',
                color: '#6b5c80', fontSize: '0.9rem', letterSpacing: '0.1em',
              }}>
                Total Power
              </div>
            </div>

            {/* Realm breakdown */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: Object.keys(character.realms).length === 1 ? '1fr' : '1fr 1fr',
              gap: '1rem',
            }}>
              {Object.entries(character.realms).map(([realm, score]) => (
                <div key={realm} style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(155,114,207,0.15)',
                  borderRadius: '12px', padding: '1.5rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#9b72cf' }}>
                      {REALM_LABELS[realm] ?? realm}
                    </h3>
                    <span style={{ fontFamily: '"Crimson Text", serif', color: '#c8a8f0', fontSize: '1.1rem' }}>
                      {score.power.toLocaleString()}
                    </span>
                  </div>

                  {Object.entries(score.stats).map(([stat, value]) => (
                    <div key={stat} style={{ marginBottom: '0.6rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.85rem' }}>
                          {STAT_LABELS[stat] ?? stat}
                        </span>
                        <span style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.85rem' }}>
                          {value}
                        </span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(155,114,207,0.1)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div className="stat-bar-fill" style={{
                          height: '100%', width: `${value}%`,
                          background: `linear-gradient(to right, #6339864d, #9b72cf)`,
                          borderRadius: '999px',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <p style={{
              textAlign: 'center', fontFamily: '"Crimson Text", serif',
              color: '#3a2e50', fontSize: '0.85rem', marginTop: '1.5rem',
            }}>
              Last updated {new Date(character.updated_at).toLocaleDateString()}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
