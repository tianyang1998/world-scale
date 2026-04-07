// web/lib/showcase.ts
// Auto-playing showcase engine for the landing page.
// Drives 3 scripted scenes on a canvas using requestAnimationFrame.
// All game state is faked — no Supabase, no real players.

import {
  drawTerrain, drawPaths, drawRiver, drawBridge,
  drawBuildings, drawTrees, drawBushes, drawLandmark, drawBossLair,
} from './map-draw'
import { TIER_MAP_DATA, type TierMapData } from './map-data'
import {
  type Projectile,
  createLightning, createPaint,
  updateProjectile, drawProjectile,
} from './projectiles'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ShowcaseCallbacks {
  onSceneChange?: (scene: number) => void   // 0, 1, 2
  onComplete?: () => void
}

interface FakePlayer {
  x: number
  y: number
  vx: number
  vy: number
  color: string
  radius: number
}

interface BattlePlayer {
  id: string
  x: number
  y: number
  hp: number
  maxHp: number
  color: string
  name: string
  lastShot: number
  vx: number
  vy: number
  moveTimer: number
}

// ── Constants ───────────────────────────────────────────────────────────────

const MAP_W = 2400
const MAP_H = 1600
const SCENE_DURATIONS = [8000, 10000, 8000]
const FADE_DURATION = 500
const TIER_DATA = TIER_MAP_DATA['Sage']

// ── Scene 1: The World ──────────────────────────────────────────────────────

function createFakePlayers(count: number): FakePlayer[] {
  const players: FakePlayer[] = []
  const colors = ['#e8a0a0', '#a0c8e8', '#a0e8b0', '#e8d8a0', '#c8a0e8', '#e8b8a0']
  for (let i = 0; i < count; i++) {
    players.push({
      x: 200 + Math.random() * (MAP_W - 400),
      y: 200 + Math.random() * (MAP_H - 400),
      vx: (Math.random() - 0.5) * 0.04,
      vy: (Math.random() - 0.5) * 0.04,
      color: colors[i % colors.length],
      radius: 5,
    })
  }
  return players
}

