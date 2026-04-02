// lib/projectiles.ts
// Shared projectile system — used by both PvP and PvE battle pages

export type ProjectileKind =
  | 'sword'       // generic melee arc
  | 'orb'         // academia — purple energy orb
  | 'lightning'   // tech — yellow bolt
  | 'heal_pulse'  // medicine — green pulse (can't be dodged)
  | 'paint'       // creative — paint splash
  | 'verdict'     // law — golden beam
  | 'tentacle'    // boss generic — red whip arc
  | 'beam_pulse'  // boss academia — purple beam
  | 'missile'     // boss tech — electric missile
  | 'dark_orb'    // boss medicine — dark necrotic orb
  | 'spiral'      // boss creative — spiral burst
  | 'gavel'       // boss law — golden slam

export interface Projectile {
  id: string
  kind: ProjectileKind
  // Current position
  x: number
  y: number
  // Origin (where it was fired from)
  originX: number
  originY: number
  // Target position at time of firing (projectile travels toward this)
  targetX: number
  targetY: number
  // Who gets damaged on hit
  targetId: string
  // Damage to apply on hit
  damage: number
  // Speed px/ms
  speed: number
  // Radius for hit detection
  hitRadius: number
  // True = cannot be dodged (heals, debuffs)
  noDodge: boolean
  // Animation state
  age: number       // ms since created
  maxAge: number    // ms before auto-destroy if no hit
  hit: boolean      // true once it landed
  // Visual extras
  color: string
  trailColor: string
  size: number      // base draw radius
}

const PROJECTILE_SPEED = 0.25 // px/ms → 250px/s

// ── Factory ──────────────────────────────────────────────────────────────────
let _idCounter = 0
function uid() { return `proj_${++_idCounter}_${Date.now()}` }

function base(
  kind: ProjectileKind,
  fromX: number, fromY: number,
  toX: number, toY: number,
  targetId: string,
  damage: number,
  overrides: Partial<Projectile> = {}
): Projectile {
  const dx = toX - fromX
  const dy = toY - fromY
  const dist = Math.sqrt(dx * dx + dy * dy)
  // maxAge: time for projectile to travel full distance + 20% buffer
  const maxAge = (dist / PROJECTILE_SPEED) * 1.2

  return {
    id: uid(),
    kind,
    x: fromX, y: fromY,
    originX: fromX, originY: fromY,
    targetX: toX, targetY: toY,
    targetId,
    damage,
    speed: PROJECTILE_SPEED,
    hitRadius: 14,
    noDodge: false,
    age: 0,
    maxAge,
    hit: false,
    color: '#ffffff',
    trailColor: 'rgba(255,255,255,0.3)',
    size: 6,
    ...overrides,
  }
}

export function createSword(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('sword', fx, fy, tx, ty, targetId, damage, {
    color: '#e8e0f0', trailColor: 'rgba(232,224,240,0.4)',
    size: 8, hitRadius: 16, speed: PROJECTILE_SPEED * 1.3,
  })
}

export function createOrb(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('orb', fx, fy, tx, ty, targetId, damage, {
    color: '#9b72cf', trailColor: 'rgba(155,114,207,0.4)',
    size: 9, hitRadius: 14,
  })
}

export function createLightning(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('lightning', fx, fy, tx, ty, targetId, damage, {
    color: '#EF9F27', trailColor: 'rgba(239,159,39,0.5)',
    size: 7, hitRadius: 14, speed: PROJECTILE_SPEED * 1.4,
  })
}

export function createHealPulse(fx: number, fy: number, tx: number, ty: number, targetId: string, heal: number): Projectile {
  return base('heal_pulse', fx, fy, tx, ty, targetId, heal, {
    color: '#1D9E75', trailColor: 'rgba(29,158,117,0.4)',
    size: 10, hitRadius: 20, noDodge: true,
  })
}

export function createPaint(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('paint', fx, fy, tx, ty, targetId, damage, {
    color: '#cf7272', trailColor: 'rgba(207,114,114,0.4)',
    size: 11, hitRadius: 16,
  })
}

export function createVerdict(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('verdict', fx, fy, tx, ty, targetId, damage, {
    color: '#BA7517', trailColor: 'rgba(186,117,23,0.5)',
    size: 7, hitRadius: 12, speed: PROJECTILE_SPEED * 1.2,
  })
}

// ── Boss projectiles ─────────────────────────────────────────────────────────

