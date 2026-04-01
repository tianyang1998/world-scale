'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { calcDamage, REALM_SKILLS, calcGoldTransfer } from '@/lib/battle'
import { getTierStyle } from '@/lib/types'
import {
  BOSSES, BOSS_SKILLS, Boss, BossState,
  pickAttackTarget, pickSkillTargets, PlayerSnapshot,
} from '@/lib/boss'

// ── Types ───────────────────────────────────────────────────────────────────

interface TeamFighter {
  userId: string
  name: string
  realm: string
  maxHp: number
  currentHp: number
  attack: number
  defence: number
  isBracing: boolean
  isStunned: boolean
  isDead: boolean
  defenceDebuffMultiplier: number
  attackDebuffMultiplier: number
  realmSkillLastUsed: number
  gold: number
  x: number
  y: number
}

interface ArenaPos { x: number; y: number; facing: number }

type BattlePhase = 'lobby' | 'fighting' | 'ended'

// ── Arena layout (wider to fit boss on the right) ───────────────────────────
const ARENA_W = 900
const ARENA_H = 500
const PLAYER_RADIUS = 16
const BOSS_RADIUS = 36
const MELEE_RANGE = 80
const PLAYER_SPEED = 3
const RECONNECT_WINDOW = 5000

// Boss spawns on the right, players on the left
const BOSS_X = 750
const BOSS_Y = 250

// Pillars
const PILLARS = [
  { x: 420, y: 250, r: 30 },
  { x: 220, y: 150, r: 22 },
  { x: 220, y: 350, r: 22 },
  { x: 580, y: 150, r: 22 },
  { x: 580, y: 350, r: 22 },
  { x: 140, y: 250, r: 16 },
  { x: 420, y: 110, r: 16 },
  { x: 420, y: 390, r: 16 },
]

const WALLS = [
  { x1: 300, y1: 80,  x2: 540, y2: 80,  t: 12 },
  { x1: 300, y1: 420, x2: 540, y2: 420, t: 12 },
  { x1: 80,  y1: 180, x2: 80,  y2: 320, t: 12 },
]

const REALM_ICONS: Record<string, string> = {
  academia: '📚', tech: '⚡', medicine: '⚕️', creative: '🎨', law: '⚖️',
}

// Spawn positions for up to 3 players
const SPAWN_POSITIONS: ArenaPos[] = [
  { x: 100, y: 200, facing: 0 },
  { x: 100, y: 300, facing: 0 },
  { x: 160, y: 250, facing: 0 },
]

// ── Collision helpers ────────────────────────────────────────────────────────
function clampToPillar(x: number, y: number, px: number, py: number, pr: number, r: number) {
  const dx = x - px; const dy = y - py
  const d = Math.sqrt(dx * dx + dy * dy)
  const min = pr + r
  if (d < min && d > 0) return { x: px + (dx / d) * min, y: py + (dy / d) * min }
  return { x, y }
}

function clampToWall(x: number, y: number, w: { x1: number; y1: number; x2: number; y2: number; t: number }, r: number) {
  const isH = w.y1 === w.y2
  if (isH) {
    if (x >= w.x1 - w.t && x <= w.x2 + w.t && Math.abs(y - w.y1) < r + w.t / 2)
      return { x, y: y < w.y1 ? w.y1 - r - w.t / 2 : w.y1 + r + w.t / 2 }
  } else {
    if (y >= w.y1 - w.t && y <= w.y2 + w.t && Math.abs(x - w.x1) < r + w.t / 2)
      return { x: x < w.x1 ? w.x1 - r - w.t / 2 : w.x1 + r + w.t / 2, y }
  }
  return { x, y }
}

function applyCollisions(x: number, y: number, r = PLAYER_RADIUS) {
  let p = {
    x: Math.max(r, Math.min(ARENA_W - r, x)),
    y: Math.max(r, Math.min(ARENA_H - r, y)),
  }
  for (const pl of PILLARS) p = clampToPillar(p.x, p.y, pl.x, pl.y, pl.r, r)
  for (const w of WALLS)    p = clampToWall(p.x, p.y, w, r)
  return p
}

function distXY(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

function hasLOS(ax: number, ay: number, bx: number, by: number) {
  for (const p of PILLARS) {
    const dx = bx - ax; const dy = by - ay
    const fx = ax - p.x; const fy = ay - p.y
    const a = dx * dx + dy * dy
    const b = 2 * (fx * dx + fy * dy)
    const c = fx * fx + fy * fy - p.r * p.r
    const disc = b * b - 4 * a * c
    if (disc >= 0) {
      const t1 = (-b - Math.sqrt(disc)) / (2 * a)
      const t2 = (-b + Math.sqrt(disc)) / (2 * a)
      if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) return false
    }
  }
  return true
}

