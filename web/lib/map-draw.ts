// web/lib/map-draw.ts
// Canvas drawing functions for the top-down world map

import { TierMapData, BuildingDef } from './map-data'

const MAP_W = 2400
const RIVER_HALF_WIDTH = 50

// ── Terrain ──────────────────────────────────────────────────────────────────

export function drawTerrain(
  ctx: CanvasRenderingContext2D, cw: number, ch: number,
  camX: number, camY: number, data: TierMapData
) {
  ctx.fillStyle = data.ground
  ctx.fillRect(0, 0, cw, ch)

  ctx.fillStyle = data.groundAlt
  for (let i = 0; i < 200; i++) {
    const tx = ((i * 173 + 37) % MAP_W) - camX
    const ty = ((i * 97 + 13) % 1600) - camY
    if (tx < -5 || tx > cw + 5 || ty < -5 || ty > ch + 5) continue
    ctx.globalAlpha = 0.3
    ctx.beginPath()
    ctx.arc(tx, ty, 2 + (i % 3), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ── Dirt Paths ───────────────────────────────────────────────────────────────

export function drawPaths(
  ctx: CanvasRenderingContext2D, camX: number, camY: number, data: TierMapData
) {
  ctx.save()
  ctx.strokeStyle = data.pathColor
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.lineWidth = 60
  ctx.globalAlpha = 0.6
  ctx.beginPath()
  const mp = data.mainPath
  ctx.moveTo(mp[0].x - camX, mp[0].y - camY)
  for (let i = 1; i < mp.length; i++) {
    ctx.lineTo(mp[i].x - camX, mp[i].y - camY)
  }
  ctx.stroke()

  ctx.lineWidth = 40
  ctx.globalAlpha = 0.45
  for (const branch of data.branchPaths) {
    ctx.beginPath()
    ctx.moveTo(branch[0].x - camX, branch[0].y - camY)
    for (let i = 1; i < branch.length; i++) {
      ctx.lineTo(branch[i].x - camX, branch[i].y - camY)
    }
    ctx.stroke()
  }

  ctx.restore()
}

// ── River ────────────────────────────────────────────────────────────────────

export function drawRiver(
  ctx: CanvasRenderingContext2D, cw: number, ch: number,
  camX: number, camY: number, data: TierMapData, timestamp: number
) {
  ctx.save()

  const topY = (x: number) => data.riverY + Math.sin(x * 0.003) * data.riverAmplitude - RIVER_HALF_WIDTH
  const botY = (x: number) => data.riverY + Math.sin(x * 0.003) * data.riverAmplitude + RIVER_HALF_WIDTH

  ctx.fillStyle = data.riverColor
  ctx.beginPath()
  ctx.moveTo(0 - camX, topY(0) - camY)
  for (let x = 0; x <= MAP_W; x += 8) {
    ctx.lineTo(x - camX, topY(x) - camY)
  }
  for (let x = MAP_W; x >= 0; x -= 8) {
    ctx.lineTo(x - camX, botY(x) - camY)
  }
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = data.riverHighlight
  ctx.lineWidth = 1.5
  for (let line = 0; line < 3; line++) {
    ctx.globalAlpha = 0.2 + line * 0.08
    ctx.beginPath()
    const offset = line * 18 - 20
    const timeShift = timestamp * 0.0004 + line * 1.5
    for (let x = 0; x <= MAP_W; x += 6) {
      const baseY = data.riverY + Math.sin(x * 0.003) * data.riverAmplitude + offset
      const shimmer = Math.sin(x * 0.008 + timeShift) * 4
      const py = baseY + shimmer - camY
      if (x === 0) ctx.moveTo(x - camX, py)
      else ctx.lineTo(x - camX, py)
    }
    ctx.stroke()
  }

  ctx.globalAlpha = 0.3
  for (let x = 0; x < MAP_W; x += 12) {
    const ty = topY(x) - camY
    const by = botY(x) - camY
    const sx = x - camX
    if (sx < -20 || sx > cw + 20) continue

    const tg = ctx.createLinearGradient(sx, ty - 10, sx, ty + 5)
    tg.addColorStop(0, 'transparent')
    tg.addColorStop(1, data.riverColor)
    ctx.fillStyle = tg
    ctx.fillRect(sx - 6, ty - 10, 12, 15)

    const bg = ctx.createLinearGradient(sx, by - 5, sx, by + 10)
    bg.addColorStop(0, data.riverColor)
    bg.addColorStop(1, 'transparent')
    ctx.fillStyle = bg
    ctx.fillRect(sx - 6, by - 5, 12, 15)
  }

  ctx.restore()
}

// ── Bridge ───────────────────────────────────────────────────────────────────

export function drawBridge(
  ctx: CanvasRenderingContext2D, camX: number, camY: number, data: TierMapData
) {
  const bx = data.bridgeX - camX
  const riverCenterY = data.riverY + Math.sin(data.bridgeX * 0.003) * data.riverAmplitude
  const by = riverCenterY - RIVER_HALF_WIDTH - 10 - camY
  const bw = 80
  const bh = RIVER_HALF_WIDTH * 2 + 20

  ctx.save()

  ctx.globalAlpha = 0.3
  ctx.fillStyle = '#000'
  ctx.fillRect(bx - bw / 2 + 4, by + 4, bw, bh)

  ctx.globalAlpha = 1
  ctx.fillStyle = '#6a5030'
  ctx.fillRect(bx - bw / 2, by, bw, bh)

  ctx.strokeStyle = '#4a3520'
  ctx.lineWidth = 1
  for (let py = by + 8; py < by + bh; py += 12) {
    ctx.beginPath()
    ctx.moveTo(bx - bw / 2 + 2, py)
    ctx.lineTo(bx + bw / 2 - 2, py)
    ctx.stroke()
  }

  ctx.fillStyle = '#5a4020'
  ctx.fillRect(bx - bw / 2 - 4, by, 6, bh)
  ctx.fillRect(bx + bw / 2 - 2, by, 6, bh)

  ctx.fillStyle = '#4a3018'
  for (let py = by; py < by + bh; py += 24) {
    ctx.fillRect(bx - bw / 2 - 6, py, 10, 6)
    ctx.fillRect(bx + bw / 2 - 4, py, 10, 6)
  }

  ctx.restore()
}

// ── Buildings ────────────────────────────────────────────────────────────────

export function drawBuildings(
  ctx: CanvasRenderingContext2D, camX: number, camY: number, data: TierMapData
) {
  for (const b of data.buildings) {
    const sx = b.x - camX
    const sy = b.y - camY

    const isStore = b.type === 'store'
    const isTavern = b.type === 'tavern'
    const wallColor = isStore ? data.storeWallColor : data.wallColor
    const roofColor = isStore ? data.storeRoofColor : data.roofColor

    ctx.save()

    ctx.globalAlpha = 0.25
    ctx.fillStyle = '#000'
    ctx.fillRect(sx + 4, sy + 4, b.w, b.h)

    ctx.globalAlpha = 1

    ctx.fillStyle = wallColor
    ctx.fillRect(sx, sy, b.w, b.h)

    ctx.strokeStyle = data.wallAlt
    ctx.lineWidth = 1.5
    ctx.strokeRect(sx, sy, b.w, b.h)

    const roofH = b.h * 0.3
    ctx.fillStyle = roofColor
    ctx.fillRect(sx - 4, sy - 4, b.w + 8, roofH + 4)

    ctx.strokeStyle = roofColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(sx - 4, sy + roofH)
    ctx.lineTo(sx + b.w + 4, sy + roofH)
    ctx.stroke()

    const doorW = Math.min(16, b.w * 0.18)
    const doorH = Math.min(22, b.h * 0.3)
    ctx.fillStyle = '#2a1a0a'
    ctx.fillRect(sx + b.w / 2 - doorW / 2, sy + b.h - doorH, doorW, doorH)

    ctx.fillStyle = '#ffdd8844'
    const winSize = 10
    if (b.w > 60) {
      ctx.fillRect(sx + b.w * 0.2, sy + roofH + 10, winSize, winSize)
      ctx.fillRect(sx + b.w * 0.7, sy + roofH + 10, winSize, winSize)
    }
    if (isTavern && b.w > 80) {
      ctx.fillRect(sx + b.w * 0.45, sy + roofH + 10, winSize, winSize)
    }

    if (isStore) {
      ctx.fillStyle = '#2a1a0a'
      ctx.fillRect(sx + b.w / 2 - 18, sy - 14, 36, 12)
      ctx.font = '600 8px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffcc44'
      ctx.fillText('STORE', sx + b.w / 2, sy - 8)
      ctx.fillStyle = '#ffcc00'
      ctx.beginPath()
      ctx.arc(sx + b.w / 2 + 22, sy - 8, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#aa8800'
      ctx.font = '600 6px system-ui'
      ctx.fillText('$', sx + b.w / 2 + 22, sy - 7)
    }

    if (isTavern) {
      ctx.fillStyle = '#2a1a0a'
      ctx.fillRect(sx + b.w / 2 - 16, sy - 14, 32, 12)
      ctx.font = '600 7px system-ui'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ddaa66'
      ctx.fillText('TAVERN', sx + b.w / 2, sy - 8)
    }

    ctx.restore()
  }
}

// ── Trees ────────────────────────────────────────────────────────────────────

export function drawTrees(
  ctx: CanvasRenderingContext2D, camX: number, camY: number,
  cw: number, ch: number, data: TierMapData
) {
  for (const t of data.trees) {
    const sx = t.x - camX
    const sy = t.y - camY
    if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue

    ctx.save()

    ctx.globalAlpha = 0.2
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.ellipse(sx + 4, sy + 4, t.radius, t.radius * 0.8, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 0.8
    ctx.fillStyle = data.treeColor
    ctx.beginPath()
    ctx.arc(sx, sy, t.radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 0.5
    ctx.fillStyle = data.treeHighlight
    ctx.beginPath()
    ctx.arc(sx - t.radius * 0.2, sy - t.radius * 0.2, t.radius * 0.7, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#3a2a1a'
    ctx.beginPath()
    ctx.arc(sx, sy, t.radius * 0.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }
}

// ── Bushes ───────────────────────────────────────────────────────────────────

export function drawBushes(
  ctx: CanvasRenderingContext2D, camX: number, camY: number,
  cw: number, ch: number, data: TierMapData
) {
  for (const b of data.bushes) {
    const sx = b.x - camX
    const sy = b.y - camY
    if (sx < -15 || sx > cw + 15 || sy < -15 || sy > ch + 15) continue

    ctx.save()
    ctx.globalAlpha = 0.6
    ctx.fillStyle = data.bushColor
    ctx.beginPath()
    ctx.arc(sx, sy, b.radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 0.35
    ctx.fillStyle = data.treeHighlight
    ctx.beginPath()
    ctx.arc(sx - 2, sy - 2, b.radius * 0.6, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }
}

// ── Portals (top-down) ───────────────────────────────────────────────────────

export function drawPortal(
  ctx: CanvasRenderingContext2D, camX: number, camY: number,
  cw: number, portalPos: { x: number; y: number },
  accentColor: string, label: string, timestamp: number
) {
  const px = portalPos.x - camX
  const py = portalPos.y - camY
  if (px < -60 || px > cw + 60) return

  const pulse = 0.7 + 0.3 * Math.sin(timestamp * 0.002)

  ctx.save()

  const pg = ctx.createRadialGradient(px, py, 0, px, py, 50)
  pg.addColorStop(0, accentColor + '44')
  pg.addColorStop(1, 'transparent')
  ctx.fillStyle = pg
  ctx.fillRect(px - 50, py - 50, 100, 100)

  ctx.strokeStyle = accentColor
  ctx.lineWidth = 3
  ctx.shadowColor = accentColor
  ctx.shadowBlur = 14 * pulse
  ctx.beginPath()
  ctx.ellipse(px, py, 28, 36, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.globalAlpha = 0.25 * pulse
  ctx.fillStyle = accentColor
  ctx.beginPath()
  ctx.ellipse(px, py, 20, 28, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = 0.85
  ctx.shadowBlur = 0
  ctx.font = '600 9px "Cinzel", serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = accentColor
  ctx.fillText(label, px, py + 50)

  ctx.restore()
}

// ── Boss Lair (top-down) ─────────────────────────────────────────────────────

export function drawBossLair(
  ctx: CanvasRenderingContext2D, camX: number, camY: number,
  cw: number, ch: number, lairPos: { x: number; y: number },
  boss: { icon: string; name: string }, timestamp: number
) {
  const lx = lairPos.x - camX
  const ly = lairPos.y - camY
  if (lx < -80 || lx > cw + 80 || ly < -80 || ly > ch + 80) return

  const pulse = 0.6 + 0.4 * Math.sin(timestamp * 0.003)

  ctx.save()

  const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, 60)
  lg.addColorStop(0, `rgba(163,45,45,${0.3 * pulse})`)
  lg.addColorStop(1, 'transparent')
  ctx.fillStyle = lg
  ctx.fillRect(lx - 60, ly - 60, 120, 120)

  ctx.fillStyle = '#0a0505'
  ctx.strokeStyle = `rgba(200,60,60,${0.5 + 0.3 * pulse})`
  ctx.lineWidth = 2.5
  ctx.shadowColor = '#cc2222'
  ctx.shadowBlur = 14 * pulse
  ctx.beginPath()
  ctx.ellipse(lx, ly, 35, 28, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.globalAlpha = 0.65 + 0.35 * pulse
  ctx.fillStyle = '#ff2222'
  ctx.shadowColor = '#ff0000'
  ctx.shadowBlur = 6
  ctx.beginPath()
  ctx.arc(lx - 10, ly - 4, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(lx + 10, ly - 4, 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = 0.55 + 0.3 * pulse
  ctx.shadowBlur = 0
  ctx.font = '500 10px "Cinzel", serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#f09595'
  ctx.fillText(`${boss.icon} ${boss.name}`, lx, ly + 45)

  ctx.restore()
}

// ── Landmarks ────────────────────────────────────────────────────────────────

export function drawLandmark(
  ctx: CanvasRenderingContext2D, camX: number, camY: number,
  cw: number, ch: number,
  landmark: { x: number; y: number; type: string },
  data: TierMapData, timestamp: number
) {
  const lx = landmark.x - camX
  const ly = landmark.y - camY
  if (lx < -60 || lx > cw + 60 || ly < -60 || ly > ch + 60) return

  ctx.save()

  switch (landmark.type) {
    case 'well': drawWell(ctx, lx, ly, data); break
    case 'watchtower': drawWatchtower(ctx, lx, ly, data); break
    case 'shrine': drawShrine(ctx, lx, ly, data, timestamp); break
    case 'windmill': drawWindmill(ctx, lx, ly, data, timestamp); break
    case 'clocktower': drawClocktower(ctx, lx, ly, data, timestamp); break
    case 'observatory': drawObservatory(ctx, lx, ly, data, timestamp); break
    case 'library': drawLibrary(ctx, lx, ly, data); break
    case 'obelisk': drawObelisk(ctx, lx, ly, data, timestamp); break
    case 'fountain': drawFountain(ctx, lx, ly, data, timestamp); break
    case 'forge': drawForge(ctx, lx, ly, data, timestamp); break
    case 'colosseum': drawColosseum(ctx, lx, ly, data); break
    case 'dragon': drawDragonStatue(ctx, lx, ly, data, timestamp); break
    case 'brazier': drawBrazier(ctx, lx, ly, data, timestamp); break
    case 'crystal': drawFloatingCrystal(ctx, lx, ly, data, timestamp); break
    case 'portal_arch': drawPortalArch(ctx, lx, ly, data, timestamp); break
  }

  ctx.restore()
}

function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData) {
  ctx.fillStyle = '#666'
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#555'
  ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#2255aa'
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#88bbff'
  ctx.beginPath(); ctx.arc(x - 4, y - 4, 6, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.strokeStyle = '#4a3020'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(x - 20, y); ctx.lineTo(x + 20, y); ctx.stroke()
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Old Well', x, y + 32)
}

function drawWatchtower(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData) {
  ctx.fillStyle = '#5a4020'
  ctx.fillRect(x - 16, y - 16, 32, 32)
  ctx.fillStyle = '#6a5030'
  ctx.fillRect(x - 20, y - 20, 40, 40)
  ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 1.5
  ctx.strokeRect(x - 20, y - 20, 40, 40)
  ctx.fillStyle = '#3a2010'
  ctx.fillRect(x - 3, y - 3, 6, 6)
  ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 2
  ctx.strokeRect(x - 18, y - 18, 36, 36)
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Watchtower', x, y + 32)
}

function drawShrine(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = '#556655'
  ctx.fillRect(x - 18, y - 12, 36, 24)
  ctx.globalAlpha = 0.4; ctx.fillStyle = '#2a6a2a'
  ctx.beginPath(); ctx.arc(x - 10, y - 8, 8, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + 8, y + 4, 6, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.fillStyle = '#778877'
  ctx.fillRect(x - 6, y - 8, 12, 16)
  const pulse = 0.3 + 0.3 * Math.sin(timestamp * 0.002)
  ctx.globalAlpha = pulse; ctx.fillStyle = data.accent
  ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Mossy Shrine', x, y + 24)
}

function drawWindmill(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = data.wallColor
  ctx.fillRect(x - 14, y - 20, 28, 40)
  ctx.strokeStyle = data.wallAlt; ctx.lineWidth = 1
  ctx.strokeRect(x - 14, y - 20, 28, 40)
  ctx.fillStyle = '#2a1a0a'
  ctx.fillRect(x - 5, y + 10, 10, 10)
  const angle = (timestamp * 0.001) % (Math.PI * 2)
  ctx.save()
  ctx.translate(x, y - 12)
  ctx.rotate(angle)
  ctx.fillStyle = data.roofColor
  for (let i = 0; i < 4; i++) {
    ctx.save()
    ctx.rotate(i * Math.PI / 2)
    ctx.fillRect(-3, 0, 6, 28)
    ctx.restore()
  }
  ctx.restore()
  ctx.fillStyle = '#4a3a2a'
  ctx.beginPath(); ctx.arc(x, y - 12, 4, 0, Math.PI * 2); ctx.fill()
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Windmill', x, y + 32)
}

function drawClocktower(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = data.wallColor
  ctx.fillRect(x - 16, y - 24, 32, 48)
  ctx.strokeStyle = data.wallAlt; ctx.lineWidth = 1.5
  ctx.strokeRect(x - 16, y - 24, 32, 48)
  ctx.fillStyle = '#ddd'
  ctx.beginPath(); ctx.arc(x, y - 10, 10, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#333'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(x, y - 10, 10, 0, Math.PI * 2); ctx.stroke()
  const sec = (timestamp * 0.001) % 60
  const minAngle = (sec / 60) * Math.PI * 2 - Math.PI / 2
  const hrAngle = (sec / 720) * Math.PI * 2 - Math.PI / 2
  ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x, y - 10)
  ctx.lineTo(x + Math.cos(minAngle) * 7, y - 10 + Math.sin(minAngle) * 7); ctx.stroke()
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x, y - 10)
  ctx.lineTo(x + Math.cos(hrAngle) * 5, y - 10 + Math.sin(hrAngle) * 5); ctx.stroke()
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Clocktower', x, y + 34)
}

function drawObservatory(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = data.wallColor
  ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = data.wallAlt; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = data.roofColor
  ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#111'
  ctx.fillRect(x - 2, y - 22, 4, 18)
  const pulse = 0.3 + 0.3 * Math.sin(timestamp * 0.003)
  ctx.globalAlpha = pulse; ctx.fillStyle = '#aabbff'
  ctx.beginPath(); ctx.arc(x, y - 16, 3, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Observatory', x, y + 36)
}

function drawLibrary(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData) {
  ctx.fillStyle = data.wallColor
  ctx.fillRect(x - 24, y - 16, 48, 32)
  ctx.fillStyle = data.ground
  ctx.fillRect(x + 14, y - 16, 10, 10)
  ctx.fillRect(x - 24, y + 12, 8, 8)
  ctx.fillStyle = '#888'
  ctx.fillRect(x - 22, y - 14, 6, 28)
  ctx.fillRect(x + 16, y - 14, 6, 28)
  ctx.fillRect(x - 4, y - 14, 6, 28)
  ctx.fillStyle = '#8844aa'; ctx.fillRect(x - 12, y - 4, 4, 6)
  ctx.fillStyle = '#aa4422'; ctx.fillRect(x - 6, y - 4, 4, 6)
  ctx.fillStyle = '#2266aa'; ctx.fillRect(x + 2, y - 4, 4, 6)
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Ancient Library', x, y + 26)
}

function drawObelisk(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = '#444'
  ctx.fillRect(x - 18, y + 10, 36, 8)
  ctx.fillStyle = '#333'
  ctx.beginPath()
  ctx.moveTo(x - 10, y + 10)
  ctx.lineTo(x - 6, y - 25)
  ctx.lineTo(x + 6, y - 25)
  ctx.lineTo(x + 10, y + 10)
  ctx.closePath(); ctx.fill()
  const pulse = 0.4 + 0.6 * Math.sin(timestamp * 0.002)
  ctx.globalAlpha = pulse; ctx.fillStyle = data.accent
  ctx.fillRect(x - 4, y - 18, 2, 2)
  ctx.fillRect(x + 2, y - 12, 2, 2)
  ctx.fillRect(x - 3, y - 6, 2, 2)
  ctx.fillRect(x + 1, y, 2, 2)
  ctx.beginPath(); ctx.arc(x, y - 27, 4, 0, Math.PI * 2)
  ctx.fillStyle = data.accent; ctx.fill()
  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Glowing Obelisk', x, y + 28)
}

function drawFountain(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = '#777'
  ctx.beginPath(); ctx.arc(x, y, 24, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#3366aa'
  ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#888'
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill()
  const pulse = Math.sin(timestamp * 0.004)
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#88ccff'
  ctx.beginPath(); ctx.arc(x, y - 2 + pulse * 3, 3, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 0.3
  ctx.beginPath(); ctx.arc(x - 6 + pulse * 2, y + 4, 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + 6 - pulse * 2, y + 4, 2, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Grand Fountain', x, y + 34)
}

function drawForge(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = '#4a3020'
  ctx.fillRect(x - 20, y - 14, 40, 28)
  ctx.fillStyle = '#3a2818'
  ctx.fillRect(x + 10, y - 22, 10, 12)
  ctx.fillStyle = '#555'
  ctx.fillRect(x - 24, y + 2, 12, 8)
  ctx.fillRect(x - 26, y + 6, 16, 4)
  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.005)
  ctx.globalAlpha = pulse; ctx.fillStyle = '#ff6622'
  ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = pulse * 0.5; ctx.fillStyle = '#ffaa44'
  ctx.beginPath(); ctx.arc(x, y - 3, 4, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.globalAlpha = 0.2 + pulse * 0.15; ctx.fillStyle = '#888'
  const smokeY = y - 26 - Math.sin(timestamp * 0.002) * 5
  ctx.beginPath(); ctx.arc(x + 15, smokeY, 5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + 13, smokeY - 8, 4, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Forge & Anvil', x, y + 24)
}

function drawColosseum(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData) {
  ctx.fillStyle = data.wallColor
  ctx.beginPath(); ctx.ellipse(x, y, 32, 26, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = data.wallAlt; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(x, y, 32, 26, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = '#6a5a3a'
  ctx.beginPath(); ctx.ellipse(x, y, 22, 17, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = data.roofColor; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.ellipse(x, y, 22, 17, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = data.ground
  ctx.fillRect(x - 3, y - 28, 6, 6)
  ctx.fillRect(x - 3, y + 22, 6, 6)
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Colosseum', x, y + 36)
}

function drawDragonStatue(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = '#555'
  ctx.fillRect(x - 14, y + 6, 28, 10)
  ctx.fillStyle = '#4a4a4a'
  ctx.beginPath()
  ctx.moveTo(x - 8, y + 6)
  ctx.lineTo(x - 12, y - 10)
  ctx.lineTo(x, y - 20)
  ctx.lineTo(x + 12, y - 10)
  ctx.lineTo(x + 8, y + 6)
  ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#3a3a3a'
  ctx.beginPath(); ctx.moveTo(x - 8, y - 8); ctx.lineTo(x - 24, y - 2); ctx.lineTo(x - 10, y + 2); ctx.closePath(); ctx.fill()
  ctx.beginPath(); ctx.moveTo(x + 8, y - 8); ctx.lineTo(x + 24, y - 2); ctx.lineTo(x + 10, y + 2); ctx.closePath(); ctx.fill()
  const pulse = 0.4 + 0.6 * Math.sin(timestamp * 0.003)
  ctx.globalAlpha = pulse; ctx.fillStyle = data.accent
  ctx.beginPath(); ctx.arc(x - 4, y - 14, 2, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(x + 4, y - 14, 2, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Dragon Statue', x, y + 26)
}

function drawBrazier(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  ctx.fillStyle = '#3a2020'
  ctx.fillRect(x - 14, y + 4, 28, 10)
  ctx.fillStyle = '#4a2828'
  ctx.beginPath()
  ctx.moveTo(x - 12, y + 4)
  ctx.lineTo(x - 16, y - 6)
  ctx.lineTo(x + 16, y - 6)
  ctx.lineTo(x + 12, y + 4)
  ctx.closePath(); ctx.fill()
  const pulse = 0.6 + 0.4 * Math.sin(timestamp * 0.006)
  const flicker = Math.sin(timestamp * 0.01) * 3
  ctx.globalAlpha = 0.8
  ctx.fillStyle = '#ff4422'
  ctx.beginPath(); ctx.arc(x + flicker * 0.3, y - 10, 10, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffaa22'
  ctx.beginPath(); ctx.arc(x - flicker * 0.2, y - 14, 6, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffdd44'
  ctx.beginPath(); ctx.arc(x, y - 16 - pulse * 3, 3, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
  ctx.globalAlpha = 0.15 * pulse
  const fg = ctx.createRadialGradient(x, y, 5, x, y, 40)
  fg.addColorStop(0, '#ff6622'); fg.addColorStop(1, 'transparent')
  ctx.fillStyle = fg; ctx.fillRect(x - 40, y - 40, 80, 80)
  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Eternal Flame', x, y + 24)
}

function drawFloatingCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  const float = Math.sin(timestamp * 0.002) * 5
  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.003)

  ctx.globalAlpha = 0.2 - float * 0.01
  ctx.fillStyle = '#000'
  ctx.beginPath(); ctx.ellipse(x, y + 16, 14, 6, 0, 0, Math.PI * 2); ctx.fill()

  ctx.globalAlpha = 0.2 * pulse
  const cg = ctx.createRadialGradient(x, y - 8 + float, 5, x, y - 8 + float, 35)
  cg.addColorStop(0, data.accent); cg.addColorStop(1, 'transparent')
  ctx.fillStyle = cg; ctx.fillRect(x - 35, y - 43 + float, 70, 70)

  ctx.globalAlpha = 0.85
  ctx.fillStyle = data.accent
  ctx.beginPath()
  ctx.moveTo(x, y - 24 + float)
  ctx.lineTo(x + 10, y - 8 + float)
  ctx.lineTo(x, y + 4 + float)
  ctx.lineTo(x - 10, y - 8 + float)
  ctx.closePath(); ctx.fill()

  ctx.globalAlpha = 0.4
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(x - 2, y - 20 + float)
  ctx.lineTo(x + 4, y - 10 + float)
  ctx.lineTo(x - 2, y - 6 + float)
  ctx.closePath(); ctx.fill()

  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Floating Crystal', x, y + 28)
}

function drawPortalArch(ctx: CanvasRenderingContext2D, x: number, y: number, data: TierMapData, timestamp: number) {
  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.002)

  ctx.fillStyle = '#444'
  ctx.fillRect(x - 22, y - 20, 8, 40)
  ctx.fillRect(x + 14, y - 20, 8, 40)

  ctx.strokeStyle = '#555'; ctx.lineWidth = 6
  ctx.beginPath(); ctx.arc(x, y - 16, 18, Math.PI, 0); ctx.stroke()

  ctx.globalAlpha = 0.3 + 0.3 * pulse
  const ag = ctx.createRadialGradient(x, y, 0, x, y, 16)
  ag.addColorStop(0, data.accent); ag.addColorStop(1, 'transparent')
  ctx.fillStyle = ag
  ctx.beginPath(); ctx.ellipse(x, y - 2, 14, 18, 0, 0, Math.PI * 2); ctx.fill()

  ctx.globalAlpha = pulse * 0.7; ctx.fillStyle = data.accent
  ctx.fillRect(x - 20, y - 12, 4, 3)
  ctx.fillRect(x - 20, y - 2, 4, 3)
  ctx.fillRect(x + 16, y - 12, 4, 3)
  ctx.fillRect(x + 16, y - 2, 4, 3)

  ctx.globalAlpha = 1
  ctx.font = '500 8px "Cinzel", serif'; ctx.textAlign = 'center'
  ctx.fillStyle = data.accent; ctx.fillText('Ancient Portal', x, y + 30)
}

// ── Store tooltip ────────────────────────────────────────────────────────────

export function drawStoreTooltip(
  ctx: CanvasRenderingContext2D, camX: number, camY: number, storeBuilding: BuildingDef
) {
  const sx = storeBuilding.x + storeBuilding.w / 2 - camX
  const sy = storeBuilding.y - 28 - camY

  ctx.save()
  ctx.fillStyle = 'rgba(10,10,15,0.9)'
  ctx.beginPath()
  ctx.roundRect(sx - 50, sy - 8, 100, 18, 6)
  ctx.fill()
  ctx.font = '500 9px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#ffcc44'
  ctx.fillText('Press E to enter', sx, sy + 1)
  ctx.restore()
}