export function createTentacle(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('tentacle', fx, fy, tx, ty, targetId, damage, {
    color: '#cf3333', trailColor: 'rgba(207,51,51,0.5)',
    size: 12, hitRadius: 18, speed: PROJECTILE_SPEED * 0.9,
  })
}

export function createBeamPulse(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('beam_pulse', fx, fy, tx, ty, targetId, damage, {
    color: '#b44cf0', trailColor: 'rgba(180,76,240,0.5)',
    size: 10, hitRadius: 16,
  })
}

export function createMissile(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('missile', fx, fy, tx, ty, targetId, damage, {
    color: '#EF9F27', trailColor: 'rgba(239,159,39,0.6)',
    size: 8, hitRadius: 14, speed: PROJECTILE_SPEED * 1.3,
  })
}

export function createDarkOrb(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('dark_orb', fx, fy, tx, ty, targetId, damage, {
    color: '#6b2fa0', trailColor: 'rgba(107,47,160,0.5)',
    size: 11, hitRadius: 16, speed: PROJECTILE_SPEED * 0.8,
  })
}

export function createSpiral(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('spiral', fx, fy, tx, ty, targetId, damage, {
    color: '#e85d5d', trailColor: 'rgba(232,93,93,0.5)',
    size: 13, hitRadius: 18, speed: PROJECTILE_SPEED * 0.85,
  })
}

export function createGavel(fx: number, fy: number, tx: number, ty: number, targetId: string, damage: number): Projectile {
  return base('gavel', fx, fy, tx, ty, targetId, damage, {
    color: '#d4a017', trailColor: 'rgba(212,160,23,0.6)',
    size: 14, hitRadius: 20, speed: PROJECTILE_SPEED * 1.1,
  })
}

// Pick the right boss projectile factory based on realm
export function createBossProjectile(
  realm: string,
  fx: number, fy: number,
  tx: number, ty: number,
  targetId: string,
  damage: number
): Projectile {
  switch (realm) {
    case 'academia': return createBeamPulse(fx, fy, tx, ty, targetId, damage)
    case 'tech':     return createMissile(fx, fy, tx, ty, targetId, damage)
    case 'medicine': return createDarkOrb(fx, fy, tx, ty, targetId, damage)
    case 'creative': return createSpiral(fx, fy, tx, ty, targetId, damage)
    case 'law':      return createGavel(fx, fy, tx, ty, targetId, damage)
    default:         return createTentacle(fx, fy, tx, ty, targetId, damage)
  }
}

// Pick player projectile based on realm skill
export function createRealmProjectile(
  realm: string,
  fx: number, fy: number,
  tx: number, ty: number,
  targetId: string,
  damage: number
): Projectile {
  switch (realm) {
    case 'academia': return createOrb(fx, fy, tx, ty, targetId, damage)
    case 'tech':     return createLightning(fx, fy, tx, ty, targetId, damage)
    case 'medicine': return createHealPulse(fx, fy, tx, ty, targetId, damage)
    case 'creative': return createPaint(fx, fy, tx, ty, targetId, damage)
    case 'law':      return createVerdict(fx, fy, tx, ty, targetId, damage)
    default:         return createOrb(fx, fy, tx, ty, targetId, damage)
  }
}

// ── Update ───────────────────────────────────────────────────────────────────
// Move projectile forward. Returns true if still alive.
export function updateProjectile(p: Projectile, dtMs: number): boolean {
  if (p.hit) return false
  p.age += dtMs

  const dx = p.targetX - p.originX
  const dy = p.targetY - p.originY
  const totalDist = Math.sqrt(dx * dx + dy * dy)
  if (totalDist === 0) return false

  const travelled = p.age * p.speed
  const t = Math.min(travelled / totalDist, 1)
  p.x = p.originX + dx * t
  p.y = p.originY + dy * t

  return p.age < p.maxAge
}

// Check if projectile hits a position (current target location)
export function checkHit(p: Projectile, targetCurrentX: number, targetCurrentY: number): boolean {
  if (p.hit || p.noDodge) return false
  const dx = p.x - targetCurrentX
  const dy = p.y - targetCurrentY
  return Math.sqrt(dx * dx + dy * dy) < p.hitRadius
}

// No-dodge projectile — hits when it reaches the original target position
export function checkNoDodgeHit(p: Projectile): boolean {
  if (p.hit) return false
  const dx = p.x - p.targetX
  const dy = p.y - p.targetY
  return Math.sqrt(dx * dx + dy * dy) < p.hitRadius
}