// ── Component ────────────────────────────────────────────────────────────────
export default function PvEPage() {
  const router     = useRouter()
  const { id: battleId } = useParams<{ id: string }>()
  const params     = useSearchParams()

  const hp      = Number(params.get('hp')      ?? 0)
  const attack  = Number(params.get('attack')  ?? 0)
  const defence = Number(params.get('defence') ?? 0)
  const realm   = params.get('realm') ?? 'academia'
  const bossKey = params.get('boss_tier') ?? ''

  const [phase,        setPhase]        = useState<BattlePhase>('lobby')
  const [team,         setTeam]         = useState<TeamFighter[]>([])
  const [bossHp,       setBossHp]       = useState(0)
  const [bossMaxHp,    setBossMaxHp]    = useState(0)
  const [userId,       setUserId]       = useState<string | null>(null)
  const [log,          setLog]          = useState<string[]>([])
  const [winner,       setWinner]       = useState<'team' | 'boss' | null>(null)
  const [goldDelta,    setGoldDelta]    = useState<number | null>(null)
  const [inRange,      setInRange]      = useState(false)
  const [realmCooldownUntil, setRealmCooldownUntil] = useState(0)
  const [bracingUntil, setBracingUntil] = useState(0)
  const [now,          setNow]          = useState(Date.now())
  const [partyCount,       setPartyCount]       = useState(1)
  const [selectedHealTarget, setSelectedHealTarget] = useState<string | null>(null) // userId or null = self

  const boss = BOSSES[bossKey]

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const channelRef     = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const teamRef        = useRef<TeamFighter[]>([])
  const bossStateRef   = useRef<BossState>({ currentHp: 0, lastAttackAt: 0, lastSkillAt: 0, attackTargetIndex: 0 })
  const keysRef        = useRef<Set<string>>(new Set())
  const animFrameRef   = useRef<number>(0)
  const lastBroadcast  = useRef<number>(0)
  const supabaseRef    = useRef(createClient())
  const userIdRef      = useRef<string | null>(null)
  const phaseRef       = useRef<BattlePhase>('lobby')
  const logRef         = useRef<HTMLDivElement>(null)
  const isLeaderRef    = useRef(false)
  const endedRef       = useRef(false)

  // Arena positions: keyed by userId, boss is fixed
  const positionsRef = useRef<Map<string, ArenaPos>>(new Map())

  useEffect(() => { teamRef.current = team }, [team])
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { userIdRef.current = userId }, [userId])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  function addLog(msg: string) {
    setLog(prev => [...prev.slice(-60), msg])
  }

  // ── End battle ─────────────────────────────────────────────────────────────
  const endBattle = useCallback(async (teamWon: boolean) => {
    if (endedRef.current) return
    endedRef.current = true
    setPhase('ended')
    setWinner(teamWon ? 'team' : 'boss')

    const survivors = teamRef.current.filter(p => !p.isDead).map(p => p.userId)
    const myId = userIdRef.current
    const iSurvived = survivors.includes(myId ?? '')

    setGoldDelta(teamWon && iSurvived ? (boss?.goldReward ?? 0) : 0)

    // Only leader saves the result to avoid duplicate DB writes
    if (isLeaderRef.current) {
      await fetch('/api/pve/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battle_id: battleId,
          success: teamWon,
          surviving_player_ids: survivors,
        }),
      })
    }
  }, [battleId, boss])

  // ── Boss AI tick (runs only on leader) ─────────────────────────────────────
  const runBossAI = useCallback(() => {
    if (!boss || phaseRef.current !== 'fighting') return
    if (!isLeaderRef.current) return

    const bossState = bossStateRef.current
    const now2 = Date.now()
    const currentTeam = teamRef.current

    const snapshots: PlayerSnapshot[] = currentTeam.map(p => ({
      userId: p.userId,
      currentHp: p.currentHp,
      maxHp: p.maxHp,
      attack: p.attack,
      isBracing: p.isBracing,
      isDead: p.isDead,
    }))

    const allDead = snapshots.every(p => p.isDead)
    if (allDead) { endBattle(false); return }

    // Normal attack
    if (now2 - bossState.lastAttackAt >= boss.attackIntervalMs) {
      bossState.lastAttackAt = now2
      const targetIdx = pickAttackTarget(snapshots, bossState.attackTargetIndex)
      bossState.attackTargetIndex = targetIdx
      const target = currentTeam[targetIdx]
      if (target && !target.isDead) {
        const reduced = target.isBracing
          ? Math.round(calcDamage(boss.attack, target.defence * target.defenceDebuffMultiplier, 1.0, true))
          : calcDamage(boss.attack, target.defence * target.defenceDebuffMultiplier, 1.0, false)
        channelRef.current?.send({
          type: 'broadcast',
          event: 'boss_attack',
          payload: { targetId: target.userId, damage: reduced, timestamp: now2 },
        })
      }
    }

    // Special skill
    if (now2 - bossState.lastSkillAt >= boss.skillIntervalMs) {
      bossState.lastSkillAt = now2
      const bossSkill = BOSS_SKILLS[boss.realm]
      if (bossSkill) {
        const targetIndices = pickSkillTargets(snapshots, bossSkill.effect)
        channelRef.current?.send({
          type: 'broadcast',
          event: 'boss_skill',
          payload: {
            skillRealm: boss.realm,
            targetIds: targetIndices.map(i => currentTeam[i]?.userId).filter(Boolean),
            effect: bossSkill.effect,
            timestamp: now2,
          },
        })
      }
    }
  }, [boss, endBattle])

  // ── Draw loop ───────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, ARENA_W, ARENA_H)

    // Floor
    ctx.fillStyle = '#0d0d18'
    ctx.fillRect(0, 0, ARENA_W, ARENA_H)

    // Grid
    ctx.strokeStyle = 'rgba(155,114,207,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x < ARENA_W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_H); ctx.stroke() }
    for (let y = 0; y < ARENA_H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_W, y); ctx.stroke() }

    // Border
    ctx.strokeStyle = 'rgba(163,45,45,0.3)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, ARENA_W - 2, ARENA_H - 2)

    // Walls
    for (const w of WALLS) {
      const isH = w.y1 === w.y2
      ctx.fillStyle = 'rgba(80,60,120,0.6)'
      ctx.strokeStyle = 'rgba(155,114,207,0.4)'
      ctx.lineWidth = 1.5
      if (isH) {
        ctx.fillRect(w.x1, w.y1 - w.t / 2, w.x2 - w.x1, w.t)
        ctx.strokeRect(w.x1, w.y1 - w.t / 2, w.x2 - w.x1, w.t)
      } else {
        ctx.fillRect(w.x1 - w.t / 2, w.y1, w.t, w.y2 - w.y1)
        ctx.strokeRect(w.x1 - w.t / 2, w.y1, w.t, w.y2 - w.y1)
      }
    }

    // Pillars
    for (const p of PILLARS) {
      ctx.beginPath(); ctx.arc(p.x + 3, p.y + 4, p.r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill()
      const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1, p.x, p.y, p.r)
      g.addColorStop(0, 'rgba(110,80,160,0.9)')
      g.addColorStop(1, 'rgba(40,30,70,0.95)')
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = g; ctx.fill()
      ctx.strokeStyle = 'rgba(155,114,207,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
    }

    // Boss
    const bossState = bossStateRef.current
    const bossHpPct = boss ? bossState.currentHp / boss.hp : 0
    const bossColor = bossHpPct > 0.5 ? '#cf3333' : bossHpPct > 0.25 ? '#cf7733' : '#8b0000'

    // Boss glow
    ctx.beginPath(); ctx.arc(BOSS_X, BOSS_Y, BOSS_RADIUS + 12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(163,45,45,0.12)'; ctx.fill()

    // Boss body
    const bg = ctx.createRadialGradient(BOSS_X - 10, BOSS_Y - 10, 4, BOSS_X, BOSS_Y, BOSS_RADIUS)
    bg.addColorStop(0, 'rgba(180,50,50,0.95)')
    bg.addColorStop(1, 'rgba(60,10,10,0.98)')
    ctx.beginPath(); ctx.arc(BOSS_X, BOSS_Y, BOSS_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = bg; ctx.fill()
    ctx.strokeStyle = bossColor; ctx.lineWidth = 3; ctx.stroke()

    // Boss icon
    ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(boss?.icon ?? '👹', BOSS_X, BOSS_Y)

    // Boss name + HP bar above
    ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#f09595'
    ctx.fillText(boss?.name ?? 'Boss', BOSS_X, BOSS_Y - BOSS_RADIUS - 22)

    const barW = 90; const barH = 6
    const barX = BOSS_X - barW / 2; const barY = BOSS_Y - BOSS_RADIUS - 18
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = bossColor; ctx.fillRect(barX, barY, barW * bossHpPct, barH)

    // Players
    const myId = userIdRef.current
    teamRef.current.forEach((fighter) => {
      const pos = positionsRef.current.get(fighter.userId)
      if (!pos) return
      if (!ctx) return

      const isMe = fighter.userId === myId
      const color = isMe ? '#9b72cf' : '#72b8cf'

      if (fighter.isDead) {
        ctx.globalAlpha = 0.3
      }

      // Brace glow
      if (fighter.isBracing) {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, PLAYER_RADIUS + 6, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(55,138,221,0.2)'; ctx.fill()
        ctx.strokeStyle = 'rgba(55,138,221,0.6)'; ctx.lineWidth = 2; ctx.stroke()
      }

      // Body
      ctx.beginPath(); ctx.arc(pos.x, pos.y, PLAYER_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = isMe ? 'rgba(100,60,160,0.9)' : 'rgba(60,100,160,0.9)'
      ctx.fill()
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()

      // Direction
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y)
      ctx.lineTo(pos.x + Math.cos(pos.facing) * (PLAYER_RADIUS + 5), pos.y + Math.sin(pos.facing) * (PLAYER_RADIUS + 5))
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke()

      // Icon
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(REALM_ICONS[fighter.realm] ?? '🌐', pos.x, pos.y)

      // Name
      ctx.font = '500 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = isMe ? '#c8a8f0' : '#a8c8f0'
      ctx.fillText(fighter.name.slice(0, 10) + (fighter.isDead ? ' 💀' : ''), pos.x, pos.y - PLAYER_RADIUS - 5)

      ctx.globalAlpha = 1
    })

    // Range indicator for local player
    const myPos = myId ? positionsRef.current.get(myId) : null
    if (myPos) {
      const d = distXY(myPos.x, myPos.y, BOSS_X, BOSS_Y)
      if (d < MELEE_RANGE * 2) {
        ctx.beginPath(); ctx.arc(myPos.x, myPos.y, MELEE_RANGE, 0, Math.PI * 2)
        ctx.strokeStyle = d < MELEE_RANGE ? 'rgba(227,75,74,0.25)' : 'rgba(155,114,207,0.1)'
        ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([])
      }
    }

    animFrameRef.current = requestAnimationFrame(draw)
  }, [boss])

  // ── Movement loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (phaseRef.current !== 'fighting') return
      const myId = userIdRef.current
      if (!myId) return
      const pos = positionsRef.current.get(myId)
      if (!pos) return

      const keys = keysRef.current
      let dx = 0; let dy = 0
      if (keys.has('ArrowLeft')  || keys.has('a')) dx -= PLAYER_SPEED
      if (keys.has('ArrowRight') || keys.has('d')) dx += PLAYER_SPEED
      if (keys.has('ArrowUp')    || keys.has('w')) dy -= PLAYER_SPEED
      if (keys.has('ArrowDown')  || keys.has('s')) dy += PLAYER_SPEED

      if (dx !== 0 || dy !== 0) {
        const raw = applyCollisions(pos.x + dx, pos.y + dy)
        pos.x = raw.x; pos.y = raw.y
        pos.facing = Math.atan2(dy, dx)

        const d = distXY(pos.x, pos.y, BOSS_X, BOSS_Y)
        setInRange(d < MELEE_RANGE)

        const n = Date.now()
        if (n - lastBroadcast.current > 80) {
          lastBroadcast.current = n
          channelRef.current?.send({
            type: 'broadcast', event: 'move',
            payload: { userId: myId, x: pos.x, y: pos.y, facing: pos.facing },
          })
        }
      }
    }, 16)
    return () => clearInterval(interval)
  }, [])

  // ── Boss AI interval ref (started when battle begins) ─────────────────────
  const bossAIIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runBossAIRef = useRef(runBossAI)
  useEffect(() => { runBossAIRef.current = runBossAI }, [runBossAI])

  function startBossAI() {
    if (bossAIIntervalRef.current) return // already running
    bossAIIntervalRef.current = setInterval(() => {
      runBossAIRef.current()
    }, 200)
  }

  function startBattle() {
    if (!isLeaderRef.current) return
    // Reset boss timers so first attack fires immediately
    bossStateRef.current.lastAttackAt = 0
    bossStateRef.current.lastSkillAt  = 0
    channelRef.current?.send({ type: 'broadcast', event: 'start', payload: {} })
    setPhase('fighting')
    phaseRef.current = 'fighting'
    addLog(`${boss?.icon ?? '👹'} ${boss?.name ?? 'The Boss'} awakens! Fight together!`)
    animFrameRef.current = requestAnimationFrame(draw)
    startBossAI()
  }
  useEffect(() => {
    const supabase = supabaseRef.current

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUserId(user.id)
      userIdRef.current = user.id

      const res  = await fetch('/api/character/get')
      const data = await res.json()
      const gold = data.character?.gold ?? 0

      const myFighter: TeamFighter = {
        userId: user.id,
        name: data.character?.name ?? 'You',
        realm,
        maxHp: hp, currentHp: hp,
        attack, defence,
        isBracing: false, isStunned: false, isDead: false,
        defenceDebuffMultiplier: 1.0,
        attackDebuffMultiplier: 1.0,
        realmSkillLastUsed: 0,
        gold,
        x: SPAWN_POSITIONS[0].x,
        y: SPAWN_POSITIONS[0].y,
      }

      setTeam([myFighter])
      teamRef.current = [myFighter]

      // Set initial position
      positionsRef.current.set(user.id, { ...SPAWN_POSITIONS[0] })

      // Init boss HP
      if (boss) {
        bossStateRef.current.currentHp = boss.hp
        bossStateRef.current.lastAttackAt = Date.now()
        bossStateRef.current.lastSkillAt  = Date.now()
        setBossHp(boss.hp)
        setBossMaxHp(boss.hp)
      }

      const channel = supabase.channel(`pve:${battleId}`, {
        config: { presence: { key: user.id } }
      })
      channelRef.current = channel

      // Player joins lobby
      channel.on('presence', { event: 'join' }, ({ key, newPresences }: { key: string, newPresences: { name: string, hp: number, attack: number, defence: number, gold: number, realm: string }[] }) => {
        if (key === user.id) return
        const p = newPresences[0]

        setTeam(prev => {
          if (prev.find(f => f.userId === key)) return prev
          const spawnIdx = Math.min(prev.length, SPAWN_POSITIONS.length - 1)
          const newFighter: TeamFighter = {
            userId: key, name: p.name, realm: p.realm,
            maxHp: p.hp, currentHp: p.hp,
            attack: p.attack, defence: p.defence,
            isBracing: false, isStunned: false, isDead: false,
            defenceDebuffMultiplier: 1.0, attackDebuffMultiplier: 1.0,
            realmSkillLastUsed: 0,
            gold: p.gold, x: SPAWN_POSITIONS[spawnIdx].x, y: SPAWN_POSITIONS[spawnIdx].y,
          }
          positionsRef.current.set(key, { ...SPAWN_POSITIONS[spawnIdx] })
          const next = [...prev, newFighter]
          teamRef.current = next
          setPartyCount(next.length)
          addLog(`⚔️ ${p.name} joined the party!`)
          return next
        })
      })

      // Player leaves
      channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
        if (key === user.id) return
        setTeam(prev => {
          const next = prev.filter(f => f.userId !== key)
          teamRef.current = next
          positionsRef.current.delete(key)
          addLog(`⚠️ A party member disconnected.`)
          return next
        })
      })

      // Movement
      channel.on('broadcast', { event: 'move' }, ({ payload }: { payload: { userId: string, x: number, y: number, facing: number } }) => {
        if (payload.userId !== user.id) {
          positionsRef.current.set(payload.userId, { x: payload.x, y: payload.y, facing: payload.facing })
        }
      })

      // Leader starts the battle
      channel.on('broadcast', { event: 'start' }, () => {
        setPhase('fighting')
        phaseRef.current = 'fighting'
        addLog(`${boss?.icon ?? '👹'} ${boss?.name ?? 'The Boss'} awakens! Fight together!`)
        animFrameRef.current = requestAnimationFrame(draw)
        // Leader starts AI via startBattle(), non-leaders just update phase
        if (isLeaderRef.current) startBossAI()
      })

      // Boss normal attack
      channel.on('broadcast', { event: 'boss_attack' }, ({ payload }: { payload: { targetId: string, damage: number, timestamp: number } }) => {
        if (phaseRef.current !== 'fighting') return
        setTeam(prev => {
          const next = prev.map(f => {
            if (f.userId !== payload.targetId) return f
            const newHp = Math.max(0, f.currentHp - payload.damage)
            const isDead = newHp <= 0
            addLog(`${boss?.icon ?? '👹'} Boss hit ${f.name} for ${payload.damage}!${isDead ? ` ${f.name} has fallen!` : ''}`)
            return { ...f, currentHp: newHp, isDead }
          })
          teamRef.current = next
          if (next.every(f => f.isDead)) endBattle(false)
          return next
        })
      })

      // Boss special skill
      channel.on('broadcast', { event: 'boss_skill' }, ({ payload }: {
        payload: { skillRealm: string, targetIds: string[], effect: { type: string, multiplier?: number, defenceDebuff?: number, attackDebuff?: number, debuffDuration?: number, dotTicks?: number, dotIntervalMs?: number }, timestamp: number }
      }) => {
        if (phaseRef.current !== 'fighting') return
        const skill = BOSS_SKILLS[payload.skillRealm]
        addLog(`${skill?.icon ?? '💥'} Boss used ${skill?.name ?? 'Special'}!`)

        const { effect } = payload

        setTeam(prev => {
          let next = [...prev]

          if (effect.type === 'aoe_damage' || effect.type === 'damage') {
            next = next.map(f => {
              if (!payload.targetIds.includes(f.userId)) return f
              const dmg = Math.round((boss?.attack ?? 0) * (effect.multiplier ?? 1.0))
              const reduced = f.isBracing ? Math.round(dmg * 0.7) : dmg
              const newHp = Math.max(0, f.currentHp - reduced)
              addLog(`  → ${f.name} took ${reduced} damage${f.isBracing ? ' (blocked some)' : ''}`)
              return { ...f, currentHp: newHp, isDead: newHp <= 0 }
            })
          }

          if (effect.type === 'defence_debuff' && effect.defenceDebuff && effect.debuffDuration) {
            next = next.map(f => {
              if (!payload.targetIds.includes(f.userId)) return f
              addLog(`  → ${f.name}'s Defence reduced by ${Math.round(effect.defenceDebuff! * 100)}%!`)
              setTimeout(() => {
                setTeam(t => t.map(tf => tf.userId === f.userId ? { ...tf, defenceDebuffMultiplier: 1.0 } : tf))
              }, effect.debuffDuration)
              return { ...f, defenceDebuffMultiplier: 1 - effect.defenceDebuff! }
            })
          }

          if (effect.type === 'attack_debuff' && effect.attackDebuff && effect.debuffDuration) {
            next = next.map(f => {
              if (!payload.targetIds.includes(f.userId)) return f
              addLog(`  → ${f.name}'s Attack reduced by ${Math.round(effect.attackDebuff! * 100)}%!`)
              setTimeout(() => {
                setTeam(t => t.map(tf => tf.userId === f.userId ? { ...tf, attackDebuffMultiplier: 1.0 } : tf))
              }, effect.debuffDuration)
              return { ...f, attackDebuffMultiplier: 1 - effect.attackDebuff! }
            })
          }

          teamRef.current = next
          if (next.every(f => f.isDead)) endBattle(false)
          return next
        })

        // DOT — applied tick by tick
        if (effect.type === 'dot' && effect.dotTicks && effect.dotIntervalMs) {
          let ticks = 0
          const dotInterval = setInterval(() => {
            ticks++
            const dotDmg = Math.round((boss?.attack ?? 0) * (effect.multiplier ?? 0.15))
            setTeam(prev => {
              const next = prev.map(f => {
                if (!payload.targetIds.includes(f.userId) || f.isDead) return f
                const newHp = Math.max(0, f.currentHp - dotDmg)
                addLog(`☠️ ${f.name} takes ${dotDmg} DOT damage!`)
                return { ...f, currentHp: newHp, isDead: newHp <= 0 }
              })
              teamRef.current = next
              if (next.every(f => f.isDead)) endBattle(false)
              return next
            })
            if (ticks >= (effect.dotTicks ?? 5)) clearInterval(dotInterval)
          }, effect.dotIntervalMs)
        }
      })

      // Player action broadcast (strike, brace, realm skill)
      channel.on('broadcast', { event: 'player_action' }, ({ payload }: {
        payload: { type: string, attackerId: string, damage?: number, heal?: number, healTargetId?: string, effect?: string, targetIds?: string[], timestamp: number }
      }) => {
        if (phaseRef.current !== 'fighting') return
        const { type, attackerId, damage, heal, healTargetId, effect, targetIds } = payload

        // Update boss HP on strike
        if (type === 'strike' || type === 'realm_offensive') {
          const dmg = damage ?? 0
          bossStateRef.current.currentHp = Math.max(0, bossStateRef.current.currentHp - dmg)
          setBossHp(bossStateRef.current.currentHp)
          if (bossStateRef.current.currentHp <= 0) endBattle(true)
        }

        // Team heal
        if (type === 'realm_heal' && healTargetId) {
          setTeam(prev => {
            const next = prev.map(f => {
              if (f.userId !== healTargetId) return f
              const newHp = Math.min(f.maxHp, f.currentHp + (heal ?? 0))
              addLog(`⚕️ ${teamRef.current.find(t => t.userId === attackerId)?.name ?? 'Ally'} healed ${f.name} for ${heal} HP!`)
              return { ...f, currentHp: newHp }
            })
            teamRef.current = next
            return next
          })
        }

        // AOE defence debuff on boss
        if (effect === 'boss_defence_debuff') {
          addLog(`📖 Boss Defence reduced for the whole team!`)
          // Apply a temporary multiplier to boss defence — broadcast handled by leader
        }
      })

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // First to subscribe becomes leader
          const state = channel.presenceState()
          isLeaderRef.current = Object.keys(state).length === 0
          await channel.track({ name: data.character?.name ?? 'Unknown', hp, attack, defence, gold, realm })
          addLog(isLeaderRef.current
            ? '👑 You are the party leader. Start when ready.'
            : '⏳ Waiting for the party leader to start...'
          )
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

    window.addEventListener('keydown',     onKeyDown)
    window.addEventListener('keyup',       onKeyUp)
    window.addEventListener('contextmenu', onContext)

    init()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (bossAIIntervalRef.current) { clearInterval(bossAIIntervalRef.current); bossAIIntervalRef.current = null }
      const supabase = supabaseRef.current
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
      window.removeEventListener('keydown',     onKeyDown)
      window.removeEventListener('keyup',       onKeyUp)
      window.removeEventListener('contextmenu', onContext)
    }
  }, [battleId, boss, draw])

  // ── Skill handlers ──────────────────────────────────────────────────────────
  function firePlayerAction(type: string, payload: Record<string, unknown>) {
    channelRef.current?.send({
      type: 'broadcast', event: 'player_action',
      payload: { ...payload, type, attackerId: userIdRef.current, timestamp: Date.now() },
    })
  }

  function handleStrike() {
    const me = teamRef.current.find(f => f.userId === userIdRef.current)
    if (!me || phaseRef.current !== 'fighting' || me.isStunned || me.isDead) return
    if (!inRange) { addLog('⚔️ Too far! Move closer to the boss.'); return }

    const effectiveAttack = me.attack * me.attackDebuffMultiplier
    const damage = calcDamage(effectiveAttack, (boss?.defence ?? 0), 1.0, false)

    // Update boss HP locally
    bossStateRef.current.currentHp = Math.max(0, bossStateRef.current.currentHp - damage)
    setBossHp(bossStateRef.current.currentHp)
    addLog(`⚔️ ${me.name} struck the boss for ${damage}!`)

    firePlayerAction('strike', { damage })
    if (bossStateRef.current.currentHp <= 0) endBattle(true)
  }

  function handleBrace() {
    const me = teamRef.current.find(f => f.userId === userIdRef.current)
    if (!me || phaseRef.current !== 'fighting' || me.isStunned || me.isDead) return
    setBracingUntil(Date.now() + 1000)
    setTeam(prev => prev.map(f => f.userId === me.userId ? { ...f, isBracing: true } : f))
    setTimeout(() => setTeam(prev => prev.map(f => f.userId === me.userId ? { ...f, isBracing: false } : f)), 1000)
    addLog(`🛡️ ${me.name} braced!`)
    firePlayerAction('brace', {})
  }

  function handleRealmSkill() {
    const me = teamRef.current.find(f => f.userId === userIdRef.current)
    if (!me || phaseRef.current !== 'fighting' || me.isStunned || me.isDead) return

    const skill = REALM_SKILLS[realm]
    if (!skill) return
    const cooldownMs = skill.cooldown * 1000
    if (Date.now() - me.realmSkillLastUsed < cooldownMs) return

    // Melee check for offensive skills
    const needsRange = skill.multiplier || skill.defenceDebuff || skill.attackDebuff || skill.stunChance
    if (needsRange && !inRange) { addLog(`${skill.icon} Too far! Get closer to use ${skill.name}.`); return }

    const now2 = Date.now()
    setRealmCooldownUntil(now2 + cooldownMs)
    setTeam(prev => prev.map(f => f.userId === me.userId ? { ...f, realmSkillLastUsed: now2 } : f))

    const effectiveAttack = me.attack * me.attackDebuffMultiplier

    // ── Offensive damage to boss ───────────────────────────────────────────
    if (skill.multiplier) {
      const damage = calcDamage(effectiveAttack, boss?.defence ?? 0, skill.multiplier, false)
      bossStateRef.current.currentHp = Math.max(0, bossStateRef.current.currentHp - damage)
      setBossHp(bossStateRef.current.currentHp)
      addLog(`${skill.icon} ${me.name} used ${skill.name}: ${damage} damage to boss!`)
      firePlayerAction('realm_offensive', { damage })
      if (bossStateRef.current.currentHp <= 0) { endBattle(true); return }
    }

    // ── Medicine: heal selected target, default to self ───────────────────
    if (skill.healPercent) {
      const alive = teamRef.current.filter(f => !f.isDead)
      const target = alive.find(f => f.userId === selectedHealTarget)
        ?? alive.find(f => f.userId === userIdRef.current)
        ?? alive[0]
      if (target) {
        const healAmount = Math.round(me.maxHp * skill.healPercent)
        addLog(`${skill.icon} ${me.name} healed ${target.name} for ${healAmount} HP!`)
        setTeam(prev => prev.map(f => f.userId === target.userId
          ? { ...f, currentHp: Math.min(f.maxHp, f.currentHp + healAmount) }
          : f
        ))
        firePlayerAction('realm_heal', { heal: healAmount, healTargetId: target.userId })
        setSelectedHealTarget(null) // reset after use
      }
    }

    // ── Academia: reduce boss defence (team-wide effect) ───────────────────
    if (skill.defenceDebuff) {
      addLog(`${skill.icon} ${me.name} weakened the boss's defence for the whole team!`)
      // Temporarily reduce boss defence in bossStateRef
      const orig = boss?.defence ?? 0
      // We approximate by reducing from the canonical value — all players
      // will calculate damage against the debuffed value for the duration
      firePlayerAction('realm_debuff', { effect: 'boss_defence_debuff', defenceDebuff: skill.defenceDebuff, debuffDuration: (skill.debuffDuration ?? 2) * 1000 })
      // Apply locally for the leader's AI calculations
      if (isLeaderRef.current && boss) {
        const debuffed = Math.round(orig * (1 - skill.defenceDebuff))
        ;(boss as Boss & { _tempDefence?: number })._tempDefence = debuffed
        setTimeout(() => { delete (boss as Boss & { _tempDefence?: number })._tempDefence }, (skill.debuffDuration ?? 2) * 1000)
      }
    }

    // ── Law: reduce boss attack for all players ────────────────────────────
    if (skill.attackDebuff) {
      addLog(`${skill.icon} ${me.name} issued a Verdict — boss attack reduced for everyone!`)
      firePlayerAction('realm_debuff', { effect: 'boss_attack_debuff', attackDebuff: skill.attackDebuff, debuffDuration: (skill.debuffDuration ?? 3) * 1000 })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const realmCooldownLeft = Math.max(0, (realmCooldownUntil - now) / 1000)
  const realmSkill = REALM_SKILLS[realm]
  const me = team.find(f => f.userId === userId)
  const bossHpPct = bossMaxHp > 0 ? bossHp / bossMaxHp : 0
  const bossHpColor = bossHpPct > 0.5 ? '#E24B4A' : bossHpPct > 0.25 ? '#EF9F27' : '#8b0000'

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: '"Cinzel", serif', color: '#e8e0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes flicker { 0%,100%{opacity:1} 45%{opacity:0.85} 50%{opacity:0.7} 55%{opacity:0.9} }
        .pulse { animation: pulse 1.2s ease-in-out infinite; }
        .flicker { animation: flicker 3s ease-in-out infinite; }
        .skill-btn { transition: all 0.12s; border: none; cursor: pointer; }
        .skill-btn:active { transform: scale(0.94); }
        .skill-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
      `}</style>

      <div style={{ width: '100%', maxWidth: `${ARENA_W}px` }}>

        {/* Boss header */}
        {boss && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(163,45,45,0.08)', border: '1px solid rgba(163,45,45,0.2)', borderRadius: '10px' }}>
            <div className="flicker" style={{ fontSize: '2rem', flexShrink: 0 }}>{boss.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.9rem', color: '#f09595', letterSpacing: '0.1em' }}>{boss.name}</span>
                <span style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.8rem', color: '#6b5c80' }}>
                  {bossHp.toLocaleString()} / {bossMaxHp.toLocaleString()}
                </span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${bossHpPct * 100}%`, background: bossHpColor, borderRadius: '4px', transition: 'width 0.3s ease' }} />
              </div>
              {phase === 'lobby' && (
                <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.8rem', color: '#4a3860', marginTop: '4px', fontStyle: 'italic' }}>{boss.lore}</div>
              )}
            </div>
          </div>
        )}

        {/* Team HP bars */}
        {(phase === 'fighting' || phase === 'ended') && (
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
            {team.map(fighter => {
              const pct = fighter.maxHp > 0 ? fighter.currentHp / fighter.maxHp : 0
              const color = pct > 0.5 ? '#1D9E75' : pct > 0.25 ? '#EF9F27' : '#E24B4A'
              const ts = getTierStyle(fighter.maxHp + fighter.attack + fighter.defence)
              const isMedicPlayer = realm === 'medicine' && phase === 'fighting'
              const isHealTarget = selectedHealTarget === fighter.userId || (selectedHealTarget === null && fighter.userId === userId)
              return (
                <div
                  key={fighter.userId}
                  onClick={() => {
                    if (!isMedicPlayer || fighter.isDead) return
                    // Toggle: clicking the already-selected target deselects (back to self)
                    setSelectedHealTarget(prev => prev === fighter.userId ? null : fighter.userId)
                  }}
                  style={{
                    flex: 1,
                    opacity: fighter.isDead ? 0.4 : 1,
                    transition: 'opacity 0.3s',
                    cursor: isMedicPlayer && !fighter.isDead ? 'pointer' : 'default',
                    padding: '4px 6px',
                    borderRadius: '6px',
                    border: isMedicPlayer
                      ? `1px solid ${isHealTarget ? 'rgba(29,158,117,0.6)' : 'rgba(155,114,207,0.1)'}`
                      : '1px solid transparent',
                    background: isMedicPlayer && isHealTarget ? 'rgba(29,158,117,0.08)' : 'transparent',
                  }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '3px' }}>
                    <span style={{ fontSize: '0.75rem', color: fighter.userId === userId ? '#c8a8f0' : '#a8c8f0' }}>{fighter.name.slice(0, 10)}</span>
                    <span style={{ fontSize: '0.5rem', padding: '0 4px', background: ts.bg + '22', border: `1px solid ${ts.color}33`, borderRadius: '999px', color: ts.color }}>{ts.name}</span>
                    {fighter.isDead && <span style={{ fontSize: '0.6rem', color: '#E24B4A' }}>💀</span>}
                    {isMedicPlayer && isHealTarget && !fighter.isDead && <span style={{ fontSize: '0.6rem', color: '#1D9E75' }}>⚕️</span>}
                  </div>
                  <div style={{ height: '8px', background: 'rgba(155,114,207,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: '4px', transition: 'width 0.2s ease' }} />
                  </div>
                  <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.7rem', color: '#4a3860', marginTop: '2px' }}>
                    {fighter.currentHp.toLocaleString()} / {fighter.maxHp.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {realm === 'medicine' && phase === 'fighting' && (
          <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.72rem', color: 'rgba(29,158,117,0.5)', marginBottom: '0.5rem', textAlign: 'center' }}>
            ⚕️ Click a teammate's HP bar to set heal target · defaults to self
          </div>
        )}

        {/* Lobby */}
        {phase === 'lobby' && (
          <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,114,207,0.15)', borderRadius: '12px', marginBottom: '0.75rem', textAlign: 'center' }}>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.95rem', margin: '0 0 1rem' }}>
              Party: <strong style={{ color: '#c8a8f0' }}>{partyCount}</strong> / 3 players
            </p>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#4a3860', fontSize: '0.85rem', margin: '0 0 1.5rem', fontStyle: 'italic' }}>
              Other players in your tier can join by entering the boss zone on the map.
            </p>
            {isLeaderRef.current ? (
              <button
                onClick={startBattle}
                style={{ padding: '0.75rem 2.5rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.5), rgba(99,57,134,0.5))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>
                ⚔️ Begin Battle
              </button>
            ) : (
              <p className="pulse" style={{ fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.9rem', margin: 0 }}>
                Waiting for the party leader to start...
              </p>
            )}
          </div>
        )}

        {/* Arena */}
        {(phase === 'fighting' || phase === 'ended') && (
          <div style={{ position: 'relative', border: '1px solid rgba(163,45,45,0.25)', borderRadius: '8px', overflow: 'hidden', marginBottom: '0.75rem' }}>
            <canvas ref={canvasRef} width={ARENA_W} height={ARENA_H} style={{ display: 'block' }} />

            {/* In-range indicator */}
            {phase === 'fighting' && (
              <div style={{
                position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)',
                padding: '0.2rem 0.8rem',
                background: inRange ? 'rgba(163,45,45,0.85)' : 'rgba(10,10,20,0.7)',
                border: `1px solid ${inRange ? 'rgba(227,75,74,0.6)' : 'rgba(155,114,207,0.2)'}`,
                borderRadius: '999px', fontSize: '0.6rem', letterSpacing: '0.15em',
                color: inRange ? '#f09595' : '#4a3860', transition: 'all 0.2s',
              }}>
                {inRange ? '⚔️ IN RANGE' : 'CLOSE IN ON THE BOSS'}
              </div>
            )}

            {/* Victory / defeat overlay */}
            {phase === 'ended' && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', padding: '2rem', background: '#0f0f1a', border: `1px solid ${winner === 'team' ? 'rgba(30,120,80,0.5)' : 'rgba(163,45,45,0.5)'}`, borderRadius: '16px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>{winner === 'team' ? '🏆' : '💀'}</div>
                  <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem', color: winner === 'team' ? '#1D9E75' : '#E24B4A' }}>
                    {winner === 'team' ? 'Boss Defeated!' : 'Party Wiped'}
                  </h2>
                  {goldDelta !== null && goldDelta > 0 && (
                    <p style={{ fontFamily: '"Crimson Text", serif', color: '#BA7517', fontSize: '1rem', margin: '0 0 1.5rem' }}>
                      +{goldDelta} gold
                    </p>
                  )}
                  {winner === 'boss' && (
                    <p style={{ fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.9rem', margin: '0 0 1.5rem' }}>
                      No gold awarded — regroup and try again.
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button onClick={() => router.push('/map')} style={{ padding: '0.6rem 1.5rem', background: 'rgba(155,114,207,0.2)', border: '1px solid rgba(155,114,207,0.4)', borderRadius: '8px', color: '#c8a8f0', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                      Back to Map
                    </button>
                    <button onClick={() => router.push('/profile')} style={{ padding: '0.6rem 1.5rem', background: 'transparent', border: '1px solid rgba(155,114,207,0.2)', borderRadius: '8px', color: '#6b5c80', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                      My Profile
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controls row */}
        {phase === 'fighting' && me && !me.isDead && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
            {/* Battle log */}
            <div ref={logRef} style={{ flex: 1, height: '90px', overflowY: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,114,207,0.1)', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
              {log.length === 0 && <p style={{ fontFamily: '"Crimson Text", serif', color: '#3a2e50', fontSize: '0.8rem', margin: 0 }}>Battle log...</p>}
              {log.map((entry, i) => (
                <p key={i} style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.8rem', margin: '1px 0' }}>{entry}</p>
              ))}
            </div>

            {/* Skill buttons */}
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button className="skill-btn" onClick={handleStrike} disabled={me.isStunned || !inRange}
                style={{ width: '72px', height: '90px', background: (me.isStunned || !inRange) ? 'rgba(255,255,255,0.03)' : 'rgba(239,159,39,0.15)', border: `1px solid ${(me.isStunned || !inRange) ? 'rgba(155,114,207,0.1)' : 'rgba(239,159,39,0.4)'}`, borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                <div style={{ fontSize: '1.3rem' }}>⚔️</div>
                <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.55rem', color: '#e8e0f0' }}>Strike</div>
                <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.65rem', color: '#6b5c80' }}>R-click</div>
              </button>

              <button className="skill-btn" onClick={handleBrace} disabled={me.isStunned}
                style={{ width: '72px', height: '90px', background: me.isStunned ? 'rgba(255,255,255,0.03)' : 'rgba(55,138,221,0.15)', border: `1px solid ${me.isStunned ? 'rgba(155,114,207,0.1)' : 'rgba(55,138,221,0.4)'}`, borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                <div style={{ fontSize: '1.3rem' }}>🛡️</div>
                <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.55rem', color: '#e8e0f0' }}>Brace</div>
                <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.65rem', color: '#6b5c80' }}>Space</div>
              </button>

              <button className="skill-btn" onClick={handleRealmSkill} disabled={me.isStunned || realmCooldownLeft > 0}
                style={{ width: '72px', height: '90px', background: (me.isStunned || realmCooldownLeft > 0) ? 'rgba(255,255,255,0.03)' : 'rgba(155,114,207,0.15)', border: `1px solid ${(me.isStunned || realmCooldownLeft > 0) ? 'rgba(155,114,207,0.1)' : 'rgba(155,114,207,0.4)'}`, borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                <div style={{ fontSize: '1.3rem' }}>{realmSkill?.icon}</div>
                <div style={{ fontFamily: '"Cinzel", serif', fontSize: '0.55rem', color: '#e8e0f0' }}>{realmSkill?.name}</div>
                {realmCooldownLeft > 0
                  ? <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.65rem', color: '#E24B4A' }}>{realmCooldownLeft.toFixed(1)}s</div>
                  : <div style={{ fontFamily: '"Crimson Text", serif', fontSize: '0.65rem', color: '#6b5c80' }}>Q</div>
                }
              </button>
            </div>
          </div>
        )}

        {/* Dead player log view */}
        {phase === 'fighting' && me?.isDead && (
          <div style={{ padding: '1rem', textAlign: 'center', fontFamily: '"Crimson Text", serif', color: '#6b5c80', fontSize: '0.95rem' }}>
            💀 You have fallen. Watch your allies fight on...
            <div ref={logRef} style={{ marginTop: '0.75rem', height: '80px', overflowY: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(155,114,207,0.1)', borderRadius: '8px', padding: '0.5rem 0.75rem', textAlign: 'left' }}>
              {log.map((entry, i) => (
                <p key={i} style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.8rem', margin: '1px 0' }}>{entry}</p>
              ))}
            </div>
          </div>
        )}

        {/* Controls hint */}
        {phase === 'fighting' && (
          <div style={{ textAlign: 'center', marginTop: '0.5rem', fontFamily: '"Crimson Text", serif', color: 'rgba(155,114,207,0.3)', fontSize: '0.75rem' }}>
            Move: WASD · Strike: Right-click (in range) · Brace: Space · Realm skill: Q
          </div>
        )}
      </div>
    </div>
  )
}
