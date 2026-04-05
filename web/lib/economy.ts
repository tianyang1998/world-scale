// web/lib/economy.ts

// ── Broadcast tiers ─────────────────────────────────────────────────────────
export interface BroadcastTier {
  id: 'basic' | 'extended' | 'global'
  name: string
  cost: number
  desc: string
}

export const BROADCAST_TIERS: BroadcastTier[] = [
  { id: 'basic',    name: 'Basic',    cost: 0,   desc: 'Your current map tier only' },
  { id: 'extended', name: 'Extended', cost: 100, desc: 'Your tier ± 1 tier above and below' },
  { id: 'global',   name: 'Global',   cost: 300, desc: 'All players across all tiers' },
]

// ── Insurance tiers ─────────────────────────────────────────────────────────
export interface InsuranceTier {
  id: 'none' | 'bronze' | 'silver' | 'gold'
  name: string
  cost: number
  refundPercent: number
  desc: string
}

export const INSURANCE_TIERS: InsuranceTier[] = [
  { id: 'none',   name: 'None',   cost: 0,   refundPercent: 0,    desc: 'No protection' },
  { id: 'bronze', name: 'Bronze', cost: 30,  refundPercent: 0.25, desc: '25% of gold lost refunded' },
  { id: 'silver', name: 'Silver', cost: 60,  refundPercent: 0.50, desc: '50% of gold lost refunded' },
  { id: 'gold',   name: 'Gold',   cost: 100, refundPercent: 0.75, desc: '75% of gold lost refunded' },
]

// ── Cosmetics catalog ───────────────────────────────────────────────────────
export type CosmeticType = 'title' | 'border'

export interface CosmeticItem {
  id: string
  type: CosmeticType
  name: string
  cost: number
  value: string // the display string for titles, or border style key for borders
  realm?: string // if realm-specific, otherwise universal
}

export const COSMETICS: CosmeticItem[] = [
  // Titles
  { id: 'title_boss_slayer',    type: 'title', name: 'Boss Slayer',     cost: 150, value: 'Boss Slayer' },
  { id: 'title_the_unyielding', type: 'title', name: 'The Unyielding',  cost: 200, value: 'The Unyielding' },
  { id: 'title_realm_champion', type: 'title', name: 'Realm Champion',  cost: 350, value: 'Realm Champion' },
  { id: 'title_gold_hoarder',   type: 'title', name: 'Gold Hoarder',    cost: 500, value: 'Gold Hoarder' },
  // Borders — one per realm + one universal
  { id: 'border_academia',  type: 'border', name: "Scholar's Frame",   cost: 300, value: 'academia',  realm: 'academia' },
  { id: 'border_tech',      type: 'border', name: 'Circuit Frame',      cost: 300, value: 'tech',      realm: 'tech' },
  { id: 'border_medicine',  type: 'border', name: "Healer's Frame",    cost: 300, value: 'medicine',  realm: 'medicine' },
  { id: 'border_creative',  type: 'border', name: "Artist's Frame",    cost: 300, value: 'creative',  realm: 'creative' },
  { id: 'border_law',       type: 'border', name: 'Justice Frame',      cost: 300, value: 'law',       realm: 'law' },
  { id: 'border_gilded',    type: 'border', name: 'Gilded Frame',       cost: 800, value: 'gilded' },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getInsuranceTier(id: string): InsuranceTier {
  return INSURANCE_TIERS.find(t => t.id === id) ?? INSURANCE_TIERS[0]
}

export function getBroadcastTier(id: string): BroadcastTier {
  return BROADCAST_TIERS.find(t => t.id === id) ?? BROADCAST_TIERS[0]
}

export function getCosmetic(id: string): CosmeticItem | undefined {
  return COSMETICS.find(c => c.id === id)
}

/** Calculate insurance refund amount */
export function calcInsuranceRefund(goldLost: number, insuranceId: string): number {
  const tier = getInsuranceTier(insuranceId)
  return Math.floor(goldLost * tier.refundPercent)
}