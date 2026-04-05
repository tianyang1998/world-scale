// web/lib/map-data.ts
// Per-tier map layout configuration for the top-down world map

export interface CollisionRect {
  x: number
  y: number
  w: number
  h: number
}

export interface BuildingDef {
  x: number
  y: number
  w: number
  h: number
  type: 'house' | 'tavern' | 'store'
}

export interface TreeDef {
  x: number
  y: number
  radius: number
}

export interface TierMapData {
  // Terrain colors
  ground: string
  groundAlt: string
  pathColor: string
  accent: string

  // River
  riverY: number
  riverAmplitude: number
  riverColor: string
  riverHighlight: string
  bridgeX: number

  // Town buildings
  buildings: BuildingDef[]

  // Building style (per tier group)
  roofColor: string
  wallColor: string
  wallAlt: string
  storeRoofColor: string
  storeWallColor: string

  // Landmark
  landmark: { x: number; y: number; type: string }

  // Trees & bushes
  trees: TreeDef[]
  bushes: TreeDef[]
  treeColor: string
  treeHighlight: string
  bushColor: string

  // Boss lair
  bossLair: { x: number; y: number }

  // Portal positions
  leftPortal: { x: number; y: number }
  rightPortal: { x: number; y: number }

  // Path waypoints
  mainPath: { x: number; y: number }[]
  branchPaths: { x: number; y: number }[][]
}

const MAP_W = 2400
const MAP_H = 1600

function baseTierData(overrides: Partial<TierMapData> & Pick<TierMapData, 'ground' | 'groundAlt' | 'pathColor' | 'accent' | 'riverColor' | 'riverHighlight' | 'roofColor' | 'wallColor' | 'wallAlt' | 'storeRoofColor' | 'storeWallColor' | 'treeColor' | 'treeHighlight' | 'bushColor' | 'landmark'>): TierMapData {
  return {
    riverY: 1100,
    riverAmplitude: 40,
    bridgeX: 900,

    buildings: [
      { x: 380, y: 320, w: 100, h: 80, type: 'house' },
      { x: 520, y: 300, w: 90, h: 75, type: 'house' },
      { x: 440, y: 440, w: 85, h: 70, type: 'house' },
      { x: 310, y: 460, w: 80, h: 70, type: 'house' },
      { x: 580, y: 420, w: 120, h: 95, type: 'tavern' },
      { x: 700, y: 310, w: 110, h: 85, type: 'store' },
    ],

    trees: [
      { x: 220, y: 350, radius: 30 },
      { x: 250, y: 520, radius: 25 },
      { x: 850, y: 400, radius: 28 },
      { x: 1100, y: 300, radius: 32 },
      { x: 1400, y: 500, radius: 26 },
      { x: 1600, y: 350, radius: 30 },
      { x: 1800, y: 550, radius: 24 },
      { x: 200, y: 1300, radius: 28 },
      { x: 500, y: 1350, radius: 26 },
      { x: 800, y: 1400, radius: 30 },
      { x: 1200, y: 1300, radius: 25 },
      { x: 1500, y: 1350, radius: 28 },
      { x: 1900, y: 1280, radius: 32 },
      { x: 2100, y: 400, radius: 26 },
      { x: 1950, y: 300, radius: 24 },
    ],

    bushes: [
      { x: 300, y: 380, radius: 10 },
      { x: 480, y: 550, radius: 8 },
      { x: 750, y: 450, radius: 9 },
      { x: 1000, y: 350, radius: 10 },
      { x: 1300, y: 450, radius: 8 },
      { x: 350, y: 1250, radius: 10 },
      { x: 650, y: 1300, radius: 9 },
      { x: 1050, y: 1380, radius: 10 },
      { x: 1700, y: 1300, radius: 8 },
      { x: 2050, y: 500, radius: 9 },
      { x: 160, y: 700, radius: 10 },
      { x: 1850, y: 700, radius: 9 },
    ],

    bossLair: { x: 2050, y: 450 },
    leftPortal: { x: 50, y: MAP_H / 2 },
    rightPortal: { x: MAP_W - 50, y: MAP_H / 2 },

    mainPath: [
      { x: 50, y: MAP_H / 2 },
      { x: 300, y: MAP_H / 2 },
      { x: 550, y: 600 },
      { x: 900, y: 700 },
      { x: 900, y: 1100 },
      { x: 900, y: 700 },
      { x: 1300, y: 600 },
      { x: 1700, y: 500 },
      { x: 2050, y: 500 },
      { x: 2350, y: MAP_H / 2 },
    ],

    branchPaths: [
      [{ x: 400, y: 600 }, { x: 500, y: 500 }, { x: 550, y: 400 }],
      [{ x: 1500, y: 550 }, { x: 1500, y: 400 }],
    ],

    ...overrides,
  }
}

