'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { getTierStyle, TIERS } from '@/lib/types'
import { isSameTier } from '@/lib/battle'
import { BOSSES } from '@/lib/boss'

interface MapPlayer {
  userId: string
  name: string
  totalPower: number
  tier: string
  realm: string
  gold: number
  x: number
  y: number
}

interface ChallengeRequest {
  fromId: string
  fromName: string
  battleId: string
}

// Tier zones — vertical bands on the map, weakest left, strongest right
const TIER_ZONES: Record<string, { x: number; width: number; color: string }> = {
  Apprentice:  { x: 0,    width: 120, color: 'rgba(136,135,128,0.08)' },
  Initiate:    { x: 120,  width: 120, color: 'rgba(136,135,128,0.05)' },
  Acolyte:     { x: 240,  width: 120, color: 'rgba(99,153,34,0.08)'   },
  Journeyman:  { x: 360,  width: 120, color: 'rgba(99,153,34,0.05)'   },
  Adept:       { x: 480,  width: 120, color: 'rgba(99,153,34,0.08)'   },
  Scholar:     { x: 600,  width: 120, color: 'rgba(55,138,221,0.08)'  },
  Sage:        { x: 720,  width: 120, color: 'rgba(55,138,221,0.05)'  },
  Arcanist:    { x: 840,  width: 120, color: 'rgba(55,138,221,0.08)'  },
  Exemplar:    { x: 960,  width: 120, color: 'rgba(127,119,221,0.08)' },
  Vanguard:    { x: 1080, width: 120, color: 'rgba(127,119,221,0.05)' },
  Master:      { x: 1200, width: 120, color: 'rgba(186,117,23,0.08)'  },
  Grandmaster: { x: 1320, width: 120, color: 'rgba(186,117,23,0.05)'  },
  Champion:    { x: 1440, width: 120, color: 'rgba(216,90,48,0.08)'   },
  Paragon:     { x: 1560, width: 120, color: 'rgba(216,90,48,0.05)'   },
  Legend:      { x: 1680, width: 120, color: 'rgba(163,45,45,0.12)'   },
}

// Boss lair — occupies the right 30px of each tier zone
const BOSS_ZONE_WIDTH = 30

const MAP_WIDTH  = 1800
const MAP_HEIGHT = 600
const PLAYER_SPEED = 4

const REALM_ICONS: Record<string, string> = {
  academia: '📚', tech: '⚡', medicine: '⚕️', creative: '🎨', law: '⚖️',
}

// Check if a world-space X position is inside a tier's boss zone
function getBossZoneTier(x: number): string | null {
  for (const [tier, zone] of Object.entries(TIER_ZONES)) {
    const bossZoneX = zone.x + zone.width - BOSS_ZONE_WIDTH
    if (x >= bossZoneX && x <= zone.x + zone.width) return tier
  }
  return null
}

