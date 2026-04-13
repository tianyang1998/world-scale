'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation' // useSearchParams needed for boss_tier param
import { createClient } from '@/lib/supabase-client'
import { calcDamage, REALM_SKILLS, calcGoldTransfer } from '@/lib/battle'
import { getTierStyle } from '@/lib/types'
import {
  Projectile, drawProjectile, drawHitFlash,
  updateProjectile, checkHit,
  createSword, createRealmProjectile, createHealPulse, createBossProjectile,
} from '@/lib/projectiles'
import {
  BOSSES, BOSS_SKILLS, Boss, BossState,
  pickAttackTarget, pickSkillTargets, PlayerSnapshot,
} from '@/lib/boss'
import { audioManager } from '@/lib/audioManager'
import AudioControls from '@/components/AudioControls'

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
interface HitFlash { x: number; y: number; color: string; age: number }

type BattlePhase = 'lobby' | 'fighting' | 'ended'

// ── Arena layout ────────────────────────────────────────────────────────────
const ARENA_W = 900
const ARENA_H = 500
const PLAYER_RADIUS = 16
const BOSS_RADIUS = 36
const MELEE_RANGE = 80
const PLAYER_SPEED = 3
const BOSS_SPEED = 1.4  // boss moves slower than players so they can kite
const RECONNECT_WINDOW = 5000

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

  const bossKey = params.get('boss_tier') ?? ''
  const [myStats, setMyStats] = useState<{hp:number;attack:number;defence:number;realm:string}|null>(null)

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

  // Arena positions: keyed by userId. Boss has its own ref.
  const positionsRef = useRef<Map<string, ArenaPos>>(new Map())
  const bossPosRef   = useRef({ x: 750, y: 250 })
  const projectilesRef = useRef<Projectile[]>([])
  const lastStrikeRef  = useRef<number>(0)
  const STRIKE_COOLDOWN_MS = 800
  const hitFlashesRef  = useRef<HitFlash[]>([])
  const lastFrameTime  = useRef(0)
  const battleStartTimeRef = useRef<number>(0) // for grace period
  const GRACE_PERIOD_MS = 3000

  useEffect(() => {
    audioManager.playBGM('pve')
  }, [])

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
    audioManager.playBGM(teamWon ? 'win' : 'lose')
    audioManager.playSFX(teamWon ? 'victory' : 'defeat')
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
  // ── Boss fires a projectile toward target ────────────────────────────────────
  const fireBossProjectile = useCallback((targetId: string, damage: number) => {
    const targetPos = positionsRef.current.get(targetId)
    if (!targetPos) return
    const proj = createBossProjectile(
      boss?.realm ?? 'academia',
      bossPosRef.current.x, bossPosRef.current.y,
      targetPos.x, targetPos.y,
      targetId, damage
    )
    projectilesRef.current.push(proj)
    audioManager.playSFX('bossAttack')
    // Broadcast so all clients see the projectile
    channelRef.current?.send({
      type: 'broadcast', event: 'boss_projectile',
      payload: { targetId, damage, fromX: bossPosRef.current.x, fromY: bossPosRef.current.y, toX: targetPos.x, toY: targetPos.y, realm: boss?.realm ?? 'academia' },
    })
  }, [boss])

  // ── Apply damage when a boss projectile hits a player ────────────────────────
  const applyBossDamage = useCallback((targetId: string, damage: number, projColor: string, projX: number, projY: number) => {
    setTeam(prev => {
      const next = prev.map(f => {
        if (f.userId !== targetId) return f
        const newHp = Math.max(0, f.currentHp - damage)
        const isDead = newHp <= 0
        hitFlashesRef.current.push({ x: projX, y: projY, color: projColor, age: 0 })
        addLog(`${BOSSES[bossKey]?.icon ?? '👹'} Boss hit ${f.name} for ${damage}!${isDead ? ` ${f.name} has fallen!` : ''}`)
        return { ...f, currentHp: newHp, isDead }
      })
      teamRef.current = next
      audioManager.playSFX('hit')
      if (next.every(f => f.isDead)) endBattle(false)
      return next
    })
  }, [bossKey, endBattle])

  const runBossAI = useCallback(() => {
    if (!boss || phaseRef.current !== 'fighting') return
    if (!isLeaderRef.current) return

    // Grace period — boss doesn't move or attack for first 3 seconds
    if (Date.now() - battleStartTimeRef.current < GRACE_PERIOD_MS) return

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

    // ── Boss movement — chase nearest alive player ──────────────────────────
    const alive = currentTeam.filter(p => !p.isDead)
    if (alive.length > 0) {
      // Find nearest player by position
      let nearest = alive[0]
      let nearestDist = Infinity
      alive.forEach(p => {
        const pos = positionsRef.current.get(p.userId)
        if (!pos) return
        const d = distXY(bossPosRef.current.x, bossPosRef.current.y, pos.x, pos.y)
        if (d < nearestDist) { nearestDist = d; nearest = p }
      })

      const targetPos = positionsRef.current.get(nearest.userId)
      if (targetPos) {
        const dx = targetPos.x - bossPosRef.current.x
        const dy = targetPos.y - bossPosRef.current.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        // Only move if not already touching the player
        if (dist > BOSS_RADIUS + PLAYER_RADIUS) {
          const nx = dx / dist
          const ny = dy / dist
          const newPos = applyCollisions(
            bossPosRef.current.x + nx * BOSS_SPEED,
            bossPosRef.current.y + ny * BOSS_SPEED,
            BOSS_RADIUS
          )
          bossPosRef.current = newPos

          // Broadcast boss position to all players every ~100ms
          if (now2 - (bossState as BossState & { lastMoveBroadcast?: number }).lastMoveBroadcast! > 80) {
            ;(bossState as BossState & { lastMoveBroadcast?: number }).lastMoveBroadcast = now2
            channelRef.current?.send({
              type: 'broadcast',
              event: 'boss_move',
              payload: { x: bossPosRef.current.x, y: bossPosRef.current.y },
            })
          }
        }

        // Update inRange for local player
        const myPos = userIdRef.current ? positionsRef.current.get(userIdRef.current) : null
        if (myPos) {
          const d = distXY(myPos.x, myPos.y, bossPosRef.current.x, bossPosRef.current.y)
          setInRange(d < MELEE_RANGE)
        }
      }
    }

    // Normal attack — only if boss is within melee range of target
    if (now2 - bossState.lastAttackAt >= boss.attackIntervalMs) {
      const targetIdx = pickAttackTarget(snapshots, bossState.attackTargetIndex)
      bossState.attackTargetIndex = targetIdx
      const target = currentTeam[targetIdx]
      if (target && !target.isDead) {
        const targetPos = positionsRef.current.get(target.userId)
        const inAttackRange = targetPos
          ? distXY(bossPosRef.current.x, bossPosRef.current.y, targetPos.x, targetPos.y) < MELEE_RANGE
          : false

        if (inAttackRange) {
          bossState.lastAttackAt = now2
          const baseDamage = Math.round(target.maxHp * 0.10)
          const reduced = target.isBracing ? Math.round(baseDamage * 0.7) : baseDamage
          fireBossProjectile(target.userId, reduced)
        }
      }
    }

    // Special skill — only fires if boss is near at least one player
    if (now2 - bossState.lastSkillAt >= boss.skillIntervalMs) {
      const anyInRange = currentTeam.some(p => {
        if (p.isDead) return false
        const pos = positionsRef.current.get(p.userId)
        return pos ? distXY(bossPosRef.current.x, bossPosRef.current.y, pos.x, pos.y) < MELEE_RANGE * 1.5 : false
      })
      if (anyInRange) {
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
    }
  }, [boss, endBattle, applyBossDamage, fireBossProjectile])

  // ── Draw loop ───────────────────────────────────────────────────────────────
  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dtMs = lastFrameTime.current ? timestamp - lastFrameTime.current : 16
    lastFrameTime.current = timestamp

    ctx.clearRect(0, 0, ARENA_W, ARENA_H)

    // ── Dungeon floor ─────────────────────────────────────────────────────────
    // Stone floor base
    const floorGrad = ctx.createLinearGradient(0, 0, 0, ARENA_H)
    floorGrad.addColorStop(0, '#1a1018')
    floorGrad.addColorStop(0.5, '#130d16')
    floorGrad.addColorStop(1, '#0d0a10')
    ctx.fillStyle = floorGrad
    ctx.fillRect(0, 0, ARENA_W, ARENA_H)

    // Stone tile grid — subtle, warm-toned
    ctx.strokeStyle = 'rgba(120,90,60,0.07)'
    ctx.lineWidth = 1
    for (let x = 0; x < ARENA_W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA_H); ctx.stroke() }
    for (let y = 0; y < ARENA_H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA_W, y); ctx.stroke() }

    // Torchlight pools in corners — warm orange glow
    const torchPositions = [
      { x: 0,      y: 0      },
      { x: ARENA_W, y: 0      },
      { x: 0,      y: ARENA_H },
      { x: ARENA_W, y: ARENA_H },
    ]
    for (const t of torchPositions) {
      const tg = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 180)
      tg.addColorStop(0, `rgba(200,120,30,${0.08 + 0.03 * Math.sin(timestamp * 0.002 + t.x)})`)
      tg.addColorStop(1, 'transparent')
      ctx.fillStyle = tg
      ctx.fillRect(0, 0, ARENA_W, ARENA_H)
    }

    // Vignette — dark edges, lighter center
    const vignette = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, 80, ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.75)
    vignette.addColorStop(0, 'transparent')
    vignette.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, ARENA_W, ARENA_H)

    // Stone border with torchlit glow
    ctx.strokeStyle = 'rgba(163,45,45,0.5)'
    ctx.lineWidth = 3
    ctx.shadowColor = 'rgba(163,45,45,0.3)'
    ctx.shadowBlur = 8
    ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4)
    ctx.shadowBlur = 0

    // ── Walls — stone blocks ──────────────────────────────────────────────────
    for (const w of WALLS) {
      const isH = w.y1 === w.y2
      // Shadow
      ctx.save()
      ctx.globalAlpha = 0.4
      ctx.fillStyle = '#000'
      if (isH) ctx.fillRect(w.x1 + 3, w.y1 - w.t / 2 + 3, w.x2 - w.x1, w.t)
      else      ctx.fillRect(w.x1 - w.t / 2 + 3, w.y1 + 3, w.t, w.y2 - w.y1)
      ctx.restore()
      // Stone fill
      const wallGrad = isH
        ? ctx.createLinearGradient(w.x1, w.y1 - w.t / 2, w.x1, w.y1 + w.t / 2)
        : ctx.createLinearGradient(w.x1 - w.t / 2, w.y1, w.x1 + w.t / 2, w.y1)
      wallGrad.addColorStop(0, 'rgba(100,80,60,0.9)')
      wallGrad.addColorStop(0.5, 'rgba(70,55,40,0.95)')
      wallGrad.addColorStop(1, 'rgba(40,30,20,0.9)')
      ctx.fillStyle = wallGrad
      ctx.strokeStyle = 'rgba(160,130,80,0.4)'
      ctx.lineWidth = 1.5
      if (isH) {
        ctx.fillRect(w.x1, w.y1 - w.t / 2, w.x2 - w.x1, w.t)
        ctx.strokeRect(w.x1, w.y1 - w.t / 2, w.x2 - w.x1, w.t)
      } else {
        ctx.fillRect(w.x1 - w.t / 2, w.y1, w.t, w.y2 - w.y1)
        ctx.strokeRect(w.x1 - w.t / 2, w.y1, w.t, w.y2 - w.y1)
      }
    }

    // ── Pillars — carved stone columns ───────────────────────────────────────
    for (const p of PILLARS) {
      // Drop shadow
      ctx.beginPath(); ctx.arc(p.x + 4, p.y + 5, p.r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill()
      // Stone body gradient
      const pg = ctx.createRadialGradient(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.05, p.x, p.y, p.r)
      pg.addColorStop(0, 'rgba(140,110,80,0.95)')
      pg.addColorStop(0.5, 'rgba(90,70,50,0.95)')
      pg.addColorStop(1, 'rgba(40,30,20,0.98)')
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = pg; ctx.fill()
      // Rim highlight
      ctx.strokeStyle = 'rgba(200,160,90,0.35)'; ctx.lineWidth = 1.5; ctx.stroke()
      // Top highlight glint
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.3, p.r * 0.15, -0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // ── Boss — big cute-scary blob ────────────────────────────────────────────
    const bossState = bossStateRef.current
    const bossHpPct = boss ? bossState.currentHp / boss.hp : 0
    const bossColor = bossHpPct > 0.5 ? '#cf3333' : bossHpPct > 0.25 ? '#cf7733' : '#8b0000'
    const bx = bossPosRef.current.x
    const by = bossPosRef.current.y
    const bossPulse = 0.96 + 0.04 * Math.sin(timestamp * 0.004)
    const bR = BOSS_RADIUS * bossPulse

    // Outer danger glow
    const bossGlow = ctx.createRadialGradient(bx, by, bR * 0.5, bx, by, bR + 30)
    bossGlow.addColorStop(0, `rgba(163,45,45,${0.15 + 0.1 * bossPulse})`)
    bossGlow.addColorStop(1, 'transparent')
    ctx.fillStyle = bossGlow
    ctx.beginPath(); ctx.arc(bx, by, bR + 30, 0, Math.PI * 2); ctx.fill()

    // Ground shadow
    ctx.save()
    ctx.globalAlpha = 0.35
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(bx, by + bR + 6, bR * 0.8, 6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Blob body — squished, menacing
    const blobGrad = ctx.createRadialGradient(bx - bR * 0.3, by - bR * 0.3, bR * 0.1, bx, by + 4, bR)
    blobGrad.addColorStop(0, bossHpPct > 0.5 ? 'rgba(220,60,60,0.97)' : bossHpPct > 0.25 ? 'rgba(210,100,30,0.97)' : 'rgba(140,10,10,0.97)')
    blobGrad.addColorStop(1, 'rgba(20,5,5,0.99)')
    ctx.fillStyle = blobGrad
    ctx.shadowColor = bossColor
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.ellipse(bx, by + 3, bR, bR * 0.9, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Darker belly
    ctx.save()
    ctx.globalAlpha = 0.2
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(bx, by + bR * 0.4, bR * 0.65, bR * 0.35, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Rim stroke
    ctx.strokeStyle = bossColor; ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(bx, by + 3, bR, bR * 0.9, 0, 0, Math.PI * 2)
    ctx.stroke()

    // Boss eyes — large angry eyes
    const eyeY = by - bR * 0.15
    const eyeAnger = Math.PI * 0.18 // angry eyebrow angle
    // White of eyes
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.ellipse(bx - bR * 0.32, eyeY, 7, 9, -eyeAnger, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(bx + bR * 0.32, eyeY, 7, 9,  eyeAnger, 0, Math.PI * 2); ctx.fill()
    // Pupils — red and menacing
    ctx.fillStyle = bossColor
    ctx.shadowColor = bossColor; ctx.shadowBlur = 8
    ctx.beginPath(); ctx.arc(bx - bR * 0.3, eyeY + 2, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(bx + bR * 0.3, eyeY + 2, 4, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
    // Angry brow lines
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(bx - bR * 0.5, eyeY - 10); ctx.lineTo(bx - bR * 0.15, eyeY - 6)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(bx + bR * 0.5, eyeY - 10); ctx.lineTo(bx + bR * 0.15, eyeY - 6)
    ctx.stroke()
    ctx.lineCap = 'butt'

    // Highlight glint
    ctx.save()
    ctx.globalAlpha = 0.2
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.ellipse(bx - bR * 0.25, by - bR * 0.5, bR * 0.28, bR * 0.14, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    // Boss name above
    ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#f09595'
    ctx.shadowColor = '#f09595'; ctx.shadowBlur = 6
    ctx.fillText(boss?.name ?? 'Boss', bx, by - bR - 22)
    ctx.shadowBlur = 0

    // HP bar
    const barW = 100; const barH = 7
    const barX = bx - barW / 2; const barY = by - bR - 17
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = bossColor
    ctx.shadowColor = bossColor; ctx.shadowBlur = 6
    ctx.fillRect(barX, barY, barW * bossHpPct, barH)
    ctx.shadowBlur = 0

    // ── Players — cute blobs ──────────────────────────────────────────────────
    const REALM_BLOB_COLORS: Record<string, string> = {
      academia: '#5588ee', tech: '#44ddaa', medicine: '#44cc66',
      creative: '#ee8844', law: '#aa66ee',
    }
    const myId = userIdRef.current
    teamRef.current.forEach((fighter) => {
      const pos = positionsRef.current.get(fighter.userId)
      if (!pos) return
      if (!ctx) return

      const isMe = fighter.userId === myId
      const blobColor = REALM_BLOB_COLORS[fighter.realm] ?? '#9b72cf'
      const R = PLAYER_RADIUS

      ctx.save()
      if (fighter.isDead) ctx.globalAlpha = 0.28

      // Brace glow — blue shield ring
      if (fighter.isBracing) {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, R + 7, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(55,138,221,0.15)'; ctx.fill()
        ctx.strokeStyle = 'rgba(100,180,255,0.7)'; ctx.lineWidth = 2
        ctx.shadowColor = '#3399ff'; ctx.shadowBlur = 8
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // Outer glow for self
      if (isMe) {
        ctx.beginPath(); ctx.arc(pos.x, pos.y, R + 6, 0, Math.PI * 2)
        ctx.fillStyle = blobColor + '33'
        ctx.shadowColor = blobColor; ctx.shadowBlur = 14
        ctx.fill(); ctx.shadowBlur = 0
      }

      // Ground shadow
      ctx.save()
      ctx.globalAlpha = (fighter.isDead ? 0.08 : 0.25)
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.ellipse(pos.x, pos.y + R + 3, R * 0.7, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Blob body
      ctx.fillStyle = blobColor
      ctx.shadowColor = blobColor
      ctx.shadowBlur = isMe ? 10 : 3
      ctx.beginPath()
      ctx.ellipse(pos.x, pos.y + 2, R, R * 0.92, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // Belly shading
      ctx.save()
      ctx.globalAlpha = 0.22
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.ellipse(pos.x, pos.y + 5, R * 0.6, R * 0.35, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Eyes
      const eyeY = pos.y - 1
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(pos.x - 5, eyeY, 3.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(pos.x + 5, eyeY, 3.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#1a1a2a'
      ctx.beginPath(); ctx.arc(pos.x - 4, eyeY + 1, 2, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(pos.x + 4, eyeY + 1, 2, 0, Math.PI * 2); ctx.fill()

      // Glint
      ctx.save()
      ctx.globalAlpha = 0.5
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(pos.x - 4, pos.y - 7, 4, 2.5, -0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Name label
      ctx.font = `${isMe ? '600' : '500'} 9px system-ui`
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = isMe ? '#fff' : 'rgba(220,200,255,0.8)'
      ctx.fillText(fighter.name.slice(0, 10) + (fighter.isDead ? ' 💀' : ''), pos.x, pos.y - R - 5)

      ctx.restore()
    })

    // Range indicator for local player
    const myPos = myId ? positionsRef.current.get(myId) : null
    if (myPos) {
      const d = distXY(myPos.x, myPos.y, bossPosRef.current.x, bossPosRef.current.y)
      if (d < MELEE_RANGE * 2) {
        ctx.beginPath(); ctx.arc(myPos.x, myPos.y, MELEE_RANGE, 0, Math.PI * 2)
        ctx.strokeStyle = d < MELEE_RANGE ? 'rgba(227,75,74,0.25)' : 'rgba(155,114,207,0.1)'
        ctx.lineWidth = 1; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([])
      }
    }

    // ── Projectile update + hit detection ────────────────────────────────────
    const localUserId = userIdRef.current
    const surviving: Projectile[] = []
    for (const proj of projectilesRef.current) {
      const alive = updateProjectile(proj, dtMs)
      if (!alive) continue
      if (proj.targetId === localUserId) {
        const myPos2 = localUserId ? positionsRef.current.get(localUserId) : null
        if (myPos2 && checkHit(proj, myPos2.x, myPos2.y)) {
          proj.hit = true
          applyBossDamage(localUserId, proj.damage, proj.color, proj.x, proj.y)
          // Sync updated HP to teammates
          const updatedMe = teamRef.current.find(f => f.userId === localUserId)
          if (updatedMe) channelRef.current?.send({ type: 'broadcast', event: 'hp_sync', payload: { userId: localUserId, currentHp: updatedMe.currentHp } })
          continue
        }
      }
      drawProjectile(ctx, proj)
      surviving.push(proj)
    }
    projectilesRef.current = surviving
    hitFlashesRef.current = hitFlashesRef.current.filter(h => {
      h.age += dtMs
      if (h.age > 300) return false
      drawHitFlash(ctx, h.x, h.y, h.color, h.age)
      return true
    })

    animFrameRef.current = requestAnimationFrame(draw)
  }, [boss, applyBossDamage])

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

        const d = distXY(pos.x, pos.y, bossPosRef.current.x, bossPosRef.current.y)
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

  // Grace period countdown log
  useEffect(() => {
    if (phase !== 'fighting') return
    const timers = [
      setTimeout(() => addLog('⚠️ Boss moves in 2 seconds...'), 1000),
      setTimeout(() => addLog('⚠️ Boss moves in 1 second...'), 2000),
      setTimeout(() => addLog(`${boss?.icon ?? '👹'} The boss charges!`), 3000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [phase, boss])

  // ── Boss AI interval ref (started when battle begins) ─────────────────────
  const bossAIIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const runBossAIRef = useRef(runBossAI)
  useEffect(() => { runBossAIRef.current = runBossAI }, [runBossAI])

  function startBossAI() {
    if (bossAIIntervalRef.current) return // already running
    bossAIIntervalRef.current = setInterval(() => {
      runBossAIRef.current()
    }, 33) // ~30fps for smooth movement
  }

  function startBattle() {
    // Any party member can start — the leader runs boss AI, non-leaders just broadcast
    // Reset boss timers — grace period before first attack
    bossStateRef.current.lastAttackAt = Date.now() + 3000 // first attack after 3s
    bossStateRef.current.lastSkillAt  = Date.now() + 6000 // first skill after 6s
    battleStartTimeRef.current = Date.now()
    channelRef.current?.send({ type: 'broadcast', event: 'start', payload: { startTime: Date.now() } })
    setPhase('fighting')
    phaseRef.current = 'fighting'
    addLog(`${boss?.icon ?? '👹'} ${boss?.name ?? 'The Boss'} awakens!`)
    addLog(`⏳ 3 seconds before the boss attacks — get ready!`)
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

      // Fetch stats from DB (not URL — prevents cheating)
      const statsRes = await fetch(`/api/pve/get-stats?battle_id=${battleId}`)
      const statsData = await statsRes.json()
      if (!statsData.stats) { router.push('/map'); return }
      const { hp, attack, defence, realm } = statsData.stats
      setMyStats({ hp, attack, defence, realm })

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
      channel.on('broadcast', { event: 'start' }, ({ payload }: { payload: { startTime: number } }) => {
        setPhase('fighting')
        phaseRef.current = 'fighting'
        battleStartTimeRef.current = payload.startTime
        addLog(`${boss?.icon ?? '👹'} ${boss?.name ?? 'The Boss'} awakens!`)
        addLog(`⏳ 3 seconds before the boss attacks — get ready!`)
        animFrameRef.current = requestAnimationFrame(draw)
        if (isLeaderRef.current) startBossAI()
      })

      // Boss position sync (non-leaders receive from leader)
      channel.on('broadcast', { event: 'boss_move' }, ({ payload }: { payload: { x: number, y: number } }) => {
        if (isLeaderRef.current) return // leader owns position
        bossPosRef.current = { x: payload.x, y: payload.y }
        // Update inRange
        const myPos = userIdRef.current ? positionsRef.current.get(userIdRef.current) : null
        if (myPos) {
          const d = distXY(myPos.x, myPos.y, payload.x, payload.y)
          setInRange(d < MELEE_RANGE)
        }
      })

      // HP sync — update teammate HP bars after heal or boss damage
      channel.on('broadcast', { event: 'hp_sync' }, ({ payload }: { payload: { userId: string, currentHp: number } }) => {
        if (payload.userId === userIdRef.current) return // ignore own
        setTeam(prev => {
          const next = prev.map(f => f.userId === payload.userId ? { ...f, currentHp: payload.currentHp } : f)
          teamRef.current = next
          return next
        })
      })

      // Boss projectile — non-leaders spawn it locally for hit detection
      channel.on('broadcast', { event: 'boss_projectile' }, ({ payload }: { payload: { targetId: string, damage: number, fromX: number, fromY: number, toX: number, toY: number, realm: string } }) => {
        if (phaseRef.current !== 'fighting') return
        if (isLeaderRef.current) return // leader already spawned it in fireBossProjectile
        const proj = createBossProjectile(payload.realm, payload.fromX, payload.fromY, payload.toX, payload.toY, payload.targetId, payload.damage)
        projectilesRef.current.push(proj)
        audioManager.playSFX('bossAttack')
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
              // 15% max HP for special skills (slightly more than normal 10%)
              const dmg = Math.round(f.maxHp * 0.15)
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
            setTeam(prev => {
              const next = prev.map(f => {
                if (!payload.targetIds.includes(f.userId) || f.isDead) return f
                const dotDmg = Math.round(f.maxHp * 0.04) // 4% max HP per tick
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
        if (payload.attackerId === userIdRef.current) return // already applied locally
        const { type, attackerId, damage, heal, healTargetId, effect } = payload

        // Update boss HP on strike from teammate
        if (type === 'strike' || type === 'realm_offensive') {
          const dmg = damage ?? 0
          bossStateRef.current.currentHp = Math.max(0, bossStateRef.current.currentHp - dmg)
          setBossHp(bossStateRef.current.currentHp)
          addLog(`⚔️ ${teamRef.current.find(t => t.userId === attackerId)?.name ?? 'Ally'} hit boss for ${dmg}!`)
          if (bossStateRef.current.currentHp <= 0) endBattle(true)
        }

        // Team heal from teammate
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

        if (effect === 'boss_defence_debuff') {
          addLog(`📖 Boss Defence reduced for the whole team!`)
        }
      })

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // First to subscribe becomes leader
          const stateBefore = channel.presenceState()
          isLeaderRef.current = Object.keys(stateBefore).length === 0
          await channel.track({ name: data.character?.name ?? 'Unknown', hp, attack, defence, gold, realm })

          // Populate team from players already in the lobby (missed join events)
          const stateAfter = channel.presenceState()
          setTeam(prev => {
            let next = [...prev]
            Object.entries(stateAfter).forEach(([key, presences]) => {
              if (key === user.id) return // already added self
              if (next.find(f => f.userId === key)) return
              const p = (presences as unknown as { name: string; hp: number; attack: number; defence: number; gold: number; realm: string }[])[0]
              if (!p) return
              const spawnIdx = Math.min(next.length, SPAWN_POSITIONS.length - 1)
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
              next = [...next, newFighter]
              addLog(`⚔️ ${p.name} is already in the party!`)
            })
            teamRef.current = next
            setPartyCount(next.length)
            return next
          })

          addLog(isLeaderRef.current
            ? '👑 You are the party leader. Start when ready.'
            : '⚔️ You joined the party. Anyone can begin the battle.'
          )
        }
      })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key)
      if (e.code === 'Space') { e.preventDefault(); handleBraceRef.current() }
      if (e.code === 'KeyQ')  { e.preventDefault(); handleRealmSkillRef.current() }
    }
    const onKeyUp   = (e: KeyboardEvent) => keysRef.current.delete(e.key)
    const onContext = (e: MouseEvent) => { e.preventDefault(); handleStrikeRef.current() }

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
    // Apply locally first (sender doesn't receive own broadcasts)
    if (type === 'strike' || type === 'realm_offensive') {
      const dmg = (payload.damage as number) ?? 0
      bossStateRef.current.currentHp = Math.max(0, bossStateRef.current.currentHp - dmg)
      setBossHp(bossStateRef.current.currentHp)
      if (bossStateRef.current.currentHp <= 0) endBattle(true)
    }
    if (type === 'realm_heal') {
      const healTargetId = payload.healTargetId as string
      const heal = (payload.heal as number) ?? 0
      const me = teamRef.current.find(f => f.userId === userIdRef.current)
      setTeam(prev => {
        const next = prev.map(f => {
          if (f.userId !== healTargetId) return f
          const newHp = Math.min(f.maxHp, f.currentHp + heal)
          addLog(`⚕️ ${me?.name ?? 'You'} healed ${f.name} for ${heal} HP!`)
          // Sync healed HP to all teammates
          channelRef.current?.send({ type: 'broadcast', event: 'hp_sync', payload: { userId: healTargetId, currentHp: newHp } })
          return { ...f, currentHp: newHp }
        })
        teamRef.current = next
        return next
      })
    }
    // Broadcast to teammates
    channelRef.current?.send({
      type: 'broadcast', event: 'player_action',
      payload: { ...payload, type, attackerId: userIdRef.current, timestamp: Date.now() },
    })
  }

  // Returns the boss's current effective defence (reduced if debuffed)
  function getBossDefence() {
    const b = boss as Boss & { _tempDefence?: number }
    return b?._tempDefence ?? boss?.defence ?? 0
  }

  function handleStrike() {
    const me = teamRef.current.find(f => f.userId === userIdRef.current)
    if (!me || phaseRef.current !== 'fighting' || me.isStunned || me.isDead) return
    const now = Date.now()
    if (now - lastStrikeRef.current < STRIKE_COOLDOWN_MS) return
    lastStrikeRef.current = now
    if (!inRange) { addLog('⚔️ Too far! Move closer to the boss.'); return }

    const myPos = positionsRef.current.get(me.userId)
    const effectiveAttack = me.attack * me.attackDebuffMultiplier
    const damage = calcDamage(effectiveAttack, getBossDefence(), 1.0, false)

    // Spawn visual sword projectile
    if (myPos) {
      const proj = createSword(myPos.x, myPos.y, bossPosRef.current.x, bossPosRef.current.y, 'boss', damage)
      audioManager.playSFX('playerAttack')
      projectilesRef.current.push(proj)
      hitFlashesRef.current.push({ x: bossPosRef.current.x, y: bossPosRef.current.y, color: proj.color, age: 0 })
    }

    addLog(`⚔️ ${me.name} struck the boss for ${damage}!`)
    firePlayerAction('strike', { damage })
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

    const skill = REALM_SKILLS[me.realm]
    if (!skill) return
    const cooldownMs = skill.cooldown * 1000
    if (Date.now() - me.realmSkillLastUsed < cooldownMs) return

    const needsRange = skill.multiplier || skill.defenceDebuff || skill.attackDebuff || skill.stunChance
    if (needsRange && !inRange) { addLog(`${skill.icon} Too far! Get closer to use ${skill.name}.`); return }

    const now2 = Date.now()
    setRealmCooldownUntil(now2 + cooldownMs)
    setTeam(prev => prev.map(f => f.userId === me.userId ? { ...f, realmSkillLastUsed: now2 } : f))

    const effectiveAttack = me.attack * me.attackDebuffMultiplier
    const myPos = positionsRef.current.get(me.userId)
    const bx = bossPosRef.current.x; const by = bossPosRef.current.y

    // ── Offensive damage to boss ─────────────────────────────────────────────
    if (skill.multiplier) {
      const damage = calcDamage(effectiveAttack, getBossDefence(), skill.multiplier, false)
      // Spawn realm projectile visual
      if (myPos) {
        const proj = createRealmProjectile(me.realm, myPos.x, myPos.y, bx, by, 'boss', damage)
        audioManager.playSFX('playerAttack')
        projectilesRef.current.push(proj)
        hitFlashesRef.current.push({ x: bx, y: by, color: proj.color, age: 0 })
      }
      addLog(`${skill.icon} ${me.name} used ${skill.name}: ${damage} damage to boss!`)
      firePlayerAction('realm_offensive', { damage })
    }

    // ── Medicine: heal selected target with visual pulse ──────────────────────
    if (skill.healPercent) {
      const alive = teamRef.current.filter(f => !f.isDead)
      const target = alive.find(f => f.userId === selectedHealTarget)
        ?? alive.find(f => f.userId === userIdRef.current)
        ?? alive[0]
      if (target) {
        const healAmount = Math.round(me.maxHp * skill.healPercent)
        const targetPos = positionsRef.current.get(target.userId)
        if (myPos && targetPos) {
          const proj = createHealPulse(myPos.x, myPos.y, targetPos.x, targetPos.y, target.userId, healAmount)
          projectilesRef.current.push(proj)
          hitFlashesRef.current.push({ x: targetPos.x, y: targetPos.y, color: proj.color, age: 0 })
        }
        firePlayerAction('realm_heal', { heal: healAmount, healTargetId: target.userId })
        setSelectedHealTarget(null)
      }
    }

    // ── Academia: reduce boss defence with orb visual ─────────────────────────
    if (skill.defenceDebuff) {
      if (myPos) {
        const proj = createRealmProjectile(me.realm, myPos.x, myPos.y, bx, by, 'boss', 0)
        projectilesRef.current.push(proj)
      }
      addLog(`${skill.icon} ${me.name} weakened the boss's defence for the whole team!`)
      firePlayerAction('realm_debuff', { effect: 'boss_defence_debuff', defenceDebuff: skill.defenceDebuff, debuffDuration: (skill.debuffDuration ?? 2) * 1000 })
      if (isLeaderRef.current && boss) {
        const debuffed = Math.round((boss.defence ?? 0) * (1 - skill.defenceDebuff))
        ;(boss as Boss & { _tempDefence?: number })._tempDefence = debuffed
        setTimeout(() => { delete (boss as Boss & { _tempDefence?: number })._tempDefence }, (skill.debuffDuration ?? 2) * 1000)
      }
    }

    // ── Law: reduce boss attack with verdict visual ────────────────────────────
    if (skill.attackDebuff) {
      if (myPos) {
        const proj = createRealmProjectile(me.realm, myPos.x, myPos.y, bx, by, 'boss', 0)
        projectilesRef.current.push(proj)
      }
      addLog(`${skill.icon} ${me.name} issued a Verdict — boss attack reduced for everyone!`)
      firePlayerAction('realm_debuff', { effect: 'boss_attack_debuff', attackDebuff: skill.attackDebuff, debuffDuration: (skill.debuffDuration ?? 3) * 1000 })
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  const handleStrikeRef = useRef(handleStrike)
  const handleBraceRef = useRef(handleBrace)
  const handleRealmSkillRef = useRef(handleRealmSkill)
  handleStrikeRef.current = handleStrike
  handleBraceRef.current = handleBrace
  handleRealmSkillRef.current = handleRealmSkill

  const realmCooldownLeft = Math.max(0, (realmCooldownUntil - now) / 1000)
  const realmSkill = REALM_SKILLS[myStats?.realm ?? 'academia']
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
              const isMedicPlayer = myStats?.realm === 'medicine' && phase === 'fighting'
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
        {myStats?.realm === 'medicine' && phase === 'fighting' && (
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
            <button
              onClick={startBattle}
              style={{ padding: '0.75rem 2.5rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.5), rgba(99,57,134,0.5))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>
              ⚔️ Begin Battle
            </button>
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
      <AudioControls />
    </div>
  )
}
