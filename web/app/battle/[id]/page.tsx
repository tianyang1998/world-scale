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

interface ArenaPlayer {
  x: number
  y: number
  facing: number // angle in radians
}

type BattlePhase = 'waiting' | 'fighting' | 'ended'

// ── Arena layout ────────────────────────────────────────────────────────────
const ARENA_W = 800
const ARENA_H = 500
const PLAYER_RADIUS = 16
const MELEE_RANGE = 64
const PLAYER_SPEED = 3
const RECONNECT_WINDOW = 5000

// Pillars: { x, y, r } — circular obstacles
const PILLARS = [
  { x: 400, y: 250, r: 32 },   // center
  { x: 200, y: 150, r: 24 },
  { x: 600, y: 150, r: 24 },
  { x: 200, y: 350, r: 24 },
  { x: 600, y: 350, r: 24 },
  { x: 140, y: 250, r: 18 },
  { x: 660, y: 250, r: 18 },
  { x: 400, y: 100, r: 18 },
  { x: 400, y: 400, r: 18 },
]

// Walls: { x1, y1, x2, y2, thickness }
const WALLS = [
  { x1: 280, y1: 80,  x2: 520, y2: 80,  t: 12 },
  { x1: 280, y1: 420, x2: 520, y2: 420, t: 12 },
  { x1: 80,  y1: 180, x2: 80,  y2: 320, t: 12 },
  { x1: 720, y1: 180, x2: 720, y2: 320, t: 12 },
]

const REALM_ICONS: Record<string, string> = {
  academia: '📚', tech: '⚡', medicine: '⚕️', creative: '🎨', law: '⚖️',
}

// ── Collision helpers ───────────────────────────────────────────────────────
function clampToPillar(x: number, y: number, px: number, py: number, pr: number): { x: number; y: number } {
  const dx = x - px
  const dy = y - py
  const dist = Math.sqrt(dx * dx + dy * dy)
  const minDist = pr + PLAYER_RADIUS
  if (dist < minDist && dist > 0) {
    const nx = dx / dist
    const ny = dy / dist
    return { x: px + nx * minDist, y: py + ny * minDist }
  }
  return { x, y }
}

function clampToWall(x: number, y: number, w: { x1: number; y1: number; x2: number; y2: number; t: number }): { x: number; y: number } {
  const isHoriz = w.y1 === w.y2
  if (isHoriz) {
    if (x >= w.x1 - w.t && x <= w.x2 + w.t) {
      const above = w.y1 - PLAYER_RADIUS - w.t / 2
      const below = w.y1 + PLAYER_RADIUS + w.t / 2
      if (Math.abs(y - w.y1) < PLAYER_RADIUS + w.t / 2) {
        return { x, y: y < w.y1 ? above : below }
      }
    }
  } else {
    if (y >= w.y1 - w.t && y <= w.y2 + w.t) {
      const left  = w.x1 - PLAYER_RADIUS - w.t / 2
      const right = w.x1 + PLAYER_RADIUS + w.t / 2
      if (Math.abs(x - w.x1) < PLAYER_RADIUS + w.t / 2) {
        return { x: x < w.x1 ? left : right, y }
      }
    }
  }
  return { x, y }
}

function applyCollisions(x: number, y: number): { x: number; y: number } {
  let pos = { x, y }
  // arena bounds
  pos.x = Math.max(PLAYER_RADIUS, Math.min(ARENA_W - PLAYER_RADIUS, pos.x))
  pos.y = Math.max(PLAYER_RADIUS, Math.min(ARENA_H - PLAYER_RADIUS, pos.y))
  for (const p of PILLARS) pos = clampToPillar(pos.x, pos.y, p.x, p.y, p.r)
  for (const w of WALLS)   pos = clampToWall(pos.x, pos.y, w)
  return pos
}