export const TIER_MAP_DATA: Record<string, TierMapData> = {
  Apprentice: baseTierData({
    ground: '#3a3828', groundAlt: '#33311f', pathColor: '#6a6040',
    accent: '#888780',
    riverColor: '#2a4466', riverHighlight: '#5588aa',
    roofColor: '#666055', wallColor: '#555045', wallAlt: '#4a4538',
    storeRoofColor: '#556650', storeWallColor: '#4a5a42',
    treeColor: '#4a5530', treeHighlight: '#5a6838', bushColor: '#3a4a28',
    landmark: { x: 1500, y: 380, type: 'well' },
  }),
  Initiate: baseTierData({
    ground: '#2e3a22', groundAlt: '#28331c', pathColor: '#6a5a3a',
    accent: '#7aaa50',
    riverColor: '#2a4466', riverHighlight: '#5599bb',
    roofColor: '#7a5533', wallColor: '#6a4828', wallAlt: '#5a3e20',
    storeRoofColor: '#4a6633', storeWallColor: '#3a5528',
    treeColor: '#2a6a1e', treeHighlight: '#3a8a2a', bushColor: '#2a5a1e',
    landmark: { x: 1500, y: 380, type: 'watchtower' },
  }),
  Acolyte: baseTierData({
    ground: '#1e3a20', groundAlt: '#1a3318', pathColor: '#5a5030',
    accent: '#50cc70',
    riverColor: '#1a4488', riverHighlight: '#44aacc',
    roofColor: '#6a5030', wallColor: '#5a4525', wallAlt: '#4a3a1e',
    storeRoofColor: '#336633', storeWallColor: '#2a5528',
    treeColor: '#1e6e1e', treeHighlight: '#2a8a2a', bushColor: '#1e5a1e',
    landmark: { x: 1500, y: 380, type: 'shrine' },
  }),
  Journeyman: baseTierData({
    ground: '#1e3828', groundAlt: '#1a3020', pathColor: '#5a4a30',
    accent: '#3a8ab0',
    riverColor: '#1a4488', riverHighlight: '#5599dd',
    roofColor: '#7a5533', wallColor: '#6a4828', wallAlt: '#5a3e20',
    storeRoofColor: '#336644', storeWallColor: '#2a5535',
    treeColor: '#1e6e2a', treeHighlight: '#2a8a35', bushColor: '#1e5a22',
    landmark: { x: 1500, y: 380, type: 'windmill' },
  }),
  Adept: baseTierData({
    ground: '#1e2e38', groundAlt: '#1a2830', pathColor: '#4a5560',
    accent: '#5070c0',
    riverColor: '#1a3a88', riverHighlight: '#4488dd',
    roofColor: '#5a5570', wallColor: '#4a4a60', wallAlt: '#3e3e55',
    storeRoofColor: '#3a5566', storeWallColor: '#2e4a55',
    treeColor: '#2a4a3a', treeHighlight: '#3a5a4a', bushColor: '#224038',
    landmark: { x: 1500, y: 380, type: 'clocktower' },
  }),
  Scholar: baseTierData({
    ground: '#1e2240', groundAlt: '#1a1e38', pathColor: '#5a5a70',
    accent: '#7060d0',
    riverColor: '#1a2a88', riverHighlight: '#5577ee',
    roofColor: '#4a5070', wallColor: '#3e4460', wallAlt: '#333855',
    storeRoofColor: '#3a5560', storeWallColor: '#2e4a55',
    treeColor: '#2a3a50', treeHighlight: '#3a4a60', bushColor: '#223348',
    landmark: { x: 1500, y: 380, type: 'observatory' },
  }),
  Sage: baseTierData({
    ground: '#2a1e40', groundAlt: '#241a38', pathColor: '#5a4a6a',
    accent: '#9060c0',
    riverColor: '#2a1a88', riverHighlight: '#7755ee',
    roofColor: '#5a4070', wallColor: '#4a3560', wallAlt: '#3e2e55',
    storeRoofColor: '#44556a', storeWallColor: '#384a5a',
    treeColor: '#3a2a50', treeHighlight: '#4a3a60', bushColor: '#302248',
    landmark: { x: 1500, y: 380, type: 'library' },
  }),
  Arcanist: baseTierData({
    ground: '#30183a', groundAlt: '#2a1433', pathColor: '#604a6a',
    accent: '#b050c0',
    riverColor: '#3a1a80', riverHighlight: '#8844dd',
    roofColor: '#5a3a60', wallColor: '#4a2e55', wallAlt: '#3e2548',
    storeRoofColor: '#4a4a60', storeWallColor: '#3e3e55',
    treeColor: '#3a2050', treeHighlight: '#4a3060', bushColor: '#301a45',
    landmark: { x: 1500, y: 380, type: 'obelisk' },
  }),
  Exemplar: baseTierData({
    ground: '#351a2a', groundAlt: '#2e1625', pathColor: '#604050',
    accent: '#c04080',
    riverColor: '#2a1a66', riverHighlight: '#8844aa',
    roofColor: '#6a3a50', wallColor: '#5a2e44', wallAlt: '#4a2538',
    storeRoofColor: '#4a5050', storeWallColor: '#3e4444',
    treeColor: '#4a2040', treeHighlight: '#5a3050', bushColor: '#3a1a35',
    landmark: { x: 1500, y: 380, type: 'fountain' },
  }),
  Vanguard: baseTierData({
    ground: '#3a2210', groundAlt: '#331e0c', pathColor: '#6a5030',
    accent: '#c06030',
    riverColor: '#2a3a55', riverHighlight: '#5577aa',
    roofColor: '#6a4020', wallColor: '#5a3518', wallAlt: '#4a2c12',
    storeRoofColor: '#556040', storeWallColor: '#4a5535',
    treeColor: '#4a4a1e', treeHighlight: '#5a5a2a', bushColor: '#3a3a18',
    landmark: { x: 1500, y: 380, type: 'forge' },
  }),
  Master: baseTierData({
    ground: '#3a2a10', groundAlt: '#33240c', pathColor: '#7a6a40',
    accent: '#d07020',
    riverColor: '#2a3a55', riverHighlight: '#5588aa',
    roofColor: '#8a5a22', wallColor: '#7a4e1a', wallAlt: '#6a4214',
    storeRoofColor: '#5a6a3a', storeWallColor: '#4a5a30',
    treeColor: '#5a5a20', treeHighlight: '#6a6a2a', bushColor: '#4a4a1a',
    landmark: { x: 1500, y: 380, type: 'colosseum' },
  }),
  Grandmaster: baseTierData({
    ground: '#3a2808', groundAlt: '#332206', pathColor: '#7a6030',
    accent: '#e08030',
    riverColor: '#2a3550', riverHighlight: '#5580aa',
    roofColor: '#8a5520', wallColor: '#7a4a18', wallAlt: '#6a3e12',
    storeRoofColor: '#5a6538', storeWallColor: '#4a5530',
    treeColor: '#5a5518', treeHighlight: '#6a6522', bushColor: '#4a4512',
    landmark: { x: 1500, y: 380, type: 'dragon' },
  }),
  Champion: baseTierData({
    ground: '#3a1010', groundAlt: '#330c0c', pathColor: '#5a3a3a',
    accent: '#e04020',
    riverColor: '#2a2a55', riverHighlight: '#6655aa',
    roofColor: '#4a2828', wallColor: '#3e2020', wallAlt: '#331818',
    storeRoofColor: '#4a4a3a', storeWallColor: '#3e3e30',
    treeColor: '#3a2020', treeHighlight: '#4a2a2a', bushColor: '#301818',
    landmark: { x: 1500, y: 380, type: 'brazier' },
  }),
  Paragon: baseTierData({
    ground: '#3a0e0e', groundAlt: '#330a0a', pathColor: '#5a3535',
    accent: '#f03030',
    riverColor: '#2a2255', riverHighlight: '#6644aa',
    roofColor: '#4a2525', wallColor: '#3e1e1e', wallAlt: '#331616',
    storeRoofColor: '#484838', storeWallColor: '#3c3c30',
    treeColor: '#3a1a1a', treeHighlight: '#4a2525', bushColor: '#301414',
    landmark: { x: 1500, y: 380, type: 'crystal' },
  }),
  Legend: baseTierData({
    ground: '#200020', groundAlt: '#1a001a', pathColor: '#5a2a6a',
    accent: '#ff40ff',
    riverColor: '#2a0055', riverHighlight: '#8833ff',
    roofColor: '#4a1a5a', wallColor: '#3e1450', wallAlt: '#331045',
    storeRoofColor: '#3a3a5a', storeWallColor: '#2e2e50',
    treeColor: '#3a1050', treeHighlight: '#4a2060', bushColor: '#300a45',
    landmark: { x: 1500, y: 380, type: 'portal_arch' },
  }),
}