export default function MapPage() {
  const router = useRouter()
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const channelRef    = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const keysRef       = useRef<Set<string>>(new Set())
  const myPlayerRef   = useRef<MapPlayer | null>(null)
  const playersRef    = useRef<Map<string, MapPlayer>>(new Map())
  const animFrameRef  = useRef<number>(0)
  const lastBroadcast = useRef<number>(0)

  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [userId,         setUserId]         = useState<string | null>(null)
  const [myTier,         setMyTier]         = useState<string>('')
  const [myRealm,        setMyRealm]        = useState<string>('academia')
  const [myStats,        setMyStats]        = useState<{ hp: number; attack: number; defence: number } | null>(null)
  const [challenge,      setChallenge]      = useState<ChallengeRequest | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<MapPlayer | null>(null)
  const [bossPrompt,     setBossPrompt]     = useState<string | null>(null) // tier name of boss zone entered
  const [enteringBoss,   setEnteringBoss]   = useState(false)
  const [pveInvite,      setPveInvite]      = useState<{ fromName: string; battleId: string; bossName: string; bossTier: string } | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)

  // ── Canvas draw loop ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const me = myPlayerRef.current
    const cw = canvas.width
    const ch = canvas.height

    const camX = me ? Math.max(0, Math.min(me.x - cw / 2, MAP_WIDTH - cw)) : 0

    ctx.clearRect(0, 0, cw, ch)

    // Background
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, cw, ch)

    // Tier zones
    TIERS.forEach(t => {
      const zone = TIER_ZONES[t.name]
      if (!zone) return
      const screenX = zone.x - camX
      if (screenX + zone.width < 0 || screenX > cw) return

      // Main zone
      ctx.fillStyle = zone.color
      ctx.fillRect(screenX, 0, zone.width, ch)

      // Zone label
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.font = '500 11px "Cinzel", serif'
      ctx.textAlign = 'center'
      ctx.fillText(t.name, screenX + zone.width / 2, 20)

      // Boss lair — dark red strip on right edge of zone
      const bossX = screenX + zone.width - BOSS_ZONE_WIDTH
      ctx.fillStyle = 'rgba(163,45,45,0.18)'
      ctx.fillRect(bossX, 0, BOSS_ZONE_WIDTH, ch)

      // Skull icon centered in boss zone
      ctx.font = '16px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('💀', bossX + BOSS_ZONE_WIDTH / 2, ch / 2)

      // "LAIR" label
      ctx.save()
      ctx.translate(bossX + BOSS_ZONE_WIDTH / 2, ch / 2 + 22)
      ctx.rotate(-Math.PI / 2)
      ctx.font = '500 7px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(240,149,149,0.4)'
      ctx.fillText('LAIR', 0, 0)
      ctx.restore()
    })

    // Vertical dividers
    ctx.strokeStyle = 'rgba(155,114,207,0.08)'
    ctx.lineWidth = 1
    TIERS.forEach(t => {
      const zone = TIER_ZONES[t.name]
      if (!zone) return
      const screenX = zone.x - camX
      ctx.beginPath()
      ctx.moveTo(screenX, 0)
      ctx.lineTo(screenX, ch)
      ctx.stroke()
    })

    // Players
    playersRef.current.forEach(player => {
      const sx = player.x - camX
      const sy = player.y
      if (sx < -40 || sx > cw + 40) return

      const isMe    = player.userId === myPlayerRef.current?.userId
      const ts      = getTierStyle(player.totalPower)
      const sameTier = myPlayerRef.current ? isSameTier(player.tier, myPlayerRef.current.tier) : false

      ctx.beginPath()
      ctx.arc(sx, sy, 18, 0, Math.PI * 2)
      ctx.fillStyle = isMe ? ts.color : sameTier ? ts.bg : 'rgba(60,52,89,0.8)'
      ctx.fill()
      ctx.strokeStyle = isMe ? ts.color : sameTier ? ts.color : 'rgba(155,114,207,0.2)'
      ctx.lineWidth = isMe ? 3 : 1.5
      ctx.stroke()

      ctx.font = '14px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(REALM_ICONS[player.realm] ?? '🌐', sx, sy)

      ctx.font = '500 10px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = isMe ? '#e8e0f0' : 'rgba(200,168,240,0.7)'
      ctx.fillText(player.name.slice(0, 12), sx, sy + 32)

      if (!isMe && sameTier) {
        ctx.fillStyle = 'rgba(163,45,45,0.8)'
        ctx.beginPath()
        ctx.roundRect(sx - 18, sy - 32, 36, 14, 4)
        ctx.fill()
        ctx.fillStyle = '#f09595'
        ctx.font = '500 8px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('FIGHT', sx, sy - 25)
      }
    })

    animFrameRef.current = requestAnimationFrame(draw)
  }, [])

  // ── Movement loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const moveInterval = setInterval(() => {
      const me = myPlayerRef.current
      if (!me) return

      let moved = false
      const keys = keysRef.current

      if (keys.has('ArrowLeft')  || keys.has('a')) { me.x = Math.max(18, me.x - PLAYER_SPEED); moved = true }
      if (keys.has('ArrowRight') || keys.has('d')) { me.x = Math.min(MAP_WIDTH - 18, me.x + PLAYER_SPEED); moved = true }
      if (keys.has('ArrowUp')    || keys.has('w')) { me.y = Math.max(18, me.y - PLAYER_SPEED); moved = true }
      if (keys.has('ArrowDown')  || keys.has('s')) { me.y = Math.min(MAP_HEIGHT - 18, me.y + PLAYER_SPEED); moved = true }

      if (moved) {
        playersRef.current.set(me.userId, { ...me })

        // Check if player stepped into a boss zone
        const bossZoneTier = getBossZoneTier(me.x)
        if (bossZoneTier && bossZoneTier === myPlayerRef.current?.tier) {
          setBossPrompt(prev => prev ?? bossZoneTier) // only set if not already showing
        } else {
          setBossPrompt(null)
        }

        const now = Date.now()
        if (now - lastBroadcast.current > 100) {
          lastBroadcast.current = now
          channelRef.current?.send({
            type: 'broadcast',
            event: 'move',
            payload: { userId: me.userId, x: me.x, y: me.y },
          })
        }
      }
    }, 16)

    return () => clearInterval(moveInterval)
  }, [])

  // ── Canvas click → challenge ────────────────────────────────────────────────
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const me     = myPlayerRef.current
    if (!canvas || !me) return

    const rect   = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const camX   = Math.max(0, Math.min(me.x - canvas.width / 2, MAP_WIDTH - canvas.width))

    let hit: MapPlayer | null = null
    playersRef.current.forEach(player => {
      if (player.userId === myPlayerRef.current?.userId) return
      const sx   = player.x - camX
      const sy   = player.y
      const dist = Math.sqrt((clickX - sx) ** 2 + (clickY - sy) ** 2)
      if (dist < 22) hit = player
    })

    if (hit) setSelectedPlayer(hit)
  }

  // ── PvP challenge flow ──────────────────────────────────────────────────────
  async function sendChallenge(target: MapPlayer) {
    setSelectedPlayer(null)
    if (!isSameTier(myTier, target.tier)) {
      setError(`Cannot challenge ${target.name} — different tier (${target.tier})`)
      return
    }

    const res  = await fetch('/api/battle/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponent_id: target.userId }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }

    channelRef.current?.send({
      type: 'broadcast',
      event: 'challenge',
      payload: {
        toId:     target.userId,
        fromId:   myPlayerRef.current?.userId,
        fromName: myPlayerRef.current?.name ?? 'Unknown',
        battleId: data.battle_id,
      },
    })

    router.push(`/battle/prep?battle_id=${data.battle_id}&opponent_name=${encodeURIComponent(target.name)}&opponent_power=${target.totalPower}`)
  }

  // ── PvE enter boss lair ─────────────────────────────────────────────────────
  async function enterBossLair() {
    if (!bossPrompt || !myStats) return
    setEnteringBoss(true)

    const res  = await fetch('/api/pve/create', { method: 'POST' })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to enter boss lair')
      setEnteringBoss(false)
      return
    }

    // Broadcast invite to same-tier players on the map
    channelRef.current?.send({
      type: 'broadcast',
      event: 'pve_invite',
      payload: {
        fromId:    myPlayerRef.current?.userId,
        fromName:  myPlayerRef.current?.name ?? 'Unknown',
        fromTier:  myTier,
        battleId:  data.battle_id,
        bossName:  data.boss_name,
        bossTier:  data.boss_tier,
      },
    })

    router.push(
      `/pve/prep` +
      `?battle_id=${data.battle_id}` +
      `&boss_tier=${encodeURIComponent(data.boss_tier)}`
    )
  }

  // Join an existing PvE session from an invite — also goes through prep
  function joinBossLair(invite: { battleId: string; bossTier: string }) {
    setPveInvite(null)
    router.push(
      `/pve/prep` +
      `?battle_id=${encodeURIComponent(invite.battleId)}` +
      `&boss_tier=${encodeURIComponent(invite.bossTier)}`
    )
  }

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUserId(user.id)

      const res  = await fetch('/api/character/get')
      const data = await res.json()
      if (!data.character) { router.push('/'); return }

      const char = data.character
      const tier = getTierStyle(char.total_power).name
      setMyTier(tier)

      const primaryRealm = Object.keys(char.realms ?? {})[0] ?? 'academia'
      setMyRealm(primaryRealm)
      setMyStats({
        hp:      char.stats_hp      ?? 100,
        attack:  char.stats_attack  ?? 50,
        defence: char.stats_defence ?? 50,
      })

      const zone   = TIER_ZONES[tier] ?? { x: 0, width: 120 }
      const spawnX = zone.x + zone.width / 2
      const spawnY = MAP_HEIGHT / 2 + (Math.random() - 0.5) * 200

      const myPlayer: MapPlayer = {
        userId:     user.id,
        name:       char.name ?? 'Unknown',
        totalPower: char.total_power,
        tier,
        realm:      primaryRealm,
        gold:       char.gold ?? 1000,
        x:          spawnX,
        y:          spawnY,
      }

      myPlayerRef.current = myPlayer
      playersRef.current.set(user.id, myPlayer)
      setLoading(false)

      const channel = supabase.channel('map:global', {
        config: { presence: { key: user.id } }
      })
      channelRef.current = channel

      channel.on('presence', { event: 'join' }, ({ key, newPresences }: { key: string, newPresences: MapPlayer[] }) => {
        if (key !== user.id) {
          const p = newPresences[0] as MapPlayer
          playersRef.current.set(key, p)
        }
      })

      channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
        playersRef.current.delete(key)
      })

      channel.on('broadcast', { event: 'move' }, ({ payload }: { payload: { userId: string, x: number, y: number } }) => {
        const existing = playersRef.current.get(payload.userId)
        if (existing) playersRef.current.set(payload.userId, { ...existing, x: payload.x, y: payload.y })
      })

      channel.on('broadcast', { event: 'challenge' }, ({ payload }: { payload: { toId: string, fromId: string, fromName: string, battleId: string } }) => {
        if (payload.toId === user.id) {
          setChallenge({ fromId: payload.fromId, fromName: payload.fromName, battleId: payload.battleId })
        }
      })

      // PvE invite — show to same-tier players only
      channel.on('broadcast', { event: 'pve_invite' }, ({ payload }: { payload: { fromId: string, fromName: string, fromTier: string, battleId: string, bossName: string, bossTier: string } }) => {
        if (payload.fromId === user.id) return // ignore own broadcast
        if (payload.fromTier !== myPlayerRef.current?.tier) return // different tier
        setPveInvite({ fromName: payload.fromName, battleId: payload.battleId, bossName: payload.bossName, bossTier: payload.bossTier })
      })

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await channel.track(myPlayer)
      })

      animFrameRef.current = requestAnimationFrame(draw)
    }

    const onKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key)
    const onKeyUp   = (e: KeyboardEvent) => keysRef.current.delete(e.key)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)

    init()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
    }
  }, [draw])

  // ── Render ──────────────────────────────────────────────────────────────────
  const bossForPrompt = bossPrompt ? BOSSES[bossPrompt] : null

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"Cinzel", serif', color: '#e8e0f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');
        @keyframes flicker { 0%,100%{opacity:1} 45%{opacity:0.85} 50%{opacity:0.7} 55%{opacity:0.9} }
        .flicker { animation: flicker 3s ease-in-out infinite; }
      `}</style>

      {/* Nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '1px solid rgba(155,114,207,0.1)' }}>
        <h1 style={{ margin: 0, fontSize: '1.1rem', letterSpacing: '0.12em' }}>World Scale — Map</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => router.push('/')} style={{ padding: '0.4rem 1rem', background: 'transparent', border: '1px solid rgba(155,114,207,0.3)', borderRadius: '6px', color: '#9b72cf', fontFamily: '"Cinzel", serif', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Score</button>
          <button onClick={() => router.push('/profile')} style={{ padding: '0.4rem 1rem', background: 'transparent', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '6px', color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Profile</button>
          <button onClick={() => router.push('/leaderboard')} style={{ padding: '0.4rem 1rem', background: 'transparent', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '6px', color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Leaderboard</button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', marginTop: '6rem', color: '#6b5c80', fontFamily: '"Crimson Text", serif', fontSize: '1.1rem' }}>
          Entering the world...
        </div>
      )}

      {/* Map canvas */}
      {!loading && (
        <div style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            width={Math.min(typeof window !== 'undefined' ? window.innerWidth : 1200, 1200)}
            height={MAP_HEIGHT}
            onClick={handleCanvasClick}
            style={{ display: 'block', cursor: 'crosshair' }}
          />

          {/* Controls hint */}
          <div style={{ position: 'absolute', bottom: '12px', left: '12px', fontFamily: '"Crimson Text", serif', color: 'rgba(155,114,207,0.5)', fontSize: '0.8rem' }}>
            Move: WASD or Arrow keys · Click a player to challenge · Walk into 💀 to fight the boss
          </div>

          {/* My tier badge */}
          <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
            <div style={{ padding: '0.3rem 0.8rem', background: 'rgba(10,10,15,0.8)', border: '1px solid rgba(155,114,207,0.3)', borderRadius: '999px', fontSize: '0.65rem', letterSpacing: '0.15em', color: '#9b72cf' }}>
              {myTier}
            </div>
          </div>
        </div>
      )}

      {/* Boss lair prompt */}
      {bossPrompt && bossForPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#0f0f1a', border: '1px solid rgba(163,45,45,0.4)', borderRadius: '16px', padding: '2rem', width: '340px', textAlign: 'center' }}>
            <div className="flicker" style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{bossForPrompt.icon}</div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: '#f09595', letterSpacing: '0.08em' }}>
              {bossForPrompt.name}
            </h2>
            <div style={{ fontFamily: '"Crimson Text", serif', color: '#4a3860', fontSize: '0.75rem', marginBottom: '0.5rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {bossForPrompt.tier} Lair · 💰 {bossForPrompt.goldReward} gold reward
            </div>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.9rem', margin: '0 0 1.5rem', fontStyle: 'italic', lineHeight: 1.5 }}>
              {bossForPrompt.lore}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={enterBossLair}
                disabled={enteringBoss}
                style={{ flex: 1, padding: '0.75rem', background: enteringBoss ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, rgba(163,45,45,0.5), rgba(99,57,134,0.5))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: enteringBoss ? 'not-allowed' : 'pointer' }}>
                {enteringBoss ? 'Entering...' : '⚔️ Enter Lair'}
              </button>
              <button
                onClick={() => setBossPrompt(null)}
                style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '8px', color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Retreat
              </button>
            </div>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#3a2e50', fontSize: '0.75rem', margin: '1rem 0 0', fontStyle: 'italic' }}>
              Up to 3 players of the same tier can join you.
            </p>
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', padding: '0.75rem 1.5rem', background: 'rgba(163,45,45,0.9)', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '10px', color: '#f09595', fontFamily: '"Crimson Text", serif', fontSize: '0.95rem', zIndex: 100 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '12px', background: 'none', border: 'none', color: '#f09595', cursor: 'pointer', fontSize: '1rem' }}>×</button>
        </div>
      )}

      {/* Selected player modal */}
      {selectedPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#0f0f1a', border: '1px solid rgba(155,114,207,0.3)', borderRadius: '16px', padding: '2rem', width: '320px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{REALM_ICONS[selectedPlayer.realm] ?? '🌐'}</div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: '#e8e0f0' }}>{selectedPlayer.name}</h2>
            <div style={{ fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              {selectedPlayer.tier} · {selectedPlayer.totalPower.toLocaleString()} power
            </div>
            <div style={{ fontFamily: '"Crimson Text", serif', color: '#BA7517', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              💰 {selectedPlayer.gold?.toLocaleString() ?? 0} gold
            </div>
            {isSameTier(myTier, selectedPlayer.tier) ? (
              <button onClick={() => sendChallenge(selectedPlayer)} style={{ width: '100%', padding: '0.75rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.4), rgba(99,57,134,0.4))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '0.5rem' }}>
                ⚔️ Challenge to Battle
              </button>
            ) : (
              <div style={{ padding: '0.75rem', background: 'rgba(163,45,45,0.1)', border: '1px solid rgba(163,45,45,0.2)', borderRadius: '8px', fontFamily: '"Crimson Text", serif', color: '#f09595', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Different tier — cannot challenge
              </div>
            )}
            <button onClick={() => setSelectedPlayer(null)} style={{ width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', color: '#4a3860', fontFamily: '"Crimson Text", serif', fontSize: '0.9rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PvE invite modal */}
      {pveInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: '#0f0f1a', border: '1px solid rgba(163,45,45,0.4)', borderRadius: '16px', padding: '2rem', width: '320px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>💀</div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: '#f09595' }}>Boss Raid Invite!</h2>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.95rem', margin: '0 0 0.25rem' }}>
              <strong style={{ color: '#c8a8f0' }}>{pveInvite.fromName}</strong> is fighting
            </p>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#f09595', fontSize: '0.9rem', margin: '0 0 1.5rem', fontStyle: 'italic' }}>
              {pveInvite.bossName}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => joinBossLair(pveInvite)}
                style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.4), rgba(99,57,134,0.4))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                ⚔️ Join Raid
              </button>
              <button
                onClick={() => setPveInvite(null)}
                style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '8px', color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Incoming PvP challenge modal */}
      {challenge && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div style={{ background: '#0f0f1a', border: '1px solid rgba(163,45,45,0.4)', borderRadius: '16px', padding: '2rem', width: '320px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚔️</div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#e8e0f0' }}>Battle Challenge!</h2>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.95rem', margin: '0 0 1.5rem' }}>
              <strong style={{ color: '#c8a8f0' }}>{challenge.fromName}</strong> has challenged you to battle
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  const c = challenge
                  setChallenge(null)
                  const opp = playersRef.current.get(c.fromId)
                  router.push(`/battle/prep?battle_id=${c.battleId}&opponent_name=${encodeURIComponent(c.fromName)}&opponent_power=${opp?.totalPower ?? 0}`)
                }}
                style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.4), rgba(99,57,134,0.4))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Accept
              </button>
              <button
                onClick={() => setChallenge(null)}
                style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '8px', color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
