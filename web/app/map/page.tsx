'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { getTierStyle, TIERS } from '@/lib/types'
import { isSameTier } from '@/lib/battle'
import { BOSSES } from '@/lib/boss'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MapPlayer {
  userId: string
  name: string
  totalPower: number
  tier: string         // home tier (from credentials)
  currentTier: string  // tier map they are currently visiting
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

// ── Map constants ─────────────────────────────────────────────────────────────

const MAP_W = 2400
const MAP_H = 1600
const PLAYER_SPEED = 4
const PLAYER_RADIUS = 18
const CHALLENGE_RANGE = 120  // px — must be this close to challenge
const BOSS_ZONE_WIDTH = 80
const EXIT_ZONE_WIDTH = 60   // left/right portal zones
const FADE_DURATION = 400    // ms for fade in/out

const TIER_NAMES = [
  'Apprentice','Initiate','Acolyte','Journeyman','Adept',
  'Scholar','Sage','Arcanist','Exemplar','Vanguard',
  'Master','Grandmaster','Champion','Paragon','Legend',
]

// ── Biome config ──────────────────────────────────────────────────────────────

const BIOME: Record<string, {
  sky: [string, string]
  ground: string
  hill: string
  accent: string
}> = {
  Apprentice:  { sky: ['#1a1a2e','#2d2a4a'], ground: '#2a2a1a', hill: '#3a3a22', accent: '#888780' },
  Initiate:    { sky: ['#1a2e1a','#2a4a2a'], ground: '#1a2e1a', hill: '#2a4a1a', accent: '#7aaa50' },
  Acolyte:     { sky: ['#1a2e20','#2a4a30'], ground: '#1a3020', hill: '#2a5030', accent: '#50cc70' },
  Journeyman:  { sky: ['#102030','#1a3a50'], ground: '#102840', hill: '#1a3850', accent: '#3a8ab0' },
  Adept:       { sky: ['#101830','#1a2850'], ground: '#101830', hill: '#1a2848', accent: '#5070c0' },
  Scholar:     { sky: ['#100e30','#1e1a50'], ground: '#100e30', hill: '#1e1a50', accent: '#7060d0' },
  Sage:        { sky: ['#1a0e30','#2e1a50'], ground: '#1a0e30', hill: '#2e1a50', accent: '#9060c0' },
  Arcanist:    { sky: ['#200e28','#381448'], ground: '#200e28', hill: '#381448', accent: '#b050c0' },
  Exemplar:    { sky: ['#280e1a','#481428'], ground: '#280e1a', hill: '#481428', accent: '#c04080' },
  Vanguard:    { sky: ['#2e1008','#501808'], ground: '#2e1008', hill: '#501808', accent: '#c06030' },
  Master:      { sky: ['#301008','#582010'], ground: '#301008', hill: '#582010', accent: '#d07020' },
  Grandmaster: { sky: ['#381408','#602808'], ground: '#381408', hill: '#602808', accent: '#e08030' },
  Champion:    { sky: ['#400808','#700808'], ground: '#400808', hill: '#700808', accent: '#e04020' },
  Paragon:     { sky: ['#480808','#800808'], ground: '#480808', hill: '#800808', accent: '#f03030' },
  Legend:      { sky: ['#200020','#500050'], ground: '#200020', hill: '#500050', accent: '#ff40ff' },
}

const REALM_COLORS: Record<string, string> = {
  academia: '#5588ee', tech: '#44ddaa', medicine: '#44cc66',
  creative: '#ee8844', law: '#aa66ee',
}

const REALM_ICONS: Record<string, string> = {
  academia: '📚', tech: '⚡', medicine: '⚕️', creative: '🎨', law: '⚖️',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTierIndex(tier: string) {
  return TIER_NAMES.indexOf(tier)
}

function distXY(ax: number, ay: number, bx: number, by: number) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapPage() {
  const router = useRouter()

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const channelRef     = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const keysRef        = useRef<Set<string>>(new Set())
  const myPlayerRef    = useRef<MapPlayer | null>(null)
  const playersRef     = useRef<Map<string, MapPlayer>>(new Map())
  const animFrameRef   = useRef<number>(0)
  const lastBroadcast  = useRef<number>(0)
  const supabaseRef    = useRef(createClient())
  const supabase       = supabaseRef.current

  // Fade state in refs so draw loop reads without stale closure
  const fadeRef        = useRef<number>(0)
  const fadeDirRef     = useRef<'in' | 'out' | null>(null)
  const fadeStartRef   = useRef<number>(0)
  const pendingTierRef = useRef<string | null>(null)

  const [userId,         setUserId]         = useState<string | null>(null)
  const [myTier,         setMyTier]         = useState<string>('')
  const [currentTier,    setCurrentTier]    = useState<string>('')
  const [myStats,        setMyStats]        = useState<{ hp: number; attack: number; defence: number } | null>(null)
  const [challenge,      setChallenge]      = useState<ChallengeRequest | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<MapPlayer | null>(null)
  const [bossPrompt,     setBossPrompt]     = useState<string | null>(null)
  const [enteringBoss,   setEnteringBoss]   = useState(false)
  const [pveInvite,      setPveInvite]      = useState<{ fromName: string; battleId: string; bossName: string; bossTier: string } | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [transitioning,  setTransitioning]  = useState(false)

  const currentTierRef = useRef<string>('')
  const myTierRef      = useRef<string>('')
  useEffect(() => { currentTierRef.current = currentTier }, [currentTier])
  useEffect(() => { myTierRef.current = myTier }, [myTier])

  // ── Channel management ────────────────────────────────────────────────────

  const joinTierChannel = useCallback((tier: string, player: MapPlayer) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const uid = player.userId
    const channel = supabase.channel(`map:${tier}`, {
      config: { presence: { key: uid } }
    })
    channelRef.current = channel

    channel.on('presence', { event: 'join' }, ({ key, newPresences }: { key: string, newPresences: MapPlayer[] }) => {
      if (key !== uid) playersRef.current.set(key, newPresences[0] as MapPlayer)
    })

    channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
      playersRef.current.delete(key)
    })

    channel.on('broadcast', { event: 'move' }, ({ payload }: { payload: { userId: string, x: number, y: number } }) => {
      const existing = playersRef.current.get(payload.userId)
      if (existing) playersRef.current.set(payload.userId, { ...existing, x: payload.x, y: payload.y })
    })

    channel.on('broadcast', { event: 'challenge' }, ({ payload }: { payload: { toId: string, fromId: string, fromName: string, battleId: string } }) => {
      if (payload.toId === uid) {
        setChallenge({ fromId: payload.fromId, fromName: payload.fromName, battleId: payload.battleId })
      }
    })

    channel.on('broadcast', { event: 'pve_invite' }, ({ payload }: { payload: { fromId: string, fromName: string, fromTier: string, battleId: string, bossName: string, bossTier: string } }) => {
      if (payload.fromId === uid) return
      if (payload.fromTier !== myPlayerRef.current?.tier) return
      setPveInvite({ fromName: payload.fromName, battleId: payload.battleId, bossName: payload.bossName, bossTier: payload.bossTier })
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        playersRef.current.clear()
        playersRef.current.set(uid, { ...player, currentTier: tier })
        await channel.track({ ...player, currentTier: tier })
      }
    })
  }, [supabase])

  // ── Tier transition ───────────────────────────────────────────────────────

  const transitionToTier = useCallback((newTier: string) => {
    if (fadeDirRef.current !== null) return // already fading
    pendingTierRef.current = newTier
    fadeDirRef.current = 'out'
    fadeStartRef.current = performance.now()
    setTransitioning(true)
  }, [])

  const completeTierTransition = useCallback((newTier: string) => {
    const me = myPlayerRef.current
    if (!me) return

    const tierIdx     = getTierIndex(newTier)
    const prevTierIdx = getTierIndex(currentTierRef.current)
    const comingFromLeft = tierIdx > prevTierIdx

    const newX = comingFromLeft ? EXIT_ZONE_WIDTH + 100 : MAP_W - EXIT_ZONE_WIDTH - 100
    const newY = MAP_H / 2 + (Math.random() - 0.5) * 300

    const updatedPlayer: MapPlayer = { ...me, currentTier: newTier, x: newX, y: newY }
    myPlayerRef.current = updatedPlayer
    playersRef.current.set(me.userId, updatedPlayer)

    currentTierRef.current = newTier
    setCurrentTier(newTier)
    setBossPrompt(null)

    joinTierChannel(newTier, updatedPlayer)

    fadeDirRef.current = 'in'
    fadeStartRef.current = performance.now()
  }, [joinTierChannel])

  // ── Draw loop ─────────────────────────────────────────────────────────────

  const draw = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const me    = myPlayerRef.current
    const cw    = canvas.width
    const ch    = canvas.height
    const tier  = currentTierRef.current || 'Apprentice'
    const biome = BIOME[tier] ?? BIOME['Apprentice']
    const tierIdx = getTierIndex(tier)

    const camX = me ? Math.max(0, Math.min(me.x - cw / 2, MAP_W - cw)) : 0
    const camY = me ? Math.max(0, Math.min(me.y - ch / 2, MAP_H - ch)) : 0

    ctx.clearRect(0, 0, cw, ch)

    // ── Sky ───────────────────────────────────────────────────────────────
    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch * 0.62)
    skyGrad.addColorStop(0, biome.sky[0])
    skyGrad.addColorStop(1, biome.sky[1])
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, cw, ch * 0.62)

    // Stars for Scholar+
    if (tierIdx >= 5) {
      for (let i = 0; i < 40; i++) {
        const sx = ((i * 173 + tierIdx * 37) % MAP_W) - (camX * 0.1)
        const sy = (i * 97 + tierIdx * 13) % (ch * 0.55)
        if (sx < 0 || sx > cw) continue
        const pulse = 0.4 + 0.4 * Math.sin(timestamp * 0.0015 + i)
        ctx.save()
        ctx.globalAlpha = pulse
        ctx.fillStyle = '#fff'
        ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
    }

    // ── Ground ────────────────────────────────────────────────────────────
    const groundGrad = ctx.createLinearGradient(0, ch * 0.62, 0, ch)
    groundGrad.addColorStop(0, biome.ground)
    groundGrad.addColorStop(1, '#000')
    ctx.fillStyle = groundGrad
    ctx.fillRect(0, ch * 0.62, cw, ch * 0.38)

    // ── Parallax hills ────────────────────────────────────────────────────
    for (let layer = 0; layer < 3; layer++) {
      const hillY   = ch * (0.60 + layer * 0.035)
      const freq    = 0.0006 + layer * 0.0003
      const amp     = 50 - layer * 12
      const parallax = camX * (0.2 + layer * 0.15)

      ctx.save()
      ctx.globalAlpha = 0.5 + layer * 0.25
      ctx.fillStyle = biome.hill
      ctx.beginPath()
      ctx.moveTo(0, ch)
      ctx.lineTo(0, hillY)
      for (let x = 0; x <= cw; x += 4) {
        const wx = x + parallax
        ctx.lineTo(x, hillY + Math.sin(wx * freq) * amp + Math.sin(wx * freq * 2.1) * (amp * 0.3))
      }
      ctx.lineTo(cw, ch)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    // Horizon glow line
    ctx.save()
    ctx.globalAlpha = 0.18
    ctx.strokeStyle = biome.accent
    ctx.lineWidth = 1.5
    ctx.shadowColor = biome.accent
    ctx.shadowBlur = 8
    ctx.beginPath(); ctx.moveTo(0, ch * 0.62); ctx.lineTo(cw, ch * 0.62); ctx.stroke()
    ctx.restore()

    // ── Left portal (prev tier) ───────────────────────────────────────────
    if (tierIdx > 0) {
      const prevTier  = TIER_NAMES[tierIdx - 1]
      const prevBiome = BIOME[prevTier]
      const px = EXIT_ZONE_WIDTH / 2 - camX
      const py = MAP_H * 0.62 - camY  // sits on the ground line
      const pulse = 0.7 + 0.3 * Math.sin(timestamp * 0.002)

      if (px > -80 && px < cw + 80) {
        // Glow pool on ground
        const pg = ctx.createRadialGradient(px, py, 0, px, py, 70)
        pg.addColorStop(0, prevBiome.accent + '44')
        pg.addColorStop(1, 'transparent')
        ctx.fillStyle = pg; ctx.fillRect(px - 70, py - 70, 140, 140)

        // Arch
        ctx.save()
        ctx.strokeStyle = prevBiome.accent
        ctx.lineWidth = 3
        ctx.shadowColor = prevBiome.accent
        ctx.shadowBlur = 14 * pulse
        ctx.beginPath()
        ctx.arc(px, py, 38, Math.PI, 0)
        ctx.lineTo(px + 38, py + 32)
        ctx.moveTo(px - 38, py + 32)
        ctx.lineTo(px - 38, py)
        ctx.stroke()

        // Inner shimmer
        ctx.globalAlpha = 0.25 * pulse
        ctx.fillStyle = prevBiome.accent
        ctx.beginPath()
        ctx.arc(px, py, 30, Math.PI, 0)
        ctx.lineTo(px + 30, py + 26)
        ctx.lineTo(px - 30, py + 26)
        ctx.closePath()
        ctx.fill()
        ctx.restore()

        // Label
        ctx.save()
        ctx.font = '600 9px "Cinzel", serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = prevBiome.accent
        ctx.globalAlpha = 0.85
        ctx.fillText('← ' + prevTier.toUpperCase(), px, py + 50)
        ctx.restore()
      }
    }

    // ── Right portal (next tier) ──────────────────────────────────────────
    if (tierIdx < TIER_NAMES.length - 1) {
      const nextTier  = TIER_NAMES[tierIdx + 1]
      const nextBiome = BIOME[nextTier]
      const px = MAP_W - EXIT_ZONE_WIDTH / 2 - camX
      const py = MAP_H * 0.62 - camY
      const pulse = 0.7 + 0.3 * Math.sin(timestamp * 0.002 + 1.5)

      if (px > -80 && px < cw + 80) {
        const pg = ctx.createRadialGradient(px, py, 0, px, py, 70)
        pg.addColorStop(0, nextBiome.accent + '44')
        pg.addColorStop(1, 'transparent')
        ctx.fillStyle = pg; ctx.fillRect(px - 70, py - 70, 140, 140)

        ctx.save()
        ctx.strokeStyle = nextBiome.accent
        ctx.lineWidth = 3
        ctx.shadowColor = nextBiome.accent
        ctx.shadowBlur = 14 * pulse
        ctx.beginPath()
        ctx.arc(px, py, 38, Math.PI, 0)
        ctx.lineTo(px + 38, py + 32)
        ctx.moveTo(px - 38, py + 32)
        ctx.lineTo(px - 38, py)
        ctx.stroke()

        ctx.globalAlpha = 0.25 * pulse
        ctx.fillStyle = nextBiome.accent
        ctx.beginPath()
        ctx.arc(px, py, 30, Math.PI, 0)
        ctx.lineTo(px + 30, py + 26)
        ctx.lineTo(px - 30, py + 26)
        ctx.closePath()
        ctx.fill()
        ctx.restore()

        ctx.save()
        ctx.font = '600 9px "Cinzel", serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = nextBiome.accent
        ctx.globalAlpha = 0.85
        ctx.fillText(nextTier.toUpperCase() + ' →', px, py + 50)
        ctx.restore()
      }
    }

    // ── Boss lair (far right) ─────────────────────────────────────────────
    const boss = BOSSES[tier]
    if (boss) {
      const lairX = MAP_W - BOSS_ZONE_WIDTH / 2 - camX
      const lairY = MAP_H * 0.62 - camY
      const pulse = 0.6 + 0.4 * Math.sin(timestamp * 0.003)

      if (lairX > -80 && lairX < cw + 80) {
        // Glow
        const lg = ctx.createRadialGradient(lairX, lairY, 0, lairX, lairY, 60)
        lg.addColorStop(0, `rgba(163,45,45,${0.3 * pulse})`); lg.addColorStop(1, 'transparent')
        ctx.fillStyle = lg; ctx.fillRect(lairX - 60, lairY - 60, 120, 120)

        // Cave
        ctx.save()
        ctx.fillStyle = '#050205'
        ctx.strokeStyle = `rgba(200,60,60,${0.5 + 0.3 * pulse})`
        ctx.lineWidth = 2.5
        ctx.shadowColor = '#cc2222'; ctx.shadowBlur = 14 * pulse
        ctx.beginPath()
        ctx.arc(lairX, lairY, 28, Math.PI, 0)
        ctx.lineTo(lairX + 28, lairY + 22)
        ctx.lineTo(lairX - 28, lairY + 22)
        ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.restore()

        // Teeth
        ctx.fillStyle = '#050205'
        for (let i = 0; i < 5; i++) {
          const tx = lairX - 16 + i * 8
          const ty = lairY - 18 + (i % 2) * 5
          ctx.beginPath(); ctx.moveTo(tx - 3, ty); ctx.lineTo(tx + 3, ty); ctx.lineTo(tx, ty + 9); ctx.closePath(); ctx.fill()
        }

        // Eyes
        ctx.save()
        ctx.globalAlpha = 0.65 + 0.35 * pulse
        ctx.fillStyle = '#ff2222'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 6
        ctx.beginPath(); ctx.arc(lairX - 7, lairY - 3, 3, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(lairX + 7, lairY - 3, 3, 0, Math.PI * 2); ctx.fill()
        ctx.restore()

        // Label
        ctx.save()
        ctx.font = '500 10px "Cinzel", serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = `rgba(240,149,149,${0.55 + 0.3 * pulse})`
        ctx.fillText(`${boss.icon} ${boss.name}`, lairX, lairY + 40)
        ctx.restore()
      }
    }

    // ── Players ───────────────────────────────────────────────────────────
    playersRef.current.forEach(player => {
      const sx = player.x - camX
      const sy = player.y - camY
      if (sx < -50 || sx > cw + 50 || sy < -50 || sy > ch + 50) return

      const isMe       = player.userId === myPlayerRef.current?.userId
      const blobColor  = REALM_COLORS[player.realm] ?? '#9b72cf'
      const isHomeTier = player.tier === tier
      const sameTier   = myPlayerRef.current ? isSameTier(player.tier, myPlayerRef.current.tier) : false
      const nearby     = myPlayerRef.current && !isMe
        ? distXY(myPlayerRef.current.x, myPlayerRef.current.y, player.x, player.y) < CHALLENGE_RANGE
        : false

      // Bob
      const bobPhase = (player.x * 0.3 + player.y * 0.7) % (Math.PI * 2)
      const bob = Math.sin(timestamp * 0.003 + bobPhase) * 3
      const bx = sx; const by = sy + bob; const R = PLAYER_RADIUS

      // Shadow
      ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000'
      ctx.beginPath(); ctx.ellipse(bx, by + R + 4, R * 0.7, 4, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // Glow ring
      if (isMe || (nearby && sameTier)) {
        ctx.save()
        ctx.globalAlpha = isMe ? 0.32 : 0.18
        ctx.fillStyle = isMe ? blobColor : '#e03030'
        ctx.shadowColor = isMe ? blobColor : '#e03030'; ctx.shadowBlur = 18
        ctx.beginPath(); ctx.arc(bx, by, R + 6, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }

      // Blob body
      ctx.save()
      ctx.fillStyle = blobColor; ctx.shadowColor = blobColor; ctx.shadowBlur = isMe ? 12 : 4
      ctx.beginPath(); ctx.ellipse(bx, by + 2, R, R * 0.92, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // Belly
      ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#000'
      ctx.beginPath(); ctx.ellipse(bx, by + 6, R * 0.62, R * 0.38, 0, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // Eyes
      const eyeY = by - 2
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(bx - 6, eyeY, 4.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(bx + 6, eyeY, 4.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#1a1a2a'
      ctx.beginPath(); ctx.arc(bx - 5, eyeY + 1, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(bx + 5, eyeY + 1, 2.5, 0, Math.PI * 2); ctx.fill()

      // Glint
      ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.ellipse(bx - 5, by - 8, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // Name
      ctx.font = `${isMe ? '600' : '500'} 10px system-ui`
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.fillStyle = isMe ? '#fff' : 'rgba(220,200,255,0.75)'
      ctx.fillText(player.name.slice(0, 12), bx, by + R + 8)

      // Visiting badge
      if (!isHomeTier) {
        ctx.save(); ctx.font = '500 7px system-ui'; ctx.textAlign = 'center'
        ctx.fillStyle = 'rgba(200,200,255,0.45)'
        ctx.fillText(`[${player.tier}]`, bx, by + R + 20)
        ctx.restore()
      }

      // FIGHT badge
      if (!isMe && nearby && sameTier) {
        ctx.save()
        ctx.fillStyle = 'rgba(200,40,40,0.92)'
        ctx.beginPath(); ctx.roundRect(bx - 20, by - R - 20, 40, 14, 4); ctx.fill()
        ctx.fillStyle = '#ffbbbb'; ctx.font = '600 8px system-ui'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('FIGHT', bx, by - R - 13)
        ctx.restore()
      }
    })

    // ── Fade overlay ──────────────────────────────────────────────────────
    const nowPerf = performance.now()
    if (fadeDirRef.current === 'out') {
      const elapsed = nowPerf - fadeStartRef.current
      fadeRef.current = Math.min(1, elapsed / FADE_DURATION)
      if (fadeRef.current >= 1 && pendingTierRef.current) {
        fadeDirRef.current = null
        const target = pendingTierRef.current
        pendingTierRef.current = null
        completeTierTransition(target)
      }
    } else if (fadeDirRef.current === 'in') {
      const elapsed = nowPerf - fadeStartRef.current
      fadeRef.current = Math.max(0, 1 - elapsed / FADE_DURATION)
      if (fadeRef.current <= 0) {
        fadeDirRef.current = null
        setTransitioning(false)
      }
    }

    if (fadeRef.current > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fadeRef.current})`
      ctx.fillRect(0, 0, cw, ch)
    }

    // ── HUD ───────────────────────────────────────────────────────────────
    if (fadeRef.current < 0.8) {
      ctx.save()
      ctx.globalAlpha = 1 - fadeRef.current
      ctx.font = '600 11px "Cinzel", serif'
      ctx.textAlign = 'left'; ctx.textBaseline = 'top'
      ctx.fillStyle = biome.accent; ctx.shadowColor = biome.accent; ctx.shadowBlur = 6
      ctx.fillText(tier.toUpperCase(), 14, 14)
      ctx.restore()
    }

    animFrameRef.current = requestAnimationFrame(draw)
  }, [completeTierTransition])

  // ── Movement loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    const moveInterval = setInterval(() => {
      const me = myPlayerRef.current
      if (!me || fadeDirRef.current !== null) return

      let moved = false
      const keys = keysRef.current

      if (keys.has('ArrowLeft')  || keys.has('a')) { me.x = Math.max(PLAYER_RADIUS, me.x - PLAYER_SPEED); moved = true }
      if (keys.has('ArrowRight') || keys.has('d')) { me.x = Math.min(MAP_W - PLAYER_RADIUS, me.x + PLAYER_SPEED); moved = true }
      if (keys.has('ArrowUp')    || keys.has('w')) { me.y = Math.max(PLAYER_RADIUS, me.y - PLAYER_SPEED); moved = true }
      if (keys.has('ArrowDown')  || keys.has('s')) { me.y = Math.min(MAP_H - PLAYER_RADIUS, me.y + PLAYER_SPEED); moved = true }

      if (moved) {
        playersRef.current.set(me.userId, { ...me })

        const tierIdx   = getTierIndex(currentTierRef.current)
        const isHomeTier = currentTierRef.current === me.tier

        // Left portal
        if (me.x <= EXIT_ZONE_WIDTH && tierIdx > 0) {
          transitionToTier(TIER_NAMES[tierIdx - 1])
          return
        }

        // Right side — boss lair OR next tier portal
        if (me.x >= MAP_W - EXIT_ZONE_WIDTH) {
          if (isHomeTier && me.x >= MAP_W - BOSS_ZONE_WIDTH) {
            setBossPrompt(prev => prev ?? currentTierRef.current)
          } else if (me.x >= MAP_W - EXIT_ZONE_WIDTH && me.x < MAP_W - BOSS_ZONE_WIDTH && tierIdx < TIER_NAMES.length - 1) {
            transitionToTier(TIER_NAMES[tierIdx + 1])
            return
          }
        } else {
          setBossPrompt(null)
        }

        // Broadcast
        const now = Date.now()
        if (now - lastBroadcast.current > 100) {
          lastBroadcast.current = now
          channelRef.current?.send({
            type: 'broadcast', event: 'move',
            payload: { userId: me.userId, x: me.x, y: me.y },
          })
        }
      }
    }, 16)

    return () => clearInterval(moveInterval)
  }, [transitionToTier])

  // ── Canvas click → challenge ──────────────────────────────────────────────

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const me     = myPlayerRef.current
    if (!canvas || !me || fadeDirRef.current !== null) return

    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const camX = Math.max(0, Math.min(me.x - canvas.width / 2, MAP_W - canvas.width))
    const camY = Math.max(0, Math.min(me.y - canvas.height / 2, MAP_H - canvas.height))

    let hit: MapPlayer | null = null
    playersRef.current.forEach(player => {
      if (player.userId === me.userId) return
      const sx = player.x - camX; const sy = player.y - camY
      const screenDist = Math.sqrt((clickX - sx) ** 2 + (clickY - sy) ** 2)
      const worldDist  = distXY(me.x, me.y, player.x, player.y)
      if (screenDist < 28 && worldDist < CHALLENGE_RANGE) hit = player
    })

    if (hit) setSelectedPlayer(hit)
  }

  // ── PvP challenge ─────────────────────────────────────────────────────────

  async function sendChallenge(target: MapPlayer) {
    setSelectedPlayer(null)
    if (!isSameTier(myTier, target.tier)) {
      setError(`Cannot challenge ${target.name} — different tier (${target.tier})`); return
    }

    const res  = await fetch('/api/battle/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponent_id: target.userId }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }

    channelRef.current?.send({
      type: 'broadcast', event: 'challenge',
      payload: { toId: target.userId, fromId: myPlayerRef.current?.userId, fromName: myPlayerRef.current?.name ?? 'Unknown', battleId: data.battle_id },
    })

    router.push(`/battle/prep?battle_id=${data.battle_id}&opponent_name=${encodeURIComponent(target.name)}&opponent_power=${target.totalPower}`)
  }

  // ── PvE boss lair ─────────────────────────────────────────────────────────

  async function enterBossLair() {
    if (!bossPrompt || !myStats) return
    setEnteringBoss(true)

    const res  = await fetch('/api/pve/create', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to enter boss lair'); setEnteringBoss(false); return }

    channelRef.current?.send({
      type: 'broadcast', event: 'pve_invite',
      payload: { fromId: myPlayerRef.current?.userId, fromName: myPlayerRef.current?.name ?? 'Unknown', fromTier: myTier, battleId: data.battle_id, bossName: data.boss_name, bossTier: data.boss_tier },
    })

    router.push(`/pve/prep?battle_id=${data.battle_id}&boss_tier=${encodeURIComponent(data.boss_tier)}`)
  }

  function joinBossLair(invite: { battleId: string; bossTier: string }) {
    setPveInvite(null)
    router.push(`/pve/prep?battle_id=${encodeURIComponent(invite.battleId)}&boss_tier=${encodeURIComponent(invite.bossTier)}`)
  }

  // ── Init ──────────────────────────────────────────────────────────────────

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
      setCurrentTier(tier)
      currentTierRef.current = tier
      myTierRef.current = tier

      const primaryRealm = Object.keys(char.realms ?? {})[0] ?? 'academia'
      setMyStats({ hp: char.stats_hp ?? 100, attack: char.stats_attack ?? 50, defence: char.stats_defence ?? 50 })

      const spawnX = MAP_W / 2 + (Math.random() - 0.5) * 300
      const spawnY = MAP_H / 2 + (Math.random() - 0.5) * 300

      const myPlayer: MapPlayer = {
        userId: user.id, name: char.name ?? 'Unknown',
        totalPower: char.total_power, tier, currentTier: tier,
        realm: primaryRealm, gold: char.gold ?? 1000,
        x: spawnX, y: spawnY,
      }

      myPlayerRef.current = myPlayer
      playersRef.current.set(user.id, myPlayer)
      setLoading(false)

      joinTierChannel(tier, myPlayer)
      animFrameRef.current = requestAnimationFrame(draw)
    }

    const onKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key)
    const onKeyUp   = (e: KeyboardEvent) => keysRef.current.delete(e.key)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    init()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [draw, joinTierChannel])

  // ── Render ────────────────────────────────────────────────────────────────

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
        <h1 style={{ margin: 0, fontSize: '1.1rem', letterSpacing: '0.12em' }}>World Scale</h1>
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
            width={typeof window !== 'undefined' ? Math.min(window.innerWidth, 1400) : 1200}
            height={typeof window !== 'undefined' ? Math.min(window.innerHeight - 60, 800) : 700}
            onClick={handleCanvasClick}
            style={{ display: 'block', cursor: fadeDirRef.current !== null ? 'default' : 'crosshair' }}
          />

          {/* Controls hint */}
          <div style={{ position: 'absolute', bottom: '12px', left: '12px', fontFamily: '"Crimson Text", serif', color: 'rgba(155,114,207,0.45)', fontSize: '0.78rem' }}>
            Move: WASD · Walk to map edge to travel between tiers · Get close to a player to challenge · Walk into the lair to fight the boss
          </div>

          {/* Tier badges */}
          <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            {currentTier !== myTier && (
              <div style={{ padding: '0.3rem 0.8rem', background: 'rgba(10,10,15,0.8)', border: '1px solid rgba(155,114,207,0.15)', borderRadius: '999px', fontSize: '0.6rem', letterSpacing: '0.1em', color: '#5a4c70' }}>
                Home: {myTier}
              </div>
            )}
            <div style={{ padding: '0.3rem 0.8rem', background: 'rgba(10,10,15,0.85)', border: '1px solid rgba(155,114,207,0.3)', borderRadius: '999px', fontSize: '0.65rem', letterSpacing: '0.15em', color: '#9b72cf' }}>
              {currentTier}
            </div>
          </div>
        </div>
      )}

      {/* Boss lair prompt */}
      {bossPrompt && bossForPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: '#0f0f1a', border: '1px solid rgba(163,45,45,0.4)', borderRadius: '16px', padding: '2rem', width: '340px', textAlign: 'center' }}>
            <div className="flicker" style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{bossForPrompt.icon}</div>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem', color: '#f09595', letterSpacing: '0.08em' }}>{bossForPrompt.name}</h2>
            <div style={{ fontFamily: '"Crimson Text", serif', color: '#4a3860', fontSize: '0.75rem', marginBottom: '0.5rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {bossForPrompt.tier} Lair · 💰 {bossForPrompt.goldReward} gold reward
            </div>
            <p style={{ fontFamily: '"Crimson Text", serif', color: '#8878a0', fontSize: '0.9rem', margin: '0 0 1.5rem', fontStyle: 'italic', lineHeight: 1.5 }}>
              {bossForPrompt.lore}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={enterBossLair} disabled={enteringBoss}
                style={{ flex: 1, padding: '0.75rem', background: enteringBoss ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, rgba(163,45,45,0.5), rgba(99,57,134,0.5))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: enteringBoss ? 'not-allowed' : 'pointer' }}>
                {enteringBoss ? 'Entering...' : '⚔️ Enter Lair'}
              </button>
              <button onClick={() => setBossPrompt(null)}
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
              <button onClick={() => sendChallenge(selectedPlayer)}
                style={{ width: '100%', padding: '0.75rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.4), rgba(99,57,134,0.4))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: '0.5rem' }}>
                ⚔️ Challenge to Battle
              </button>
            ) : (
              <div style={{ padding: '0.75rem', background: 'rgba(163,45,45,0.1)', border: '1px solid rgba(163,45,45,0.2)', borderRadius: '8px', fontFamily: '"Crimson Text", serif', color: '#f09595', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                Different tier — cannot challenge
              </div>
            )}
            <button onClick={() => setSelectedPlayer(null)}
              style={{ width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', color: '#4a3860', fontFamily: '"Crimson Text", serif', fontSize: '0.9rem', cursor: 'pointer' }}>
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
              <button onClick={() => joinBossLair(pveInvite)}
                style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.4), rgba(99,57,134,0.4))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                ⚔️ Join Raid
              </button>
              <button onClick={() => setPveInvite(null)}
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
                  const c = challenge; setChallenge(null)
                  const opp = playersRef.current.get(c.fromId)
                  router.push(`/battle/prep?battle_id=${c.battleId}&opponent_name=${encodeURIComponent(c.fromName)}&opponent_power=${opp?.totalPower ?? 0}`)
                }}
                style={{ flex: 1, padding: '0.75rem', background: 'linear-gradient(135deg, rgba(163,45,45,0.4), rgba(99,57,134,0.4))', border: '1px solid rgba(163,45,45,0.5)', borderRadius: '8px', color: '#e8e0f0', fontFamily: '"Cinzel", serif', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Accept
              </button>
              <button onClick={() => setChallenge(null)}
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