export function buildCollisionRects(tierData: TierMapData): CollisionRect[] {
  const rects: CollisionRect[] = []
  const RIVER_HALF_WIDTH = 50
  const SEGMENTS = 24
  const segW = MAP_W / SEGMENTS

  for (const b of tierData.buildings) {
    rects.push({ x: b.x, y: b.y, w: b.w, h: b.h })
  }

  for (const t of tierData.trees) {
    rects.push({ x: t.x - 12, y: t.y - 12, w: 24, h: 24 })
  }

  for (let i = 0; i < SEGMENTS; i++) {
    const sx = i * segW
    const midX = sx + segW / 2
    const waveY = tierData.riverY + Math.sin(midX * 0.003) * tierData.riverAmplitude
    const rectY = waveY - RIVER_HALF_WIDTH
    if (Math.abs(midX - tierData.bridgeX) < 60) continue
    rects.push({ x: sx, y: rectY, w: segW, h: RIVER_HALF_WIDTH * 2 })
  }

  return rects
}

export function collidesWithAny(
  px: number, py: number, radius: number, rects: CollisionRect[]
): boolean {
  for (const r of rects) {
    const closestX = Math.max(r.x, Math.min(px, r.x + r.w))
    const closestY = Math.max(r.y, Math.min(py, r.y + r.h))
    const dx = px - closestX
    const dy = py - closestY
    if (dx * dx + dy * dy < radius * radius) return true
  }
  return false
}