function updateFakePlayers(players: FakePlayer[], dt: number) {
  for (const p of players) {
    // Occasionally change direction
    if (Math.random() < 0.01) {
      p.vx = (Math.random() - 0.5) * 0.04
      p.vy = (Math.random() - 0.5) * 0.04
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
    // Clamp to map bounds
    if (p.x < 50) { p.x = 50; p.vx = Math.abs(p.vx) }
    if (p.x > MAP_W - 50) { p.x = MAP_W - 50; p.vx = -Math.abs(p.vx) }
    if (p.y < 50) { p.y = 50; p.vy = Math.abs(p.vy) }
    if (p.y > MAP_H - 50) { p.y = MAP_H - 50; p.vy = -Math.abs(p.vy) }
  }
}

function drawFakePlayers(
  ctx: CanvasRenderingContext2D, players: FakePlayer[],
  camX: number, camY: number, cw: number, ch: number,
) {
  for (const p of players) {
    const sx = p.x - camX
    const sy = p.y - camY
    if (sx < -10 || sx > cw + 10 || sy < -10 || sy > ch + 10) continue
    // Shadow
    ctx.beginPath()
    ctx.ellipse(sx, sy + 4, p.radius, p.radius * 0.4, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()
    // Body
    ctx.beginPath()
    ctx.arc(sx, sy, p.radius, 0, Math.PI * 2)
    ctx.fillStyle = p.color
    ctx.fill()
    // Highlight
    ctx.beginPath()
    ctx.arc(sx - 1.5, sy - 1.5, p.radius * 0.35, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fill()
  }
}

function renderScene1(
  ctx: CanvasRenderingContext2D, cw: number, ch: number,
  elapsed: number, timestamp: number,
  players: FakePlayer[], dt: number,
) {
  updateFakePlayers(players, dt)

  // Camera pans left-to-right across the map
  const panProgress = Math.min(elapsed / SCENE_DURATIONS[0], 1)
  // Ease in-out
  const eased = panProgress < 0.5
    ? 2 * panProgress * panProgress
    : 1 - Math.pow(-2 * panProgress + 2, 2) / 2
  const camX = eased * (MAP_W - cw)
  const camY = (MAP_H - ch) / 2

  drawTerrain(ctx, cw, ch, camX, camY, TIER_DATA)
  drawPaths(ctx, camX, camY, TIER_DATA)
  drawRiver(ctx, cw, ch, camX, camY, TIER_DATA, timestamp)
  drawBridge(ctx, camX, camY, TIER_DATA)
  drawBuildings(ctx, camX, camY, TIER_DATA)
  drawTrees(ctx, camX, camY, cw, ch, TIER_DATA)
  drawBushes(ctx, camX, camY, cw, ch, TIER_DATA)
  drawLandmark(ctx, camX, camY, cw, ch, TIER_DATA.landmark, TIER_DATA, timestamp)
  drawBossLair(ctx, camX, camY, cw, ch, TIER_DATA.bossLair, { icon: '\u{1F480}', name: 'Boss' }, timestamp)
  drawFakePlayers(ctx, players, camX, camY, cw, ch)
}

// ── Scene 2: The Battle ─────────────────────────────────────────────────────

const ARENA_W = 600
const ARENA_H = 400

function createBattlePlayers(): [BattlePlayer, BattlePlayer] {
  return [
    {
      id: 'p1', x: 150, y: 200, hp: 100, maxHp: 100,
      color: '#EF9F27', name: 'Voltaire',
      lastShot: 0, vx: 0, vy: 0, moveTimer: 0,
    },
    {
      id: 'p2', x: 450, y: 200, hp: 100, maxHp: 100,
      color: '#cf7272', name: 'Picasso',
      lastShot: 0, vx: 0, vy: 0, moveTimer: 0,
    },
  ]
}

function updateBattleAI(
  players: [BattlePlayer, BattlePlayer],
  projectiles: Projectile[],
  elapsed: number,
  dt: number,
): Projectile[] {
  const newProjectiles: Projectile[] = []
  for (let i = 0; i < 2; i++) {
    const me = players[i]
    const other = players[1 - i]

    // Movement AI: wander and dodge
    me.moveTimer -= dt
    if (me.moveTimer <= 0) {
      me.vx = (Math.random() - 0.5) * 0.12
      me.vy = (Math.random() - 0.5) * 0.12
      me.moveTimer = 500 + Math.random() * 1000
    }
    me.x += me.vx * dt
    me.y += me.vy * dt
    // Clamp to arena
    me.x = Math.max(40, Math.min(ARENA_W - 40, me.x))
    me.y = Math.max(40, Math.min(ARENA_H - 40, me.y))

    // Shoot every ~1.2s
    if (elapsed - me.lastShot > 1200) {
      me.lastShot = elapsed
      const proj = i === 0
        ? createLightning(me.x, me.y, other.x, other.y, other.id, 12)
        : createPaint(me.x, me.y, other.x, other.y, other.id, 10)
      newProjectiles.push(proj)
    }
  }
  return newProjectiles
}

function drawArenaBackground(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
  // Center the arena
  const ox = (cw - ARENA_W) / 2
  const oy = (ch - ARENA_H) / 2

  // Dark floor
  ctx.fillStyle = '#1a1a2e'
  ctx.fillRect(0, 0, cw, ch)

  // Arena
  ctx.fillStyle = '#252540'
  ctx.fillRect(ox, oy, ARENA_W, ARENA_H)

  // Border
  ctx.strokeStyle = '#444466'
  ctx.lineWidth = 2
  ctx.strokeRect(ox, oy, ARENA_W, ARENA_H)

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  for (let x = 0; x <= ARENA_W; x += 40) {
    ctx.beginPath()
    ctx.moveTo(ox + x, oy)
    ctx.lineTo(ox + x, oy + ARENA_H)
    ctx.stroke()
  }
  for (let y = 0; y <= ARENA_H; y += 40) {
    ctx.beginPath()
    ctx.moveTo(ox, oy + y)
    ctx.lineTo(ox + ARENA_W, oy + y)
    ctx.stroke()
  }
}

function drawBattlePlayers(
  ctx: CanvasRenderingContext2D, players: [BattlePlayer, BattlePlayer],
  ox: number, oy: number,
) {
  for (const p of players) {
    const sx = ox + p.x
    const drawY = oy + p.y

    // Shadow
    ctx.beginPath()
    ctx.ellipse(sx, drawY + 12, 14, 5, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.4)'
    ctx.fill()

    // Body circle
    ctx.beginPath()
    ctx.arc(sx, drawY, 12, 0, Math.PI * 2)
    ctx.fillStyle = p.color
    ctx.fill()

    // Highlight
    ctx.beginPath()
    ctx.arc(sx - 3, drawY - 3, 4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fill()

    // HP bar
    const barW = 30
    const barH = 4
    const barX = sx - barW / 2
    const barY = drawY - 20
    ctx.fillStyle = '#333'
    ctx.fillRect(barX, barY, barW, barH)
    const hpFrac = Math.max(0, p.hp / p.maxHp)
    ctx.fillStyle = hpFrac > 0.5 ? '#4a4' : hpFrac > 0.25 ? '#aa4' : '#a44'
    ctx.fillRect(barX, barY, barW * hpFrac, barH)

    // Name
    ctx.fillStyle = '#ccc'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(p.name, sx, barY - 4)
  }
}

function drawBattleProjectiles(
  ctx: CanvasRenderingContext2D, projectiles: Projectile[],
  ox: number, oy: number,
) {
  ctx.save()
  ctx.translate(ox, oy)
  for (const p of projectiles) {
    drawProjectile(ctx, p)
  }
  ctx.restore()
}

function renderScene2(
  ctx: CanvasRenderingContext2D, cw: number, ch: number,
  elapsed: number, dt: number,
  players: [BattlePlayer, BattlePlayer],
  projectiles: Projectile[],
): Projectile[] {
  const ox = (cw - ARENA_W) / 2
  const oy = (ch - ARENA_H) / 2

  // Update AI
  const newProj = updateBattleAI(players, projectiles, elapsed, dt)
  projectiles.push(...newProj)

  // Update projectiles and check hits
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]
    const alive = updateProjectile(p, dt)
    if (!alive) {
      projectiles.splice(i, 1)
      continue
    }
    // Check hit on target
    const target = players.find(pl => pl.id === p.targetId)
    if (target) {
      const dx = p.x - target.x
      const dy = p.y - target.y
      if (Math.sqrt(dx * dx + dy * dy) < p.hitRadius) {
        target.hp -= p.damage
        p.hit = true
        projectiles.splice(i, 1)
        // Respawn if dead
        if (target.hp <= 0) {
          target.hp = target.maxHp
          target.x = target.id === 'p1' ? 150 : 450
          target.y = 200
        }
      }
    }
  }

  // Draw
  drawArenaBackground(ctx, cw, ch)
  drawBattleProjectiles(ctx, projectiles, ox, oy)
  drawBattlePlayers(ctx, players, ox, oy)

  return projectiles
}

// ── Scene 3: The Journey ────────────────────────────────────────────────────

function renderScene3(
  ctx: CanvasRenderingContext2D, cw: number, ch: number,
  elapsed: number,
) {
  const duration = SCENE_DURATIONS[2]

  // Dark background
  ctx.fillStyle = '#0e0e1a'
  ctx.fillRect(0, 0, cw, ch)

  const cx = cw / 2
  const cy = ch / 2

  // Phase timing within scene
  const phase1End = duration * 0.35   // character card with stats
  const phase2End = duration * 0.7    // leaderboard
  // phase3 = rest                    // cosmetic equip

  if (elapsed < phase1End) {
    // ── Phase 1: Character card with stats filling in ──
    const t = elapsed / phase1End

    // Card background
    const cardW = Math.min(280, cw * 0.6)
    const cardH = Math.min(340, ch * 0.7)
    const cardX = cx - cardW / 2
    const cardY = cy - cardH / 2

    ctx.fillStyle = '#1a1a2e'
    ctx.strokeStyle = '#9060c0'
    ctx.lineWidth = 2
    roundRect(ctx, cardX, cardY, cardW, cardH, 12)
    ctx.fill()
    ctx.stroke()

    // Avatar circle
    ctx.beginPath()
    ctx.arc(cx, cardY + 60, 30, 0, Math.PI * 2)
    ctx.fillStyle = '#9060c0'
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 24px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('\u{2694}', cx, cardY + 60)

    // Name
    ctx.fillStyle = '#e0d0f0'
    ctx.font = 'bold 16px monospace'
    ctx.textBaseline = 'top'
    ctx.fillText('WorldScaler_42', cx, cardY + 100)

    // Stats that fill in progressively
    const stats = [
      { label: 'Level', value: '27', icon: '\u{2B50}' },
      { label: 'Tier', value: 'Sage', icon: '\u{1F52E}' },
      { label: 'PvP Wins', value: '143', icon: '\u{2694}' },
      { label: 'Boss Kills', value: '38', icon: '\u{1F480}' },
    ]

    for (let i = 0; i < stats.length; i++) {
      const statT = Math.max(0, Math.min(1, (t - i * 0.2) / 0.25))
      if (statT <= 0) continue

      const sy = cardY + 135 + i * 38
      const alpha = statT
      ctx.globalAlpha = alpha

      // Stat row
      ctx.fillStyle = '#555'
      ctx.font = '12px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`${stats[i].icon} ${stats[i].label}`, cardX + 30, sy)

      // Value slides in from right
      ctx.fillStyle = '#e0d0f0'
      ctx.font = 'bold 14px monospace'
      ctx.textAlign = 'right'
      const slideX = cardX + cardW - 30 + (1 - statT) * 40
      ctx.fillText(stats[i].value, slideX, sy)

      ctx.globalAlpha = 1
    }

  } else if (elapsed < phase2End) {
    // ── Phase 2: Leaderboard rows appearing ──
    const t = (elapsed - phase1End) / (phase2End - phase1End)

    const boardW = Math.min(320, cw * 0.7)
    const boardH = Math.min(300, ch * 0.65)
    const boardX = cx - boardW / 2
    const boardY = cy - boardH / 2

    // Title
    ctx.fillStyle = '#e0d0f0'
    ctx.font = 'bold 18px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('\u{1F3C6} Leaderboard', cx, boardY)

    // Header line
    ctx.strokeStyle = '#444'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(boardX, boardY + 28)
    ctx.lineTo(boardX + boardW, boardY + 28)
    ctx.stroke()

    const rows = [
      { rank: 1, name: 'LegendX', score: '4,210', color: '#ffd700' },
      { rank: 2, name: 'SageQueen', score: '3,870', color: '#c0c0c0' },
      { rank: 3, name: 'ThunderMage', score: '3,540', color: '#cd7f32' },
      { rank: 4, name: 'WorldScaler_42', score: '3,220', color: '#9060c0' },
      { rank: 5, name: 'DarkPaladin', score: '2,980', color: '#888' },
      { rank: 6, name: 'NovaBlade', score: '2,710', color: '#888' },
    ]

    for (let i = 0; i < rows.length; i++) {
      const rowT = Math.max(0, Math.min(1, (t - i * 0.12) / 0.18))
      if (rowT <= 0) continue

      const ry = boardY + 40 + i * 36
      ctx.globalAlpha = rowT

      // Highlight player's own row
      if (rows[i].rank === 4) {
        ctx.fillStyle = 'rgba(144,96,192,0.15)'
        ctx.fillRect(boardX, ry - 4, boardW, 30)
      }

      // Rank
      ctx.fillStyle = rows[i].color
      ctx.font = 'bold 14px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(`#${rows[i].rank}`, boardX + 10, ry + 8)

      // Name
      ctx.fillStyle = '#ccc'
      ctx.font = '13px monospace'
      ctx.fillText(rows[i].name, boardX + 60, ry + 8)

      // Score slides in
      ctx.fillStyle = '#aaa'
      ctx.font = '12px monospace'
      ctx.textAlign = 'right'
      const slideX = boardX + boardW - 10 + (1 - rowT) * 30
      ctx.fillText(rows[i].score, slideX, ry + 8)

      ctx.globalAlpha = 1
    }

  } else {
    // ── Phase 3: Cosmetic title equip ──
    const t = (elapsed - phase2End) / (duration - phase2End)

    // Card
    const cardW = Math.min(280, cw * 0.6)
    const cardH = Math.min(200, ch * 0.45)
    const cardX = cx - cardW / 2
    const cardY = cy - cardH / 2

    ctx.fillStyle = '#1a1a2e'
    ctx.strokeStyle = '#9060c0'
    ctx.lineWidth = 2
    roundRect(ctx, cardX, cardY, cardW, cardH, 12)
    ctx.fill()
    ctx.stroke()

    // "Equipping title..." label
    ctx.fillStyle = '#888'
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('Equipping cosmetic...', cx, cardY + 20)

    // Title appears with glow
    const titleAlpha = Math.min(1, t * 2)
    ctx.globalAlpha = titleAlpha

    // Glow
    const glowRadius = 60 + Math.sin(t * Math.PI * 4) * 10
    const grad = ctx.createRadialGradient(cx, cardY + 80, 0, cx, cardY + 80, glowRadius)
    grad.addColorStop(0, 'rgba(144,96,192,0.3)')
    grad.addColorStop(1, 'rgba(144,96,192,0)')
    ctx.fillStyle = grad
    ctx.fillRect(cardX, cardY + 40, cardW, 80)

    // Title text
    ctx.fillStyle = '#e0d0f0'
    ctx.font = 'bold 20px monospace'
    ctx.fillText('\u{2728} Sage of Storms \u{2728}', cx, cardY + 75)

    ctx.globalAlpha = 1

    // Border preview
    const borderAlpha = Math.max(0, Math.min(1, (t - 0.4) * 2.5))
    if (borderAlpha > 0) {
      ctx.globalAlpha = borderAlpha

      // Decorative border around card
      ctx.strokeStyle = '#9060c0'
      ctx.lineWidth = 3
      ctx.setLineDash([8, 4])
      roundRect(ctx, cardX - 6, cardY - 6, cardW + 12, cardH + 12, 16)
      ctx.stroke()
      ctx.setLineDash([])

      // "Border: Arcane Filigree" label
      ctx.fillStyle = '#b090d0'
      ctx.font = '11px monospace'
      ctx.fillText('Border: Arcane Filigree', cx, cardY + cardH - 30)

      ctx.globalAlpha = 1
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// ── Main: runShowcase ───────────────────────────────────────────────────────

export function runShowcase(
  canvas: HTMLCanvasElement,
  callbacks: ShowcaseCallbacks = {},
): () => void {
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) return () => {}
  const ctx: CanvasRenderingContext2D = maybeCtx

  let animId = 0
  let cancelled = false

  // Pre-create scene state
  const scene1Players = createFakePlayers(8)
  const scene2Players = createBattlePlayers()
  let scene2Projectiles: Projectile[] = []

  const totalDuration = SCENE_DURATIONS.reduce((a, b) => a + b, 0) + FADE_DURATION * (SCENE_DURATIONS.length - 1)

  let startTime = 0
  let lastTime = 0
  let currentScene = -1

  function frame(timestamp: number) {
    if (cancelled) return
    if (startTime === 0) { startTime = timestamp; lastTime = timestamp }

    const elapsed = timestamp - startTime
    const dt = Math.min(timestamp - lastTime, 50) // cap dt at 50ms
    lastTime = timestamp

    const cw = canvas.width
    const ch = canvas.height

    // Determine which scene we're in
    let sceneElapsed = elapsed
    let scene = 0
    for (let i = 0; i < SCENE_DURATIONS.length; i++) {
      const sceneTotalTime = SCENE_DURATIONS[i] + (i < SCENE_DURATIONS.length - 1 ? FADE_DURATION : 0)
      if (sceneElapsed < sceneTotalTime) {
        scene = i
        break
      }
      sceneElapsed -= sceneTotalTime
      if (i === SCENE_DURATIONS.length - 1) {
        // Past the end
        scene = SCENE_DURATIONS.length - 1
        sceneElapsed = SCENE_DURATIONS[i]
      }
    }

    // Notify scene change
    if (scene !== currentScene) {
      currentScene = scene
      callbacks.onSceneChange?.(scene)
    }

    // Check if showcase is complete
    if (elapsed >= totalDuration) {
      callbacks.onComplete?.()
      return
    }

    // Clear
    ctx.clearRect(0, 0, cw, ch)

    // Render the current scene content
    const sceneTime = Math.min(sceneElapsed, SCENE_DURATIONS[scene])
    switch (scene) {
      case 0:
        renderScene1(ctx, cw, ch, sceneTime, timestamp, scene1Players, dt)
        break
      case 1:
        scene2Projectiles = renderScene2(ctx, cw, ch, sceneTime, dt, scene2Players, scene2Projectiles)
        break
      case 2:
        renderScene3(ctx, cw, ch, sceneTime)
        break
    }

    // Fade overlay: fade-out at end of scene, fade-in at start of next
    const fadeOutStart = SCENE_DURATIONS[scene] - FADE_DURATION
    if (scene < SCENE_DURATIONS.length - 1 && sceneElapsed > fadeOutStart) {
      const fadeT = Math.min(1, (sceneElapsed - fadeOutStart) / FADE_DURATION)
      // If we're past the scene duration, we're in the fade-in of next scene
      const fadeAlpha = sceneElapsed <= SCENE_DURATIONS[scene]
        ? fadeT  // fade out
        : 1 - (sceneElapsed - SCENE_DURATIONS[scene]) / FADE_DURATION // fade in
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, fadeAlpha))})`
      ctx.fillRect(0, 0, cw, ch)
    }

    animId = requestAnimationFrame(frame)
  }

  animId = requestAnimationFrame(frame)

  return () => {
    cancelled = true
    cancelAnimationFrame(animId)
  }
}

// ── Ambient: runAmbientLoop ─────────────────────────────────────────────────

export function runAmbientLoop(
  canvas: HTMLCanvasElement,
): () => void {
  const maybeCtx = canvas.getContext('2d')
  if (!maybeCtx) return () => {}
  const ctx: CanvasRenderingContext2D = maybeCtx

  let animId = 0
  let cancelled = false
  const players = createFakePlayers(6)
  let lastTime = 0

  // Slow auto-scroll
  let camX = 0
  const scrollSpeed = 0.015 // px per ms

  function frame(timestamp: number) {
    if (cancelled) return
    if (lastTime === 0) lastTime = timestamp
    const dt = Math.min(timestamp - lastTime, 50)
    lastTime = timestamp

    const cw = canvas.width
    const ch = canvas.height

    // Scroll camera, loop back
    camX += scrollSpeed * dt
    if (camX > MAP_W - cw) camX = 0
    const camY = (MAP_H - ch) / 2

    updateFakePlayers(players, dt)

    drawTerrain(ctx, cw, ch, camX, camY, TIER_DATA)
    drawPaths(ctx, camX, camY, TIER_DATA)
    drawRiver(ctx, cw, ch, camX, camY, TIER_DATA, timestamp)
    drawBridge(ctx, camX, camY, TIER_DATA)
    drawBuildings(ctx, camX, camY, TIER_DATA)
    drawTrees(ctx, camX, camY, cw, ch, TIER_DATA)
    drawBushes(ctx, camX, camY, cw, ch, TIER_DATA)
    drawLandmark(ctx, camX, camY, cw, ch, TIER_DATA.landmark, TIER_DATA, timestamp)
    drawBossLair(ctx, camX, camY, cw, ch, TIER_DATA.bossLair, { icon: '\u{1F480}', name: 'Boss' }, timestamp)
    drawFakePlayers(ctx, players, camX, camY, cw, ch)

    // Dark overlay for ambient feel
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, cw, ch)

    animId = requestAnimationFrame(frame)
  }

  animId = requestAnimationFrame(frame)

  return () => {
    cancelled = true
    cancelAnimationFrame(animId)
  }
}
