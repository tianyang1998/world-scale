'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { COSMETICS, CosmeticItem } from '@/lib/economy'

interface CharacterData {
  gold: number
  owned_cosmetics: string[] | null
  equipped_title: string | null
  equipped_border: string | null
}

export default function StorePage() {
  const router = useRouter()
  const [character, setCharacter] = useState<CharacterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [tab, setTab] = useState<'title' | 'border'>('title')

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const res = await fetch('/api/character/get')
      const data = await res.json()
      if (!data.character) { router.push('/score'); return }

      setCharacter({
        gold: data.character.gold ?? 0,
        owned_cosmetics: data.character.owned_cosmetics ?? [],
        equipped_title: data.character.equipped_title ?? null,
        equipped_border: data.character.equipped_border ?? null,
      })
      setLoading(false)
    }
    load()
  }, [])

  async function handleBuy(item: CosmeticItem) {
    if (!character) return
    setBuying(item.id)
    try {
      const res = await fetch('/api/economy/buy-cosmetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmetic_id: item.id, equip: true }),
      })
      const data = await res.json()
      if (data.success) {
        setCharacter({
          ...character,
          gold: data.gold ?? character.gold,
          owned_cosmetics: data.owned_cosmetics ?? [...(character.owned_cosmetics ?? []), item.id],
          equipped_title: item.type === 'title' ? item.id : character.equipped_title,
          equipped_border: item.type === 'border' ? item.id : character.equipped_border,
        })
      }
    } finally {
      setBuying(null)
    }
  }

  async function handleEquip(item: CosmeticItem) {
    if (!character) return
    setBuying(item.id)
    try {
      const res = await fetch('/api/economy/buy-cosmetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmetic_id: item.id, equip: true }),
      })
      const data = await res.json()
      if (data.success) {
        setCharacter({
          ...character,
          equipped_title: item.type === 'title' ? item.id : character.equipped_title,
          equipped_border: item.type === 'border' ? item.id : character.equipped_border,
        })
      }
    } finally {
      setBuying(null)
    }
  }

  if (loading || !character) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b5c80', fontFamily: '"Crimson Text", serif', fontSize: '1.1rem' }}>Opening the store...</p>
      </div>
    )
  }

  const owned = character.owned_cosmetics ?? []
  const items = COSMETICS.filter(c => c.type === tab)

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"Cinzel", serif', padding: '2rem', color: '#e8e0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');
      `}</style>

      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(99,57,134,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(186,117,23,0.08) 0%, transparent 50%)` }} />

      <div style={{ maxWidth: '560px', margin: '0 auto', position: 'relative' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <p style={{ fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.9rem', letterSpacing: '0.1em', margin: '0 0 0.5rem' }}>
            THE STORE
          </p>
          <div style={{ fontFamily: '"Crimson Text", serif', color: '#BA7517', fontSize: '1.1rem' }}>
            💰 {character.gold.toLocaleString()} gold
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', justifyContent: 'center' }}>
          {(['title', 'border'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '0.5rem 1.5rem',
                background: tab === t ? 'rgba(155,114,207,0.2)' : 'transparent',
                border: `1px solid ${tab === t ? 'rgba(155,114,207,0.4)' : 'rgba(155,114,207,0.15)'}`,
                borderRadius: '8px', cursor: 'pointer',
                color: tab === t ? '#c8a8f0' : '#6b5c80',
                fontFamily: '"Cinzel", serif', fontSize: '0.7rem',
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}
            >
              {t === 'title' ? 'Titles' : 'Borders'}
            </button>
          ))}
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map(item => {
            const isOwned = owned.includes(item.id)
            const isEquipped = item.type === 'title'
              ? character.equipped_title === item.id
              : character.equipped_border === item.id
            const canAfford = character.gold >= item.cost

            return (
              <div key={item.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '1rem',
                background: isEquipped ? 'rgba(155,114,207,0.12)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isEquipped ? 'rgba(155,114,207,0.4)' : 'rgba(155,114,207,0.15)'}`,
                borderRadius: '12px',
              }}>
                <div>
                  <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.8rem', color: '#e8e0f0', marginBottom: '4px' }}>
                    {item.name}
                    {isEquipped && <span style={{ color: '#5dcaa5', fontSize: '0.7rem', marginLeft: '8px' }}>EQUIPPED</span>}
                  </div>
                  <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.85rem', color: '#6b5c80' }}>
                    {item.type === 'title' ? `"${item.value}"` : item.name}
                    {item.realm && <span style={{ marginLeft: '6px', color: '#4a3860' }}>({item.realm})</span>}
                  </div>
                </div>
                <div>
                  {isOwned ? (
                    isEquipped ? (
                      <span style={{ color: '#5dcaa5', fontFamily: '"Crimson Text", serif', fontSize: '0.8rem' }}>Active</span>
                    ) : (
                      <button
                        onClick={() => handleEquip(item)}
                        disabled={buying === item.id}
                        style={{
                          padding: '0.4rem 1rem',
                          background: 'rgba(93,202,165,0.15)', border: '1px solid rgba(93,202,165,0.3)',
                          borderRadius: '6px', color: '#5dcaa5',
                          fontFamily: '"Cinzel", serif', fontSize: '0.65rem',
                          letterSpacing: '0.1em', cursor: 'pointer',
                        }}
                      >
                        Equip
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => handleBuy(item)}
                      disabled={!canAfford || buying === item.id}
                      style={{
                        padding: '0.4rem 1rem',
                        background: canAfford ? 'rgba(186,117,23,0.2)' : 'rgba(60,40,80,0.2)',
                        border: `1px solid ${canAfford ? 'rgba(186,117,23,0.4)' : 'rgba(60,40,80,0.3)'}`,
                        borderRadius: '6px',
                        color: canAfford ? '#ffcc44' : '#3a2e50',
                        fontFamily: '"Cinzel", serif', fontSize: '0.65rem',
                        letterSpacing: '0.1em',
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {buying === item.id ? '...' : `${item.cost}g`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button
          onClick={() => router.push('/map')}
          style={{ width: '100%', marginTop: '1.5rem', padding: '0.6rem', background: 'transparent', border: 'none', color: '#4a3860', fontFamily: '"Crimson Text", serif', fontSize: '0.9rem', cursor: 'pointer' }}
        >
          ← Back to map
        </button>
      </div>
    </div>
  )
}