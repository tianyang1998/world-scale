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

// ── Biome config ──────────────────────────────────────────────────────────────
const BIOME: Record<string, { sky: [string, string]; ground: string; hill: string; accent: string }> = {
  Apprentice:  { sky: ['#1a1a2e', '#2d2a4a'], ground: '#2a2a1a', hill: '#3a3a22', accent: '#888780' },
  Initiate:    { sky: ['#1a2e1a', '#2a4a2a'], ground: '#1a2e1a', hill: '#2a4a1a', accent: '#7aaa50' },
  Acolyte:     { sky: ['#1a2e20', '#2a4a30'], ground: '#1a3020', hill: '#2a5030', accent: '#50cc70' },
  Journeyman:  { sky: ['#102030', '#1a3a50'], ground: '#102840', hill: '#1a3850', accent: '#3a8ab0' },
  Adept:       { sky: ['#101830', '#1a2850'], ground: '#101830', hill: '#1a2848', accent: '#5070c0' },
  Scholar:     { sky: ['#100e30', '#1e1a50'], ground: '#100e30', hill: '#1e1a50', accent: '#7060d0' },
  Sage:        { sky: ['#1a0e30', '#2e1a50'], ground: '#1a0e30', hill: '#2e1a50', accent: '#9060c0' },
  Arcanist:    { sky: ['#200e28', '#381448'], ground: '#200e28', hill: '#381448', accent: '#b050c0' },
  Exemplar:    { sky: ['#280e1a', '#481428'], ground: '#280e1a', hill: '#481428', accent: '#c04080' },
  Vanguard:    { sky: ['#2e1008', '#501808'], ground: '#2e1008', hill: '#501808', accent: '#c06030' },
  Master:      { sky: ['#301008', '#582010'], ground: '#301008', hill: '#582010', accent: '#d07020' },
  Grandmaster: { sky: ['#381408', '#602808'], ground: '#381408', hill: '#602808', accent: '#e08030' },
  Champion:    { sky: ['#400808', '#700808'], ground: '#400808', hill: '#700808', accent: '#e04020' },
  Paragon:     { sky: ['#480808', '#800808'], ground: '#480808', hill: '#800808', accent: '#f03030' },
  Legend:      { sky: ['#200020', '#500050'], ground: '#200020', hill: '#500050', accent: '#ff40ff' },
}

