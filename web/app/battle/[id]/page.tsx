'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { calcDamage, REALM_SKILLS, calcGoldTransfer } from '@/lib/battle'
import { getTierStyle } from '@/lib/types'

interface Fighter {
  userId: string
  name: string
  realm: string
  maxHp: number
  currentHp: number
  attack: number
  defence: number
  isBracing: boolean
  isStunned: boolean
  defenceDebuffMultiplier: number
  defenceDebuffUntil: number
  attackDebuffMultiplier: number
  attackDebuffUntil: number
  realmSkillLastUsed: number
  gold: number
}

type BattlePhase = 'waiting' | 'fighting' | 'ended'

const RECONNECT_WINDOW = 5000 // 5 seconds

export default function BattlePage() {
  const router     = useRouter()
  const { id: battleId } = useParams<{ id: string }>()
  const params     = useSearchParams()

  const hp      = Number(params.get('hp')      ?? 0)
  const attack  = Number(params.get('attack')  ?? 0)
  const defence = Number(params.get('defence') ?? 0)
  const realm   = params.get('realm') ?? 'academia'

  const [phase,    setPhase]    = useState<BattlePhase>('waiting')
  const [me,       setMe]       = useState<Fighter | null>(null)
  const [opponent, setOpponent] = useState<Fighter | null>(null)
  const [userId,   setUserId]   = useState<string | null>(null)
  const [log,      setLog]      = useState<string[]>([])
  const [winner,   setWinner]   = useState<string | null>(null)
  const [goldDelta, setGoldDelta] = useState<number | null>(null)
  const [oppDisconnected, setOppDisconnected] = useState(false)
  const [reconnectTimer, setReconnectTimer]   = useState<number>(0)

  // Cooldown states (timestamps)
  const [realmCooldownUntil, setRealmCooldownUntil] = useState(0)
  const [bracingUntil,       setBracingUntil]       = useState(0)
  const [now, setNow] = useState(Date.now())

  const channelRef   = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const meRef        = useRef<Fighter | null>(null)
  const opponentRef  = useRef<Fighter | null>(null)
  const logRef       = useRef<HTMLDivElement>(null)

  // Keep refs in sync
  useEffect(() => { meRef.current = me }, [me])
  useEffect(() => { opponentRef.current = opponent }, [opponent])

  // Tick clock for cooldown display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  function addLog(msg: string) {
    setLog(prev => [...prev.slice(-50), msg])
  }

  const endBattle = useCallback(async (winnerId: string, loser: Fighter, winnerFighter: Fighter) => {
    setPhase('ended')
    setWinner(winnerId === userId ? 'you' : 'opponent')

    const gold = calcGoldTransfer(loser.gold)
    setGoldDelta(winnerId === userId ? gold : -gold)

    // Save battle result to DB
    await fetch('/api/battle/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battle_id: battleId, winner_id: winnerId, gold_transferred: gold }),
    })
  }, [userId, battleId])

  useEffect(() => {
    const supabase = createClient()
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUserId(user.id)

      // Fetch my character for gold info
      const res  = await fetch('/api/character/get')
      const data = await res.json()
      const gold = data.character?.gold ?? 0

      // Init my fighter state
      const myFighter: Fighter = {
        userId:   user.id,
        name:     data.character?.name ?? 'You',
        realm,
        maxHp:    hp,
        currentHp: hp,
        attack,
        defence,
        isBracing: false,
        isStunned: false,
        defenceDebuffMultiplier: 1.0,
        defenceDebuffUntil: 0,
        attackDebuffMultiplier: 1.0,
        attackDebuffUntil: 0,
        realmSkillLastUsed: 0,
        gold,
      }
      setMe(myFighter)
      meRef.current = myFighter

      // Subscribe to battle channel
      const channel = supabase.channel(`battle:${battleId}`, {
        config: { presence: { key: user.id } }
      })

      channelRef.current = channel

      // Handle presence — track who is in the battle
      channel.on('presence', { event: 'join' }, ({ key, newPresences }: { key: string, newPresences: { name: string, hp: number, attack: number, defence: number, gold: number, realm: string }[] }) => {
        if (key !== user.id) {
          const p = newPresences[0]
          const oppFighter: Fighter = {
            userId: key,
            name: p.name,
            realm: p.realm,
            maxHp: p.hp,
            currentHp: p.hp,
            attack: p.attack,
            defence: p.defence,
            isBracing: false,
            isStunned: false,
            defenceDebuffMultiplier: 1.0,
            defenceDebuffUntil: 0,
            attackDebuffMultiplier: 1.0,
            attackDebuffUntil: 0,
            realmSkillLastUsed: 0,
            gold: p.gold,
          }
          setOpponent(oppFighter)
          opponentRef.current = oppFighter
          setPhase('fighting')
          setOppDisconnected(false)
          if (disconnectTimer) clearTimeout(disconnectTimer)
          addLog('⚔️ Battle started!')
        }
      })

      channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
        if (key !== user.id) {
          setOppDisconnected(true)
          addLog('⚠️ Opponent disconnected — 5 seconds to reconnect...')
          let count = RECONNECT_WINDOW / 1000
          setReconnectTimer(count)
          disconnectTimer = setInterval(() => {
            count--
            setReconnectTimer(count)
            if (count <= 0) {
              clearInterval(disconnectTimer!)
              // Opponent forfeited
              const opp = opponentRef.current
              const me2 = meRef.current
              if (opp && me2) endBattle(user.id, opp, me2)
            }
          }, 1000)
        }
      })

      // Handle battle actions broadcast
      channel.on('broadcast', { event: 'action' }, ({ payload }: { payload: { type: string, attackerId: string, damage?: number, heal?: number, effect?: string, timestamp: number } }) => {
        const { type, attackerId, damage, heal, effect, timestamp } = payload
        const isOpponentAction = attackerId !== user.id

        if (!isOpponentAction) return // we already applied our own action locally

        const currentMe = meRef.current
        if (!currentMe) return

        const ts = timestamp

        if (type === 'strike' || type === 'realm_offensive') {
          // Apply damage to me
          const incomingDamage = damage ?? 0
          const bracingNow = Date.now() < bracingUntil
          const reduced = bracingNow ? Math.round(incomingDamage * 0.7) : incomingDamage
          const newHp = Math.max(0, currentMe.currentHp - reduced)
          setMe(prev => prev ? { ...prev, currentHp: newHp } : prev)
          addLog(`${bracingNow ? '🛡️ Blocked! ' : ''}Opponent hit you for ${reduced}${bracingNow ? ` (was ${incomingDamage})` : ''}`)
          if (newHp <= 0) {
            endBattle(attackerId, currentMe, opponentRef.current!)
          }
        }

        if (type === 'brace') {
          addLog('🛡️ Opponent is bracing!')
          setOpponent(prev => prev ? { ...prev, isBracing: true } : prev)
          setTimeout(() => setOpponent(prev => prev ? { ...prev, isBracing: false } : prev), 1000)
        }

        if (effect === 'defence_debuff') {
          const until = ts + (REALM_SKILLS[currentMe.realm]?.debuffDuration ?? 2) * 1000
          setMe(prev => prev ? { ...prev, defenceDebuffMultiplier: 0.75, defenceDebuffUntil: until } : prev)
          addLog('📖 Opponent reduced your Defence by 25%!')
          setTimeout(() => setMe(prev => prev ? { ...prev, defenceDebuffMultiplier: 1.0 } : prev), until - Date.now())
        }

        if (effect === 'attack_debuff') {
          const until = ts + (REALM_SKILLS[currentMe.realm]?.debuffDuration ?? 3) * 1000
          setMe(prev => prev ? { ...prev, attackDebuffMultiplier: 0.80, attackDebuffUntil: until } : prev)
          addLog('⚖️ Opponent reduced your Attack by 20%!')
          setTimeout(() => setMe(prev => prev ? { ...prev, attackDebuffMultiplier: 1.0 } : prev), until - Date.now())
        }

        if (effect === 'stun') {
          setMe(prev => prev ? { ...prev, isStunned: true } : prev)
          addLog('🎨 You are stunned for 1 second!')
          setTimeout(() => setMe(prev => prev ? { ...prev, isStunned: false } : prev), 1000)
        }

        if (type === 'realm_heal') {
          addLog(`⚕️ Opponent healed ${heal} HP!`)
          setOpponent(prev => prev ? { ...prev, currentHp: Math.min(prev.maxHp, prev.currentHp + (heal ?? 0)) } : prev)
        }
      })

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Track presence with our stats so opponent knows them
          await channel.track({
            name: data.character?.name ?? 'Unknown',
            hp,
            attack,
            defence,
            gold,
            realm,
          })
        }
      })
    }

    init()

    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [battleId])

  // ── Keyboard + mouse controls ─────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space')  { e.preventDefault(); handleBrace() }
      if (e.code === 'KeyQ')   { e.preventDefault(); handleRealmSkill() }
    }
    function onContextMenu(e: MouseEvent) {
      e.preventDefault()
      handleStrike()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [phase])

  // ── Skill handlers ─────────────────────────────────────────────────────────

  function fireAction(type: string, payload: Record<string, unknown>) {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'action',
      payload: { ...payload, type, attackerId: userId, timestamp: Date.now() },
    })
  }

  function handleStrike() {
    const currentMe = meRef.current
    const opp       = opponentRef.current
    if (!currentMe || !opp || phase !== 'fighting' || currentMe.isStunned) return

    const effectiveAttack  = currentMe.attack * currentMe.attackDebuffMultiplier
    const effectiveDefence = opp.defence * opp.defenceDebuffMultiplier
    const damage = calcDamage(effectiveAttack, effectiveDefence, 1.0, opp.isBracing)

    // Apply damage to opponent locally
    const newOppHp = Math.max(0, opp.currentHp - damage)
    setOpponent(prev => prev ? { ...prev, currentHp: newOppHp } : prev)
    addLog(`⚔️ You struck for ${damage} damage!`)

    // Broadcast to opponent
    fireAction('strike', { damage })

    if (newOppHp <= 0) endBattle(userId!, opp, currentMe)
  }

  function handleBrace() {
    const currentMe = meRef.current
    if (!currentMe || phase !== 'fighting' || currentMe.isStunned) return

    setBracingUntil(Date.now() + 1000)
    setMe(prev => prev ? { ...prev, isBracing: true } : prev)
    setTimeout(() => setMe(prev => prev ? { ...prev, isBracing: false } : prev), 1000)
    addLog('🛡️ You braced!')
    fireAction('brace', {})
  }

  function handleRealmSkill() {
    const currentMe = meRef.current
    const opp       = opponentRef.current
    if (!currentMe || !opp || phase !== 'fighting' || currentMe.isStunned) return

    const skill    = REALM_SKILLS[realm]
    if (!skill) return
    const cooldownMs = skill.cooldown * 1000
    if (Date.now() - currentMe.realmSkillLastUsed < cooldownMs) return

    const now2 = Date.now()
    setMe(prev => prev ? { ...prev, realmSkillLastUsed: now2 } : prev)
    setRealmCooldownUntil(now2 + cooldownMs)

    const effectiveAttack  = currentMe.attack * currentMe.attackDebuffMultiplier
    const effectiveDefence = opp.defence * opp.defenceDebuffMultiplier

    // Offensive realm skills
    if (skill.multiplier) {
      const damage = calcDamage(effectiveAttack, effectiveDefence, skill.multiplier, opp.isBracing)
      const newOppHp = Math.max(0, opp.currentHp - damage)
      setOpponent(prev => prev ? { ...prev, currentHp: newOppHp } : prev)
      addLog(`${skill.icon} ${skill.name}: ${damage} damage!`)
      fireAction('realm_offensive', { damage })
      if (newOppHp <= 0) endBattle(userId!, opp, currentMe)
    }

    // Stun check
    if (skill.stunChance && Math.random() < skill.stunChance) {
      fireAction('realm_offensive', { damage: 0, effect: 'stun' })
      addLog(`${skill.icon} Stunned opponent!`)
    }

    // Heal
    if (skill.healPercent) {
      const healAmount = Math.round(currentMe.maxHp * skill.healPercent)
      setMe(prev => prev ? { ...prev, currentHp: Math.min(prev.maxHp, prev.currentHp + healAmount) } : prev)
      addLog(`${skill.icon} You healed ${healAmount} HP!`)
      fireAction('realm_heal', { heal: healAmount })
    }

    // Defence debuff
    if (skill.defenceDebuff) {
      const until = now2 + (skill.debuffDuration ?? 2) * 1000
      setOpponent(prev => prev ? { ...prev, defenceDebuffMultiplier: 1 - skill.defenceDebuff!, defenceDebuffUntil: until } : prev)
      addLog(`${skill.icon} Reduced opponent's Defence by ${Math.round(skill.defenceDebuff * 100)}%!`)
      fireAction('realm_debuff', { effect: 'defence_debuff' })
      setTimeout(() => setOpponent(prev => prev ? { ...prev, defenceDebuffMultiplier: 1.0 } : prev), skill.debuffDuration! * 1000)
    }

    // Attack debuff
    if (skill.attackDebuff) {
      const until = now2 + (skill.debuffDuration ?? 3) * 1000
      setOpponent(prev => prev ? { ...prev, attackDebuffMultiplier: 1 - skill.attackDebuff!, attackDebuffUntil: until } : prev)
      addLog(`${skill.icon} Reduced opponent's Attack by ${Math.round(skill.attackDebuff * 100)}%!`)
      fireAction('realm_debuff', { effect: 'attack_debuff' })
      setTimeout(() => setOpponent(prev => prev ? { ...prev, attackDebuffMultiplier: 1.0 } : prev), skill.debuffDuration! * 1000)
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const realmCooldownLeft = Math.max(0, (realmCooldownUntil - now) / 1000)
  const realmSkill = REALM_SKILLS[realm]

  function HpBar({ fighter, flip = false }: { fighter: Fighter, flip?: boolean }) {
    const pct = Math.round((fighter.currentHp / fighter.maxHp) * 100)
    const color = pct > 50 ? '#1D9E75' : pct > 25 ? '#EF9F27' : '#E24B4A'
    const ts = getTierStyle(fighter.maxHp + fighter.attack + fighter.defence)
    return (
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: flip ? 'flex-end' : 'flex-start', marginBottom: '4px', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.85rem', color: '#e8e0f0' }}>{fighter.name}</span>
          <span style={{ padding: '0.1rem 0.5rem', background: ts.bg + '22', border: `1px solid ${ts.color}44`, borderRadius: '999px', fontSize: '0.55rem', color: ts.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{ts.name}</span>
        </div>
        <div style={{ height: '12px', background: 'rgba(155,114,207,0.1)', borderRadius: '6px', overflow: 'hidden', direction: flip ? 'rtl' : 'ltr' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '6px', transition: 'width 0.2s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: flip ? 'flex-end' : 'flex-start', marginTop: '4px' }}>
          <span style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.8rem', color: '#6b5c80' }}>
            {fighter.currentHp.toLocaleString()} / {fighter.maxHp.toLocaleString()}
          </span>
        </div>
        {fighter.isBracing && <div style={{ fontSize: '0.7rem', color: '#378ADD', marginTop: '2px' }}>🛡️ Bracing</div>}
        {fighter.isStunned && <div style={{ fontSize: '0.7rem', color: '#EF9F27', marginTop: '2px' }}>⚡ Stunned</div>}
        {fighter.defenceDebuffUntil > Date.now() && <div style={{ fontSize: '0.7rem', color: '#E24B4A', marginTop: '2px' }}>📖 -25% Defence</div>}
        {fighter.attackDebuffUntil > Date.now() && <div style={{ fontSize: '0.7rem', color: '#E24B4A', marginTop: '2px' }}>⚖️ -20% Attack</div>}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"Cinzel", serif', padding: '1.5rem', color: '#e8e0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .pulse { animation: pulse 1s ease-in-out infinite; }
        .skill-btn { transition: all 0.1s; }
        .skill-btn:active { transform: scale(0.95); }
      `}</style>

      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        {/* Phase: waiting */}
        {phase === 'waiting' && (
          <div style={{ textAlign: 'center', marginTop: '6rem' }}>
            <p className="pulse" style={{ fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '1.1rem' }}>
              Waiting for opponent to join...
            </p>
          </div>
        )}

        {/* Phase: fighting or ended */}
        {(phase === 'fighting' || phase === 'ended') && me && opponent && (
          <>
            {/* HP bars */}
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <HpBar fighter={me} />
              <div style={{ fontSize: '1rem', color: '#4a3860', fontWeight: 700, paddingTop: '8px' }}>VS</div>
              <HpBar fighter={opponent} flip />
            </div>

            {/* Disconnect warning */}
            {oppDisconnected && (
              <div className="pulse" style={{ textAlign: 'center', color: '#EF9F27', fontFamily: '"Crimson Text", serif', marginBottom: '1rem', fontSize: '0.9rem' }}>
                ⚠️ Opponent disconnected — forfeiting in {reconnectTimer}s...
              </div>
            )}

            {/* Battle ended overlay */}
            {phase === 'ended' && (
              <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(255,255,255,0.03)', border: `1px solid ${winner === 'you' ? 'rgba(30,120,80,0.4)' : 'rgba(163,45,45,0.4)'}`, borderRadius: '16px', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{winner === 'you' ? '🏆' : '💀'}</div>
                <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem', color: winner === 'you' ? '#1D9E75' : '#E24B4A' }}>
                  {winner === 'you' ? 'Victory!' : 'Defeated'}
                </h2>
                {goldDelta !== null && (
                  <p style={{ fontFamily: '"Crimson Text", serif', color: goldDelta > 0 ? '#BA7517' : '#E24B4A', fontSize: '1rem', margin: '0 0 1.5rem' }}>
                    {goldDelta > 0 ? `+${goldDelta}` : goldDelta} gold
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                  <button onClick={() => router.push('/map')} style={{ padding: '0.6rem 1.5rem', background: 'rgba(155,114,207,0.2)', border: '1px solid rgba(155,114,207,0.4)', borderRadius: '8px', color: '#c8a8f0', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    Back to map
                  </button>
                  <button onClick={() => router.push('/profile')} style={{ padding: '0.6rem 1.5rem', background: 'transparent', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '8px', color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    My profile
                  </button>
                </div>
              </div>
            )}

            {/* Battle log */}
            <div ref={logRef} style={{ height: '140px', overflowY: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,114,207,0.1)', borderRadius: '10px', padding: '0.75rem', marginBottom: '1.5rem' }}>
              {log.length === 0 && <p style={{ fontFamily: '"Crimson Text", serif', color: '#3a2e50', fontSize: '0.85rem', margin: 0 }}>Battle log...</p>}
              {log.map((entry, i) => (
                <p key={i} style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.85rem', margin: '2px 0' }}>{entry}</p>
              ))}
            </div>

            {/* Skill buttons */}
            {phase === 'fighting' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                {/* Strike */}
                <button className="skill-btn" onClick={handleStrike} disabled={me.isStunned}
                  style={{ padding: '1rem 0.5rem', background: me.isStunned ? 'rgba(255,255,255,0.03)' : 'rgba(239,159,39,0.15)', border: `1px solid ${me.isStunned ? 'rgba(155,114,207,0.1)' : 'rgba(239,159,39,0.4)'}`, borderRadius: '10px', cursor: me.isStunned ? 'not-allowed' : 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>⚔️</div>
                  <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#e8e0f0' }}>Strike</div>
                  <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.75rem', color: '#6b5c80', marginTop: '2px' }}>1.0× · Right click</div>
                </button>

                {/* Brace */}
                <button className="skill-btn" onClick={handleBrace} disabled={me.isStunned}
                  style={{ padding: '1rem 0.5rem', background: me.isStunned ? 'rgba(255,255,255,0.03)' : 'rgba(55,138,221,0.15)', border: `1px solid ${me.isStunned ? 'rgba(155,114,207,0.1)' : 'rgba(55,138,221,0.4)'}`, borderRadius: '10px', cursor: me.isStunned ? 'not-allowed' : 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>🛡️</div>
                  <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#e8e0f0' }}>Brace</div>
                  <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.75rem', color: '#6b5c80', marginTop: '2px' }}>-30% dmg · Space</div>
                </button>

                {/* Realm skill */}
                <button className="skill-btn" onClick={handleRealmSkill}
                  disabled={me.isStunned || realmCooldownLeft > 0}
                  style={{ padding: '1rem 0.5rem', background: (me.isStunned || realmCooldownLeft > 0) ? 'rgba(255,255,255,0.03)' : 'rgba(155,114,207,0.15)', border: `1px solid ${(me.isStunned || realmCooldownLeft > 0) ? 'rgba(155,114,207,0.1)' : 'rgba(155,114,207,0.4)'}`, borderRadius: '10px', cursor: (me.isStunned || realmCooldownLeft > 0) ? 'not-allowed' : 'pointer', textAlign: 'center', position: 'relative' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{realmSkill?.icon}</div>
                  <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.65rem', letterSpacing: '0.1em', color: '#e8e0f0' }}>{realmSkill?.name}</div>
                  {realmCooldownLeft > 0 ? (
                    <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.75rem', color: '#E24B4A', marginTop: '2px' }}>{realmCooldownLeft.toFixed(1)}s</div>
                  ) : (
                    <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.75rem', color: '#6b5c80', marginTop: '2px' }}>{realmSkill?.cooldown}s cd · Q</div>
                  )}
                </button>
              </div>
            )}

            {/* Stats reminder */}
            {phase === 'fighting' && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem' }}>
                {[{ label: '❤️ HP', val: me.currentHp }, { label: '⚔️ ATK', val: me.attack }, { label: '🛡️ DEF', val: me.defence }].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: '"Crimson Text", serif', color: '#4a3860', fontSize: '0.75rem' }}>{s.label}</div>
                    <div style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.9rem' }}>{s.val.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