// Line-of-sight: does segment (ax,ay)→(bx,by) intersect any pillar or wall?
function hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
  for (const p of PILLARS) {
    const dx = bx - ax; const dy = by - ay
    const fx = ax - p.x; const fy = ay - p.y
    const a = dx*dx + dy*dy
    const b = 2*(fx*dx + fy*dy)
    const c = fx*fx + fy*fy - p.r * p.r
    const disc = b*b - 4*a*c
    if (disc >= 0) {
      const t1 = (-b - Math.sqrt(disc)) / (2*a)
      const t2 = (-b + Math.sqrt(disc)) / (2*a)
      if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) return false
    }
  }
  return true
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

export default function BattlePage() {
  const router = useRouter()
  const { id: battleId } = useParams<{ id: string }>()
  const params = useSearchParams()

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
  const [reconnectTimer,  setReconnectTimer]  = useState<number>(0)
  const [inRange,  setInRange]  = useState(false)
  const [hasLOS,   setHasLOS]   = useState(false)

  const [realmCooldownUntil, setRealmCooldownUntil] = useState(0)
  const [bracingUntil,       setBracingUntil]       = useState(0)
  const [now, setNow] = useState(Date.now())

  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const channelRef   = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const meRef        = useRef<Fighter | null>(null)
  const opponentRef  = useRef<Fighter | null>(null)
  const logRef       = useRef<HTMLDivElement>(null)
  const keysRef      = useRef<Set<string>>(new Set())
  const animFrameRef = useRef<number>(0)
  const lastBroadcast = useRef<number>(0)
  const supabaseRef  = useRef(createClient())

  // Arena positions
  const myPosRef  = useRef<ArenaPlayer>({ x: 120, y: 250, facing: 0 })
  const oppPosRef = useRef<ArenaPlayer>({ x: 680, y: 250, facing: Math.PI })
  const userIdRef = useRef<string | null>(null)
  const phaseRef  = useRef<BattlePhase>('waiting')

  useEffect(() => { meRef.current = me }, [me])
  useEffect(() => { opponentRef.current = opponent }, [opponent])
  useEffect(() => { userIdRef.current = userId }, [userId])
  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  function addLog(msg: string) {
    setLog(prev => [...prev.slice(-50), msg])
  }

  // ── Draw loop ───────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const myPos  = myPosRef.current
    const oppPos = oppPosRef.current

    ctx.clearRect(0, 0, ARENA_W, ARENA_H)

    // Floor
    ctx.fillStyle = '#0d0d18'
    ctx.fillRect(0, 0, ARENA_W, ARENA_H)

    // Grid pattern
    ctx.strokeStyle = 'rgba(155,114,207,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < ARENA_W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_H); ctx.stroke()
    }
    for (let y = 0; y < ARENA_H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_W, y); ctx.stroke()
    }

    // Arena border
    ctx.strokeStyle = 'rgba(155,114,207,0.25)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2)

    // Walls
    for (const w of WALLS) {
      const isHoriz = w.y1 === w.y2
      ctx.fillStyle = 'rgba(80,60,120,0.6)'
      ctx.strokeStyle = 'rgba(155,114,207,0.4)'
      ctx.lineWidth = 1.5
      if (isHoriz) {
        const rx = w.x1
        const ry = w.y1 - w.t / 2
        const rw = w.x2 - w.x1
        ctx.fillRect(rx, ry, rw, w.t)
        ctx.strokeRect(rx, ry, rw, w.t)
        // top highlight
        ctx.fillStyle = 'rgba(200,168,240,0.12)'
        ctx.fillRect(rx, ry, rw, 3)
      } else {
        const rx = w.x1 - w.t / 2
        const ry = w.y1
        const rh = w.y2 - w.y1
        ctx.fillStyle = 'rgba(80,60,120,0.6)'
        ctx.fillRect(rx, ry, w.t, rh)
        ctx.strokeRect(rx, ry, w.t, rh)
        ctx.fillStyle = 'rgba(200,168,240,0.12)'
        ctx.fillRect(rx, ry, 3, rh)
      }
    }

    // Pillars
    for (const p of PILLARS) {
      // Shadow
      ctx.beginPath()
      ctx.arc(p.x + 3, p.y + 4, p.r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fill()

      // Body
      const grad = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r)
      grad.addColorStop(0, 'rgba(110,80,160,0.9)')
      grad.addColorStop(1, 'rgba(40,30,70,0.95)')
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = grad
      ctx.fill()
      ctx.strokeStyle = 'rgba(155,114,207,0.5)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Top highlight
      ctx.beginPath()
      ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.35, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(200,168,240,0.12)'
      ctx.fill()
    }

    // LOS beam when in range
    const d = dist(myPos.x, myPos.y, oppPos.x, oppPos.y)
    const los = hasLineOfSight(myPos.x, myPos.y, oppPos.x, oppPos.y)
    if (d < MELEE_RANGE * 2.5 && los) {
      ctx.beginPath()
      ctx.moveTo(myPos.x, myPos.y)
      ctx.lineTo(oppPos.x, oppPos.y)
      ctx.strokeStyle = d < MELEE_RANGE
        ? 'rgba(227,75,74,0.3)'
        : 'rgba(155,114,207,0.12)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 6])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw a player
    function drawPlayer(pos: ArenaPlayer, fighter: Fighter | null, isMe: boolean) {
      if (!ctx) return
      const label = fighter?.name?.slice(0, 10) ?? '?'
      const icon  = REALM_ICONS[fighter?.realm ?? ''] ?? '🌐'
      const color = isMe ? '#9b72cf' : '#cf7272'

      // Range ring (only on self, when in range)
      if (isMe && d < MELEE_RANGE) {
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, MELEE_RANGE, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(227,75,74,0.2)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 5])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Brace shield glow
      if (fighter?.isBracing) {
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, PLAYER_RADIUS + 6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(55,138,221,0.2)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(55,138,221,0.6)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Stun ring
      if (fighter?.isStunned) {
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, PLAYER_RADIUS + 8, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(239,159,39,0.6)'
        ctx.lineWidth = 2
        ctx.setLineDash([2, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }

      // Body
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, PLAYER_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = isMe ? 'rgba(100,60,160,0.9)' : 'rgba(160,60,60,0.9)'
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      // Direction indicator
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
      ctx.lineTo(
        pos.x + Math.cos(pos.facing) * (PLAYER_RADIUS + 6),
        pos.y + Math.sin(pos.facing) * (PLAYER_RADIUS + 6)
      )
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      // Realm icon
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(icon, pos.x, pos.y)

      // Name
      ctx.font = '500 10px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = isMe ? '#c8a8f0' : '#f0a8a8'
      ctx.fillText(label, pos.x, pos.y - PLAYER_RADIUS - 6)

      // FIGHT badge
      if (!isMe && d < MELEE_RANGE && los) {
        ctx.fillStyle = 'rgba(163,45,45,0.85)'
        ctx.beginPath()
        ctx.roundRect(pos.x - 18, pos.y + PLAYER_RADIUS + 4, 36, 14, 4)
        ctx.fill()
        ctx.fillStyle = '#f09595'
        ctx.font = '600 8px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('FIGHT', pos.x, pos.y + PLAYER_RADIUS + 11)
      }
    }

    drawPlayer(myPosRef.current, meRef.current, true)
    drawPlayer(oppPosRef.current, opponentRef.current, false)

    animFrameRef.current = requestAnimationFrame(draw)
  }, [])

  // ── Movement loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (phaseRef.current !== 'fighting') return

      const pos  = myPosRef.current
      const keys = keysRef.current
      let dx = 0; let dy = 0

      if (keys.has('ArrowLeft')  || keys.has('a')) dx -= PLAYER_SPEED
      if (keys.has('ArrowRight') || keys.has('d')) dx += PLAYER_SPEED
      if (keys.has('ArrowUp')    || keys.has('w')) dy -= PLAYER_SPEED
      if (keys.has('ArrowDown')  || keys.has('s')) dy += PLAYER_SPEED

      if (dx !== 0 || dy !== 0) {
        const raw = applyCollisions(pos.x + dx, pos.y + dy)
        pos.x = raw.x
        pos.y = raw.y
        pos.facing = Math.atan2(dy, dx)

        // Update in-range and LOS state
        const oppPos = oppPosRef.current
        const d = dist(pos.x, pos.y, oppPos.x, oppPos.y)
        const los = hasLineOfSight(pos.x, pos.y, oppPos.x, oppPos.y)
        setInRange(d < MELEE_RANGE && los)
        setHasLOS(los)

        // Broadcast position every 80ms
        const n = Date.now()
        if (n - lastBroadcast.current > 80) {
          lastBroadcast.current = n
          channelRef.current?.send({
            type: 'broadcast',
            event: 'move',
            payload: { userId: userIdRef.current, x: pos.x, y: pos.y, facing: pos.facing },
          })
        }
      }
    }, 16)
    return () => clearInterval(interval)
  }, [])

  // ── End battle ──────────────────────────────────────────────────────────────
  const endBattle = useCallback(async (winnerId: string, loser: Fighter, winnerFighter: Fighter) => {
    setPhase('ended')
    setWinner(winnerId === userIdRef.current ? 'you' : 'opponent')
    const gold = calcGoldTransfer(loser.gold)
    setGoldDelta(winnerId === userIdRef.current ? gold : -gold)
    await fetch('/api/battle/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ battle_id: battleId, winner_id: winnerId, gold_transferred: gold }),
    })
  }, [battleId])

  // ── Init + channel ──────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = supabaseRef.current
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUserId(user.id)
      userIdRef.current = user.id

      const res  = await fetch('/api/character/get')
      const data = await res.json()
      const gold = data.character?.gold ?? 0

      const myFighter: Fighter = {
        userId: user.id,
        name: data.character?.name ?? 'You',
        realm,
        maxHp: hp,
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

      const channel = supabase.channel(`battle:${battleId}`, {
        config: { presence: { key: user.id } }
      })
      channelRef.current = channel

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
          phaseRef.current = 'fighting'
          setOppDisconnected(false)
          if (disconnectTimer) clearTimeout(disconnectTimer)
          addLog('⚔️ Battle started! Chase down your opponent.')
          animFrameRef.current = requestAnimationFrame(draw)
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
              const opp = opponentRef.current
              const me2 = meRef.current
              if (opp && me2) endBattle(user.id, opp, me2)
            }
          }, 1000)
        }
      })

      // Opponent position updates
      channel.on('broadcast', { event: 'move' }, ({ payload }: { payload: { userId: string, x: number, y: number, facing: number } }) => {
        if (payload.userId !== user.id) {
          oppPosRef.current = { x: payload.x, y: payload.y, facing: payload.facing }
          // Also update in-range for the local player
          const myPos = myPosRef.current
          const d = dist(myPos.x, myPos.y, payload.x, payload.y)
          const los = hasLineOfSight(myPos.x, myPos.y, payload.x, payload.y)
          setInRange(d < MELEE_RANGE && los)
          setHasLOS(los)
        }
      })

      // Battle actions
      channel.on('broadcast', { event: 'action' }, ({ payload }: { payload: { type: string, attackerId: string, damage?: number, heal?: number, effect?: string, timestamp: number } }) => {
        const { type, attackerId, damage, heal, effect, timestamp } = payload
        if (attackerId === user.id) return

        const currentMe = meRef.current
        if (!currentMe) return

        if (type === 'strike' || type === 'realm_offensive') {
          const incomingDamage = damage ?? 0
          const bracingNow = Date.now() < bracingUntil
          const reduced = bracingNow ? Math.round(incomingDamage * 0.7) : incomingDamage
          const newHp = Math.max(0, currentMe.currentHp - reduced)
          setMe(prev => prev ? { ...prev, currentHp: newHp } : prev)
          addLog(`${bracingNow ? '🛡️ Blocked! ' : ''}Opponent hit you for ${reduced}${bracingNow ? ` (was ${incomingDamage})` : ''}`)
          if (newHp <= 0) endBattle(attackerId, currentMe, opponentRef.current!)
        }

        if (type === 'brace') {
          setOpponent(prev => prev ? { ...prev, isBracing: true } : prev)
          setTimeout(() => setOpponent(prev => prev ? { ...prev, isBracing: false } : prev), 1000)
          addLog('🛡️ Opponent is bracing!')
        }

        if (effect === 'defence_debuff') {
          const until = timestamp + (REALM_SKILLS[currentMe.realm]?.debuffDuration ?? 2) * 1000
          setMe(prev => prev ? { ...prev, defenceDebuffMultiplier: 0.75, defenceDebuffUntil: until } : prev)
          addLog('📖 Opponent reduced your Defence by 25%!')
          setTimeout(() => setMe(prev => prev ? { ...prev, defenceDebuffMultiplier: 1.0 } : prev), until - Date.now())
        }

        if (effect === 'attack_debuff') {
          const until = timestamp + (REALM_SKILLS[currentMe.realm]?.debuffDuration ?? 3) * 1000
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
          await channel.track({
            name: data.character?.name ?? 'Unknown',
            hp, attack, defence, gold, realm,
          })
        }
      })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key)
      if (e.code === 'Space') { e.preventDefault(); handleBrace() }
      if (e.code === 'KeyQ')  { e.preventDefault(); handleRealmSkill() }
    }
    const onKeyUp   = (e: KeyboardEvent) => keysRef.current.delete(e.key)
    const onContext = (e: MouseEvent)    => { e.preventDefault(); handleStrike() }

    window.addEventListener('keydown',      onKeyDown)
    window.addEventListener('keyup',        onKeyUp)
    window.addEventListener('contextmenu',  onContext)

    init()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      window.removeEventListener('keydown',     onKeyDown)
      window.removeEventListener('keyup',       onKeyUp)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [battleId, draw])

  // ── Skill handlers ──────────────────────────────────────────────────────────
  function fireAction(type: string, payload: Record<string, unknown>) {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'action',
      payload: { ...payload, type, attackerId: userIdRef.current, timestamp: Date.now() },
    })
  }

  function handleStrike() {
    const currentMe = meRef.current
    const opp       = opponentRef.current
    if (!currentMe || !opp || phaseRef.current !== 'fighting' || currentMe.isStunned) return

    // Melee range + LOS check
    const myPos  = myPosRef.current
    const oppPos = oppPosRef.current
    const d = dist(myPos.x, myPos.y, oppPos.x, oppPos.y)
    const los = hasLineOfSight(myPos.x, myPos.y, oppPos.x, oppPos.y)
    if (d > MELEE_RANGE || !los) { addLog('⚔️ Too far! Get closer to strike.'); return }

    const effectiveAttack  = currentMe.attack * currentMe.attackDebuffMultiplier
    const effectiveDefence = opp.defence * opp.defenceDebuffMultiplier
    const damage = calcDamage(effectiveAttack, effectiveDefence, 1.0, opp.isBracing)
    const newOppHp = Math.max(0, opp.currentHp - damage)
    setOpponent(prev => prev ? { ...prev, currentHp: newOppHp } : prev)
    addLog(`⚔️ You struck for ${damage} damage!`)
    fireAction('strike', { damage })
    if (newOppHp <= 0) endBattle(userIdRef.current!, opp, currentMe)
  }

  function handleBrace() {
    const currentMe = meRef.current
    if (!currentMe || phaseRef.current !== 'fighting' || currentMe.isStunned) return
    setBracingUntil(Date.now() + 1000)
    setMe(prev => prev ? { ...prev, isBracing: true } : prev)
    setTimeout(() => setMe(prev => prev ? { ...prev, isBracing: false } : prev), 1000)
    addLog('🛡️ You braced!')
    fireAction('brace', {})
  }

  function handleRealmSkill() {
    const currentMe = meRef.current
    const opp       = opponentRef.current
    if (!currentMe || !opp || phaseRef.current !== 'fighting' || currentMe.isStunned) return

    const skill = REALM_SKILLS[realm]
    if (!skill) return
    const cooldownMs = skill.cooldown * 1000
    if (Date.now() - currentMe.realmSkillLastUsed < cooldownMs) return

    // Offensive realm skills require melee range + LOS
    const myPos  = myPosRef.current
    const oppPos = oppPosRef.current
    const d   = dist(myPos.x, myPos.y, oppPos.x, oppPos.y)
    const los = hasLineOfSight(myPos.x, myPos.y, oppPos.x, oppPos.y)
    const needsRange = skill.multiplier || skill.defenceDebuff || skill.attackDebuff || skill.stunChance
    if (needsRange && (d > MELEE_RANGE || !los)) {
      addLog(`${skill.icon} Too far! Get closer to use ${skill.name}.`); return
    }

    const now2 = Date.now()
    setMe(prev => prev ? { ...prev, realmSkillLastUsed: now2 } : prev)
    setRealmCooldownUntil(now2 + cooldownMs)

    const effectiveAttack  = currentMe.attack * currentMe.attackDebuffMultiplier
    const effectiveDefence = opp.defence * opp.defenceDebuffMultiplier

    if (skill.multiplier) {
      const damage = calcDamage(effectiveAttack, effectiveDefence, skill.multiplier, opp.isBracing)
      const newOppHp = Math.max(0, opp.currentHp - damage)
      setOpponent(prev => prev ? { ...prev, currentHp: newOppHp } : prev)
      addLog(`${skill.icon} ${skill.name}: ${damage} damage!`)
      fireAction('realm_offensive', { damage })
      if (newOppHp <= 0) endBattle(userIdRef.current!, opp, currentMe)
    }

    if (skill.stunChance && Math.random() < skill.stunChance) {
      fireAction('realm_offensive', { damage: 0, effect: 'stun' })
      addLog(`${skill.icon} Stunned opponent!`)
    }

    if (skill.healPercent) {
      const healAmount = Math.round(currentMe.maxHp * skill.healPercent)
      setMe(prev => prev ? { ...prev, currentHp: Math.min(prev.maxHp, prev.currentHp + healAmount) } : prev)
      addLog(`${skill.icon} You healed ${healAmount} HP!`)
      fireAction('realm_heal', { heal: healAmount })
    }

    if (skill.defenceDebuff) {
      const until = now2 + (skill.debuffDuration ?? 2) * 1000
      setOpponent(prev => prev ? { ...prev, defenceDebuffMultiplier: 1 - skill.defenceDebuff!, defenceDebuffUntil: until } : prev)
      addLog(`${skill.icon} Reduced opponent's Defence by ${Math.round(skill.defenceDebuff * 100)}%!`)
      fireAction('realm_debuff', { effect: 'defence_debuff' })
      setTimeout(() => setOpponent(prev => prev ? { ...prev, defenceDebuffMultiplier: 1.0 } : prev), skill.debuffDuration! * 1000)
    }

    if (skill.attackDebuff) {
      const until = now2 + (skill.debuffDuration ?? 3) * 1000
      setOpponent(prev => prev ? { ...prev, attackDebuffMultiplier: 1 - skill.attackDebuff!, attackDebuffUntil: until } : prev)
      addLog(`${skill.icon} Reduced opponent's Attack by ${Math.round(skill.attackDebuff * 100)}%!`)
      fireAction('realm_debuff', { effect: 'attack_debuff' })
      setTimeout(() => setOpponent(prev => prev ? { ...prev, attackDebuffMultiplier: 1.0 } : prev), skill.debuffDuration! * 1000)
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  const realmCooldownLeft = Math.max(0, (realmCooldownUntil - now) / 1000)
  const realmSkill = REALM_SKILLS[realm]

  function HpBar({ fighter, flip = false }: { fighter: Fighter; flip?: boolean }) {
    const pct   = Math.round((fighter.currentHp / fighter.maxHp) * 100)
    const color = pct > 50 ? '#1D9E75' : pct > 25 ? '#EF9F27' : '#E24B4A'
    const ts    = getTierStyle(fighter.maxHp + fighter.attack + fighter.defence)
    return (
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: flip ? 'flex-end' : 'flex-start', marginBottom: '4px', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontFamily: '"Cinzel", serif', fontSize: '0.85rem', color: '#e8e0f0' }}>{fighter.name}</span>
          <span style={{ padding: '0.1rem 0.5rem', background: ts.bg + '22', border: `1px solid ${ts.color}44`, borderRadius: '999px', fontSize: '0.55rem', color: ts.color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{ts.name}</span>
        </div>
        <div style={{ height: '10px', background: 'rgba(155,114,207,0.1)', borderRadius: '5px', overflow: 'hidden', direction: flip ? 'rtl' : 'ltr' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '5px', transition: 'width 0.2s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: flip ? 'flex-end' : 'flex-start', marginTop: '3px', gap: '8px' }}>
          <span style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.75rem', color: '#6b5c80' }}>
            {fighter.currentHp.toLocaleString()} / {fighter.maxHp.toLocaleString()}
          </span>
          {fighter.isBracing && <span style={{ fontSize: '0.65rem', color: '#378ADD' }}>🛡️</span>}
          {fighter.isStunned && <span style={{ fontSize: '0.65rem', color: '#EF9F27' }}>⚡</span>}
          {fighter.defenceDebuffUntil > Date.now() && <span style={{ fontSize: '0.65rem', color: '#E24B4A' }}>📖</span>}
          {fighter.attackDebuffUntil > Date.now()  && <span style={{ fontSize: '0.65rem', color: '#E24B4A' }}>⚖️</span>}
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"Cinzel", serif', color: '#e8e0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .pulse { animation: pulse 1s ease-in-out infinite; }
        .skill-btn { transition: all 0.12s; border: none; cursor: pointer; }
        .skill-btn:active { transform: scale(0.94); }
        .skill-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
      `}</style>

      {/* Waiting */}
      {phase === 'waiting' && (
        <div style={{ textAlign: 'center', marginTop: '8rem' }}>
          <p className="pulse" style={{ fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '1.1rem' }}>
            Waiting for opponent to enter the arena...
          </p>
        </div>
      )}

      {(phase === 'fighting' || phase === 'ended') && me && opponent && (
        <div style={{ width: '100%', maxWidth: `${ARENA_W}px` }}>

          {/* HP bars */}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <HpBar fighter={me} />
            <div style={{ fontSize: '0.8rem', color: '#4a3860', fontWeight: 700, paddingTop: '6px', flexShrink: 0 }}>VS</div>
            <HpBar fighter={opponent} flip />
          </div>

          {/* Disconnect warning */}
          {oppDisconnected && (
            <div className="pulse" style={{ textAlign: 'center', color: '#EF9F27', fontFamily: '"Crimson Text", serif', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              ⚠️ Opponent disconnected — forfeiting in {reconnectTimer}s...
            </div>
          )}

          {/* Arena canvas */}
          <div style={{ position: 'relative', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '8px', overflow: 'hidden' }}>
            <canvas
              ref={canvasRef}
              width={ARENA_W}
              height={ARENA_H}
              style={{ display: 'block' }}
            />

            {/* In-range indicator */}
            {phase === 'fighting' && (
              <div style={{
                position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
                padding: '0.2rem 0.8rem',
                background: inRange ? 'rgba(163,45,45,0.85)' : 'rgba(10,10,20,0.7)',
                border: `1px solid ${inRange ? 'rgba(227,75,74,0.6)' : 'rgba(155,114,207,0.2)'}`,
                borderRadius: '999px',
                fontSize: '0.6rem', letterSpacing: '0.15em',
                color: inRange ? '#f09595' : '#4a3860',
                transition: 'all 0.2s',
              }}>
                {inRange ? '⚔️ IN RANGE' : hasLOS ? 'CLOSE IN' : '👁️ HIDDEN'}
              </div>
            )}

            {/* Victory/defeat overlay */}
            {phase === 'ended' && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', padding: '2rem', background: '#0f0f1a', border: `1px solid ${winner === 'you' ? 'rgba(30,120,80,0.5)' : 'rgba(163,45,45,0.5)'}`, borderRadius: '16px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{winner === 'you' ? '🏆' : '💀'}</div>
                  <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.4rem', color: winner === 'you' ? '#1D9E75' : '#E24B4A' }}>
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
              </div>
            )}
          </div>

          {/* Controls row */}
          {phase === 'fighting' && (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'stretch' }}>

              {/* Battle log */}
              <div ref={logRef} style={{ flex: 1, height: '90px', overflowY: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,114,207,0.1)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                {log.length === 0 && <p style={{ fontFamily: '"Crimson Text", serif', color: '#3a2e50', fontSize: '0.8rem', margin: 0 }}>Battle log...</p>}
                {log.map((entry, i) => (
                  <p key={i} style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.8rem', margin: '1px 0' }}>{entry}</p>
                ))}
              </div>

              {/* Skill buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                {/* Strike */}
                <button
                  className="skill-btn"
                  onClick={handleStrike}
                  disabled={me.isStunned || !inRange}
                  style={{
                    width: '72px', height: '90px',
                    background: (me.isStunned || !inRange) ? 'rgba(255,255,255,0.03)' : 'rgba(239,159,39,0.15)',
                    border: `1px solid ${(me.isStunned || !inRange) ? 'rgba(155,114,207,0.1)' : 'rgba(239,159,39,0.4)'}`,
                    borderRadius: '8px', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                  }}>
                  <div style={{ fontSize: '1.3rem' }}>⚔️</div>
                  <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.55rem', letterSpacing: '0.08em', color: '#e8e0f0' }}>Strike</div>
                  <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.65rem', color: '#6b5c80' }}>R-click</div>
                </button>

                {/* Brace */}
                <button
                  className="skill-btn"
                  onClick={handleBrace}
                  disabled={me.isStunned}
                  style={{
                    width: '72px', height: '90px',
                    background: me.isStunned ? 'rgba(255,255,255,0.03)' : 'rgba(55,138,221,0.15)',
                    border: `1px solid ${me.isStunned ? 'rgba(155,114,207,0.1)' : 'rgba(55,138,221,0.4)'}`,
                    borderRadius: '8px', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                  }}>
                  <div style={{ fontSize: '1.3rem' }}>🛡️</div>
                  <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.55rem', letterSpacing: '0.08em', color: '#e8e0f0' }}>Brace</div>
                  <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.65rem', color: '#6b5c80' }}>Space</div>
                </button>

                {/* Realm skill */}
                <button
                  className="skill-btn"
                  onClick={handleRealmSkill}
                  disabled={me.isStunned || realmCooldownLeft > 0}
                  style={{
                    width: '72px', height: '90px',
                    background: (me.isStunned || realmCooldownLeft > 0) ? 'rgba(255,255,255,0.03)' : 'rgba(155,114,207,0.15)',
                    border: `1px solid ${(me.isStunned || realmCooldownLeft > 0) ? 'rgba(155,114,207,0.1)' : 'rgba(155,114,207,0.4)'}`,
                    borderRadius: '8px', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
                  }}>
                  <div style={{ fontSize: '1.3rem' }}>{realmSkill?.icon}</div>
                  <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.55rem', letterSpacing: '0.08em', color: '#e8e0f0' }}>{realmSkill?.name}</div>
                  {realmCooldownLeft > 0
                    ? <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.65rem', color: '#E24B4A' }}>{realmCooldownLeft.toFixed(1)}s</div>
                    : <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.65rem', color: '#6b5c80' }}>Q</div>
                  }
                </button>
              </div>
            </div>
          )}

          {/* Controls hint */}
          {phase === 'fighting' && (
            <div style={{ textAlign: 'center', marginTop: '0.5rem', fontFamily: '"Crimson Text", serif', color: 'rgba(155,114,207,0.35)', fontSize: '0.75rem' }}>
              Move: WASD · Strike: Right-click (in range) · Brace: Space · Realm skill: Q
            </div>
          )}
        </div>
      )}
    </div>
  )
}