const REALM_COLORS: Record<string, string> = {
  academia: '#5588ee',
  tech:     '#44ddaa',
  medicine: '#44cc66',
  creative: '#ee8844',
  law:      '#aa66ee',
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
  const [bossPrompt,     setBossPrompt]     = useState<string | null>(null)
  const [enteringBoss,   setEnteringBoss]   = useState(false)
  const [pveInvite,      setPveInvite]      = useState<{ fromName: string; battleId: string; bossName: string; bossTier: string } | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)

  // ── Canvas draw loop ──────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const me = myPlayerRef.current
    const cw = canvas.width
    const ch = canvas.height
    const now = performance.now()

    const camX = me ? Math.max(0, Math.min(me.x - cw / 2, MAP_WIDTH - cw)) : 0

    ctx.clearRect(0, 0, cw, ch)

    // ── Draw each visible tier zone ─────────────────────────────────────────
    TIERS.forEach(t => {
      const zone  = TIER_ZONES[t.name]
      const biome = BIOME[t.name]
      if (!zone || !biome) return
      const sx = zone.x - camX
      if (sx + zone.width < 0 || sx > cw) return

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(sx, 0, sx, ch * 0.72)
      skyGrad.addColorStop(0, biome.sky[0])
      skyGrad.addColorStop(1, biome.sky[1])
      ctx.fillStyle = skyGrad
      ctx.fillRect(sx, 0, zone.width, ch * 0.72)

      // Ground gradient
      const groundGrad = ctx.createLinearGradient(sx, ch * 0.72, sx, ch)
      groundGrad.addColorStop(0, biome.ground)
      groundGrad.addColorStop(1, '#000')
      ctx.fillStyle = groundGrad
      ctx.fillRect(sx, ch * 0.72, zone.width, ch * 0.28)

      // Rolling hills along the horizon
      const seed  = zone.x
      const hillY = ch * 0.72
      ctx.fillStyle = biome.hill
      ctx.beginPath()
      ctx.moveTo(sx, ch)
      ctx.lineTo(sx, hillY + 20 + Math.sin(seed * 0.05) * 18)
      ctx.bezierCurveTo(
        sx + zone.width * 0.25, hillY - 10 + Math.sin(seed * 0.03) * 20,
        sx + zone.width * 0.5,  hillY + 30 + Math.sin(seed * 0.07) * 15,
        sx + zone.width * 0.75, hillY - 5  + Math.cos(seed * 0.04) * 22,
      )
      ctx.lineTo(sx + zone.width, hillY + 15 + Math.sin(seed * 0.06) * 16)
      ctx.lineTo(sx + zone.width, ch)
      ctx.closePath()
      ctx.fill()

      // Glowing horizon line
      ctx.save()
      ctx.globalAlpha = 0.18
      ctx.strokeStyle = biome.accent
      ctx.lineWidth = 2
      ctx.shadowColor = biome.accent
      ctx.shadowBlur = 8
      ctx.beginPath()
      ctx.moveTo(sx, hillY + 20 + Math.sin(seed * 0.05) * 18)
      ctx.bezierCurveTo(
        sx + zone.width * 0.25, hillY - 10 + Math.sin(seed * 0.03) * 20,
        sx + zone.width * 0.5,  hillY + 30 + Math.sin(seed * 0.07) * 15,
        sx + zone.width * 0.75, hillY - 5  + Math.cos(seed * 0.04) * 22,
      )
      ctx.stroke()
      ctx.restore()

      // Stars in sky for higher tiers (Scholar+)
      const tierIndex = TIERS.findIndex(x => x.name === t.name)
      if (tierIndex >= 5) {
        for (let i = 0; i < 5; i++) {
          const starX  = sx + ((seed * 37 + i * 137) % zone.width)
          const starY  = 20 + ((seed * 17 + i * 97) % (ch * 0.55))
          const pulse  = 0.5 + 0.5 * Math.sin(now * 0.002 + i + seed)
          ctx.save()
          ctx.globalAlpha = pulse * 0.4
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.arc(starX, starY, 1.2, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      // Soft border between zones
      const borderGrad = ctx.createLinearGradient(sx, 0, sx + 4, 0)
      borderGrad.addColorStop(0, biome.accent + '40')
      borderGrad.addColorStop(1, 'transparent')
      ctx.fillStyle = borderGrad
      ctx.fillRect(sx, 0, 4, ch)

      // Zone label
      ctx.save()
      ctx.globalAlpha = 0.75
      ctx.font = '600 11px "Cinzel", serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = biome.accent
      ctx.shadowColor = biome.accent
      ctx.shadowBlur = 6
      ctx.fillText(t.name.toUpperCase(), sx + zone.width / 2, 14)
      ctx.restore()

      // ── Boss lair cave mouth ──────────────────────────────────────────────
      const bossX  = sx + zone.width - BOSS_ZONE_WIDTH
      const lairCX = bossX + BOSS_ZONE_WIDTH / 2
      const lairCY = ch / 2
      const pulse  = 0.6 + 0.4 * Math.sin(now * 0.003 + seed)

      // Pulsing ground glow
      const lairGlow = ctx.createRadialGradient(lairCX, lairCY, 0, lairCX, lairCY, 38)
      lairGlow.addColorStop(0, `rgba(163,45,45,${0.3 * pulse})`)
      lairGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = lairGlow
      ctx.fillRect(bossX - 10, lairCY - 38, BOSS_ZONE_WIDTH + 20, 76)

      // Cave arch body
      ctx.save()
      ctx.fillStyle = '#050205'
      ctx.strokeStyle = `rgba(200,60,60,${0.5 + 0.3 * pulse})`
      ctx.lineWidth = 2
      ctx.shadowColor = '#cc2222'
      ctx.shadowBlur = 10 * pulse
      ctx.beginPath()
      ctx.arc(lairCX, lairCY, 18, Math.PI, 0)
      ctx.lineTo(lairCX + 18, lairCY + 14)
      ctx.lineTo(lairCX - 18, lairCY + 14)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()

      // Stalactite teeth
      ctx.fillStyle = '#050205'
      for (let i = 0; i < 4; i++) {
        const tx = lairCX - 12 + i * 8
        const ty = lairCY - 15 + (i % 2) * 4
        ctx.beginPath()
        ctx.moveTo(tx - 3, ty)
        ctx.lineTo(tx + 3, ty)
        ctx.lineTo(tx, ty + 8)
        ctx.closePath()
        ctx.fill()
      }

      // Glowing red eyes inside cave
      ctx.save()
      ctx.globalAlpha = 0.6 + 0.4 * pulse
      ctx.fillStyle = '#ff2222'
      ctx.shadowColor = '#ff0000'
      ctx.shadowBlur = 6
      ctx.beginPath(); ctx.arc(lairCX - 5, lairCY - 2, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(lairCX + 5, lairCY - 2, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // LAIR label
      ctx.save()
      ctx.font = '500 7px system-ui'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = `rgba(240,149,149,${0.4 + 0.3 * pulse})`
      ctx.fillText('LAIR', lairCX, lairCY + 18)
      ctx.restore()
    })

    // ── Players ─────────────────────────────────────────────────────────────
    playersRef.current.forEach(player => {
      const sx = player.x - camX
      const sy = player.y
      if (sx < -40 || sx > cw + 40) return

      const isMe      = player.userId === myPlayerRef.current?.userId
      const sameTier  = myPlayerRef.current ? isSameTier(player.tier, myPlayerRef.current.tier) : false
      const blobColor = REALM_COLORS[player.realm] ?? '#9b72cf'

      // Gentle bob — unique phase per player position
      const bobPhase = (player.x * 0.3 + player.y * 0.7) % (Math.PI * 2)
      const bob = Math.sin(now * 0.003 + bobPhase) * 3
      const bx  = sx
      const by  = sy + bob
      const R   = 18

      // Ground shadow
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.ellipse(bx, by + R + 4, R * 0.7, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Outer glow for self or battleable players
      if (isMe || sameTier) {
        ctx.save()
        ctx.globalAlpha = isMe ? 0.35 : 0.2
        ctx.fillStyle   = isMe ? blobColor : '#e03030'
        ctx.shadowColor = isMe ? blobColor : '#e03030'
        ctx.shadowBlur  = 16
        ctx.beginPath()
        ctx.arc(bx, by, R + 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // Blob body
      ctx.save()
      ctx.fillStyle   = blobColor
      ctx.shadowColor = blobColor
      ctx.shadowBlur  = isMe ? 12 : 4
      ctx.beginPath()
      ctx.ellipse(bx, by + 2, R, R * 0.92, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Darker belly shading
      ctx.save()
      ctx.globalAlpha = 0.25
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.ellipse(bx, by + 6, R * 0.65, R * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // White dot eyes
      const eyeY = by - 2
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(bx - 6, eyeY, 4.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(bx + 6, eyeY, 4.5, 0, Math.PI * 2); ctx.fill()

      // Pupils
      ctx.fillStyle = '#1a1a2a'
      ctx.beginPath(); ctx.arc(bx - 5, eyeY + 1, 2.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(bx + 5, eyeY + 1, 2.5, 0, Math.PI * 2); ctx.fill()

      // Highlight glint
      ctx.save()
      ctx.globalAlpha = 0.55
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(bx - 5, by - 8, 5, 3, -0.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // Player name
      ctx.font = `${isMe ? '600' : '500'} 10px system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = isMe ? '#fff' : 'rgba(220,200,255,0.75)'
      ctx.fillText(player.name.slice(0, 12), bx, by + R + 8)

      // FIGHT badge for same-tier other players
      if (!isMe && sameTier) {
        ctx.save()
        ctx.fillStyle = 'rgba(200,40,40,0.9)'
        ctx.beginPath()
        ctx.roundRect(bx - 18, by - R - 18, 36, 14, 4)
        ctx.fill()
        ctx.fillStyle = '#ffbbbb'
        ctx.font = '600 8px system-ui'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('FIGHT', bx, by - R - 11)
        ctx.restore()
      }
    })

    animFrameRef.current = requestAnimationFrame(draw)
  }, [])

  // ── Movement loop ─────────────────────────────────────────────────────────
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

        const bossZoneTier = getBossZoneTier(me.x)
        if (bossZoneTier && bossZoneTier === myPlayerRef.current?.tier) {
          setBossPrompt(prev => prev ?? bossZoneTier)
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

  // ── Canvas click → challenge ──────────────────────────────────────────────
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

  // ── PvP challenge flow ────────────────────────────────────────────────────
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

  // ── PvE enter boss lair ───────────────────────────────────────────────────
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

    channelRef.current?.send({
      type: 'broadcast',
      event: 'pve_invite',
      payload: {
        fromId:   myPlayerRef.current?.userId,
        fromName: myPlayerRef.current?.name ?? 'Unknown',
        fromTier: myTier,
        battleId: data.battle_id,
        bossName: data.boss_name,
        bossTier: data.boss_tier,
      },
    })

    router.push(
      `/pve/prep` +
      `?battle_id=${data.battle_id}` +
      `&boss_tier=${encodeURIComponent(data.boss_tier)}`
    )
  }

  function joinBossLair(invite: { battleId: string; bossTier: string }) {
    setPveInvite(null)
    router.push(
      `/pve/prep` +
      `?battle_id=${encodeURIComponent(invite.battleId)}` +
      `&boss_tier=${encodeURIComponent(invite.bossTier)}`
    )
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

      channel.on('broadcast', { event: 'pve_invite' }, ({ payload }: { payload: { fromId: string, fromName: string, fromTier: string, battleId: string, bossName: string, bossTier: string } }) => {
        if (payload.fromId === user.id) return
        if (payload.fromTier !== myPlayerRef.current?.tier) return
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
            Move: WASD or Arrow keys · Click a player to challenge · Walk into a lair to fight the boss
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
