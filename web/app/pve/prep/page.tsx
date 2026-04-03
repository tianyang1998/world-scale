'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { getTierStyle } from '@/lib/types'
import { REALM_SKILLS } from '@/lib/battle'
import { BOSSES } from '@/lib/boss'

interface CharacterData {
  name: string
  total_power: number
  gold: number
  realms: Record<string, { power: number }>
}

function PvEPrepInner() {
  const router = useRouter()
  const params = useSearchParams()
  const battleId = params.get('battle_id')
  const bossTier = params.get('boss_tier') ?? ''

  const [character, setCharacter] = useState<CharacterData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [hp,        setHp]        = useState(0)
  const [attack,    setAttack]    = useState(0)
  const [defence,   setDefence]   = useState(0)

  const supabase = createClient()
  const boss = BOSSES[bossTier]

  const [selectedRealm, setSelectedRealm] = useState<string>('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const res  = await fetch('/api/character/get')
      const data = await res.json()
      if (!data.character) { router.push('/'); return }

      const c = data.character as CharacterData
      setCharacter(c)
      setSelectedRealm(Object.keys(c.realms)[0] ?? 'academia')

      const total = c.total_power
      setHp(Math.floor(total * 0.40))
      setAttack(Math.floor(total * 0.35))
      setDefence(total - Math.floor(total * 0.40) - Math.floor(total * 0.35))
      setLoading(false)
    }
    load()
  }, [])

  function handleSlider(stat: 'hp' | 'attack' | 'defence', value: number) {
    if (!character) return
    const total = character.total_power
    const remaining = total - value

    if (stat === 'hp') {
      const ratio = defence / (attack + defence) || 0.5
      const newDefence = Math.round(remaining * ratio)
      setHp(value); setAttack(remaining - newDefence); setDefence(newDefence)
    } else if (stat === 'attack') {
      const ratio = defence / (hp + defence) || 0.5
      const newDefence = Math.round(remaining * ratio)
      setAttack(value); setHp(remaining - newDefence); setDefence(newDefence)
    } else {
      const ratio = attack / (hp + attack) || 0.5
      const newAttack = Math.round(remaining * ratio)
      setDefence(value); setAttack(newAttack); setHp(remaining - newAttack)
    }
  }

  function handleEnterBoss() {
    if (!character || !battleId) return
    router.push(
      `/pve/${battleId}?boss_tier=${encodeURIComponent(bossTier)}&hp=${hp}&attack=${attack}&defence=${defence}&realm=${selectedRealm}`
    )
  }

  if (loading || !character) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b5c80', fontFamily: '"Crimson Text", serif', fontSize: '1.1rem' }}>Preparing for the lair...</p>
      </div>
    )
  }

  const total      = character.total_power
  const tierStyle  = getTierStyle(total)
  const realmSkill = REALM_SKILLS[selectedRealm]
  const statColor  = { hp: '#E24B4A', attack: '#EF9F27', defence: '#378ADD' }
  const availableRealms = Object.keys(character.realms)

  const REALM_ICONS: Record<string, string> = {
    academia: '📚', tech: '⚡', medicine: '⚕️', creative: '🎨', law: '⚖️',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"Cinzel", serif', padding: '2rem', color: '#e8e0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');
        input[type=range] { -webkit-appearance: none; width: 100%; height: 6px; border-radius: 3px; outline: none; cursor: pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; cursor: pointer; }
        @keyframes flicker { 0%,100%{opacity:1} 45%{opacity:0.85} 50%{opacity:0.7} 55%{opacity:0.9} }
        .flicker { animation: flicker 3s ease-in-out infinite; }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(99,57,134,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(163,45,45,0.1) 0%, transparent 50%)` }} />

      <div style={{ maxWidth: '560px', margin: '0 auto', position: 'relative' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <p style={{ fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.9rem', letterSpacing: '0.1em', margin: '0 0 0.5rem' }}>
            PREPARE FOR THE LAIR
          </p>
          <h1 style={{ margin: 0, fontSize: '1.4rem', letterSpacing: '0.1em' }}>{character.name}</h1>
          <div style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.2rem 0.8rem', background: tierStyle.bg + '22', border: `1px solid ${tierStyle.color}55`, borderRadius: '999px', color: tierStyle.color, fontSize: '0.65rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            {tierStyle.name}
          </div>
        </div>

        {/* You vs Boss banner */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '0.75rem', background: 'rgba(155,114,207,0.08)', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: '#6b5c80', letterSpacing: '0.1em', marginBottom: '4px' }}>YOU</div>
            <div style={{ fontSize: '1rem', color: '#e8e0f0', fontWeight: 600 }}>{character.name}</div>
            <div style={{ fontFamily: '"Crimson Text", serif', color: '#9b72cf', fontSize: '0.9rem' }}>{total.toLocaleString()} power</div>
          </div>
          <div style={{ fontSize: '1.2rem', color: '#4a3860', fontWeight: 700 }}>VS</div>
          <div style={{ flex: 1, textAlign: 'center', padding: '0.75rem', background: 'rgba(163,45,45,0.08)', border: '1px solid rgba(163,45,45,0.2)', borderRadius: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: '#6b5c80', letterSpacing: '0.1em', marginBottom: '4px' }}>BOSS</div>
            <div className="flicker" style={{ fontSize: '1.5rem' }}>{boss?.icon ?? '👹'}</div>
            <div style={{ fontSize: '0.9rem', color: '#f09595', fontWeight: 600 }}>{boss?.name ?? 'Unknown'}</div>
            <div style={{ fontFamily: '"Crimson Text", serif', color: '#BA7517', fontSize: '0.8rem' }}>💰 {boss?.goldReward.toLocaleString()} gold reward</div>
          </div>
        </div>

        {/* Boss lore */}
        {boss?.lore && (
          <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(163,45,45,0.05)', border: '1px solid rgba(163,45,45,0.15)', borderRadius: '10px', fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.88rem', fontStyle: 'italic', lineHeight: 1.5, textAlign: 'center' }}>
            "{boss.lore}"
          </div>
        )}

        {/* Stat distribution */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,114,207,0.15)', borderRadius: '16px', padding: '1.75rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: '0 0 1.5rem', fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.95rem', textAlign: 'center' }}>
            Distribute your {total.toLocaleString()} power across HP, Attack, and Defence
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.3rem 1rem', background: hp + attack + defence === total ? 'rgba(30,120,80,0.15)' : 'rgba(163,45,45,0.15)', border: `1px solid ${hp + attack + defence === total ? 'rgba(30,120,80,0.3)' : 'rgba(163,45,45,0.3)'}`, borderRadius: '999px', fontSize: '0.75rem', fontFamily: '"Crimson Text", serif', color: hp + attack + defence === total ? '#5dcaa5' : '#f09595' }}>
              {(hp + attack + defence).toLocaleString()} / {total.toLocaleString()} allocated
            </div>
          </div>

          {(['hp', 'attack', 'defence'] as const).map(stat => {
            const val   = stat === 'hp' ? hp : stat === 'attack' ? attack : defence
            const label = stat === 'hp' ? '❤️ HP' : stat === 'attack' ? '⚔️ Attack' : '🛡️ Defence'
            const color = statColor[stat]
            const pct   = Math.round((val / total) * 100)
            return (
              <div key={stat} style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.95rem' }}>{label}</span>
                  <span style={{ fontFamily: '"Crimson Text", serif', color, fontSize: '0.95rem' }}>
                    {val.toLocaleString()} <span style={{ color: '#4a3860', fontSize: '0.8rem' }}>({pct}%)</span>
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={total - 2}
                  value={val}
                  onChange={e => handleSlider(stat, Number(e.target.value))}
                  style={{ background: `linear-gradient(to right, ${color} ${pct}%, rgba(155,114,207,0.15) ${pct}%)` }}
                />
              </div>
            )
          })}
        </div>

        {/* Realm picker — only shown if player has multiple realms */}
        {availableRealms.length > 1 && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,114,207,0.15)', borderRadius: '16px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4a3860' }}>Choose your realm</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {availableRealms.map(r => {
                const skill = REALM_SKILLS[r]
                const isSelected = r === selectedRealm
                return (
                  <button
                    key={r}
                    onClick={() => setSelectedRealm(r)}
                    style={{ flex: 1, minWidth: '80px', padding: '0.6rem 0.5rem', background: isSelected ? 'rgba(155,114,207,0.2)' : 'transparent', border: `1px solid ${isSelected ? 'rgba(155,114,207,0.5)' : 'rgba(155,114,207,0.15)'}`, borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}
                  >
                    <div style={{ fontSize: '1.2rem' }}>{REALM_ICONS[r] ?? '🌐'}</div>
                    <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.55rem', color: isSelected ? '#c8a8f0' : '#6b5c80', letterSpacing: '0.08em', marginTop: '3px', textTransform: 'capitalize' }}>{r}</div>
                    {skill && <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.7rem', color: isSelected ? '#9b72cf' : '#4a3860', marginTop: '2px' }}>{skill.icon} {skill.name}</div>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Skills preview */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,114,207,0.15)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: '0 0 1rem', fontSize: '0.65rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#4a3860' }}>Your skills in battle</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {[
              { icon: '⚔️', name: 'Strike',    desc: '1.0× Attack damage · no cooldown' },
              { icon: '🛡️', name: 'Brace',     desc: '30% damage reduction · no cooldown' },
              { icon: realmSkill?.icon, name: realmSkill?.name, desc: `${realmSkill?.desc} · ${realmSkill?.cooldown}s cooldown` },
            ].map(s => (
              <div key={s.name} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '16px' }}>{s.icon}</span>
                <div>
                  <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.75rem', color: '#c8a8f0' }}>{s.name}</span>
                  <span style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.85rem', color: '#4a3860', marginLeft: '8px' }}>{s.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Party note */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontFamily: '"Crimson Text", serif', color: '#4a3860', fontSize: '0.85rem', fontStyle: 'italic' }}>
          Other players of the same tier will join you in the lobby.
        </div>

        {/* Enter button */}
        <button
          onClick={handleEnterBoss}
          disabled={!battleId}
          style={{ width: '100%', padding: '1rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.4), rgba(99,57,134,0.4))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '10px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.85rem', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: battleId ? 'pointer' : 'not-allowed' }}
        >
          Enter the Lair ⚔️
        </button>

        <button
          onClick={() => router.push('/map')}
          style={{ width: '100%', marginTop: '0.75rem', padding: '0.6rem', background: 'transparent', border: 'none', color: '#4a3860', fontFamily: '"Crimson Text", serif', fontSize: '0.9rem', cursor: 'pointer' }}
        >
          ← Back to map
        </button>
      </div>
    </div>
  )
}

export default function PvEPrepPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b5c80', fontFamily: '"Crimson Text", serif', fontSize: '1.1rem' }}>Preparing for the lair...</p>
      </div>
    }>
      <PvEPrepInner />
    </Suspense>
  )
}