// ── Draw ─────────────────────────────────────────────────────────────────────
export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
  const alpha = Math.max(0, 1 - p.age / p.maxAge)
  ctx.globalAlpha = alpha

  switch (p.kind) {
    case 'sword': {
      // Sword arc — draw as a fast-moving slash line
      const dx = p.x - p.originX
      const dy = p.y - p.originY
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        const nx = dx / len; const ny = dy / len
        ctx.beginPath()
        ctx.moveTo(p.x - nx * 18, p.y - ny * 18)
        ctx.lineTo(p.x + nx * 6, p.y + ny * 6)
        ctx.strokeStyle = p.color
        ctx.lineWidth = 3
        ctx.lineCap = 'round'
        ctx.stroke()
        // Glow
        ctx.beginPath()
        ctx.moveTo(p.x - nx * 18, p.y - ny * 18)
        ctx.lineTo(p.x + nx * 6, p.y + ny * 6)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'
        ctx.lineWidth = 7
        ctx.stroke()
      }
      break
    }

    case 'tentacle': {
      // Tentacle — thick wavy line from boss
      const dx = p.x - p.originX
      const dy = p.y - p.originY
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        const nx = dx / len; const ny = dy / len
        const perp = { x: -ny, y: nx }
        const wave = Math.sin(p.age * 0.015) * 8
        ctx.beginPath()
        ctx.moveTo(p.originX, p.originY)
        ctx.quadraticCurveTo(
          p.originX + dx * 0.5 + perp.x * wave,
          p.originY + dy * 0.5 + perp.y * wave,
          p.x, p.y
        )
        ctx.strokeStyle = p.color
        ctx.lineWidth = 5
        ctx.lineCap = 'round'
        ctx.stroke()
        // Tip
        ctx.beginPath()
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }
      break
    }

    case 'lightning': case 'missile': {
      // Jagged lightning bolt
      const dx = p.targetX - p.originX
      const dy = p.targetY - p.originY
      const len = Math.sqrt(dx * dx + dy * dy)
      const segments = 5
      ctx.beginPath()
      ctx.moveTo(p.originX, p.originY)
      for (let i = 1; i < segments; i++) {
        const t = i / segments
        const jitter = (Math.random() - 0.5) * 12
        ctx.lineTo(
          p.originX + dx * t + (-dy / len) * jitter,
          p.originY + dy * t + (dx / len) * jitter
        )
      }
      ctx.lineTo(p.x, p.y)
      ctx.strokeStyle = p.color
      ctx.lineWidth = 2.5
      ctx.stroke()
      // Bright core
      ctx.beginPath()
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      break
    }

    case 'spiral': {
      // Spiral — rotating rings
      const spiralAngle = p.age * 0.012
      for (let i = 0; i < 3; i++) {
        const a = spiralAngle + (i * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.arc(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5, 4, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.fill()
      }
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2)
      ctx.fillStyle = p.trailColor
      ctx.fill()
      break
    }

    case 'verdict': case 'gavel': {
      // Beam — bright line with golden glow
      ctx.beginPath()
      ctx.moveTo(p.originX, p.originY)
      ctx.lineTo(p.x, p.y)
      ctx.strokeStyle = p.color
      ctx.lineWidth = 4
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p.originX, p.originY)
      ctx.lineTo(p.x, p.y)
      ctx.strokeStyle = 'rgba(255,220,80,0.3)'
      ctx.lineWidth = 10
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()
      break
    }

    case 'heal_pulse': {
      // Green cross pulse
      const s = p.size
      ctx.strokeStyle = p.color
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y)
      ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(p.x, p.y, s * 0.7, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(29,158,117,0.4)'
      ctx.lineWidth = 6
      ctx.stroke()
      break
    }

    default: {
      // Generic orb (academia, dark_orb, beam_pulse, paint, etc.)
      // Trail
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 1.6, 0, Math.PI * 2)
      ctx.fillStyle = p.trailColor
      ctx.fill()
      // Core
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()
      // Inner glow
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fill()
      break
    }
  }

  ctx.globalAlpha = 1
}

// ── Hit flash ─────────────────────────────────────────────────────────────────
// Draw a hit effect at a position when a projectile lands
export function drawHitFlash(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, age: number) {
  const alpha = Math.max(0, 1 - age / 300)
  const radius = 8 + age * 0.08
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.globalAlpha = 1
}
