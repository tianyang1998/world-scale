'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { calcDamage, REALM_SKILLS, calcGoldTransfer } from '@/lib/battle'
import { getTierStyle } from '@/lib/types'
import {
  Projectile, drawProjectile, drawHitFlash,
  updateProjectile, checkHit, checkNoDodgeHit,
  createSword, createRealmProjectile, createHealPulse,
} from '@/lib/projectiles'

interface Fighter {
  userId: string; name: string; realm: string
  maxHp: number; currentHp: number; attack: number; defence: number
  isBracing: boolean; isStunned: boolean
  defenceDebuffMultiplier: number; defenceDebuffUntil: number
  attackDebuffMultiplier: number; attackDebuffUntil: number
  realmSkillLastUsed: number; gold: number
}

interface ArenaPlayer { x: number; y: number; facing: number }
interface HitFlash { x: number; y: number; color: string; age: number }
type BattlePhase = 'waiting' | 'fighting' | 'ended'

const ARENA_W = 800; const ARENA_H = 500
const PLAYER_RADIUS = 16; const MELEE_RANGE = 64; const PLAYER_SPEED = 3
const RECONNECT_WINDOW = 5000

const PILLARS = [
  { x: 400, y: 250, r: 32 }, { x: 200, y: 150, r: 24 }, { x: 600, y: 150, r: 24 },
  { x: 200, y: 350, r: 24 }, { x: 600, y: 350, r: 24 }, { x: 140, y: 250, r: 18 },
  { x: 660, y: 250, r: 18 }, { x: 400, y: 100, r: 18 }, { x: 400, y: 400, r: 18 },
]
const WALLS = [
  { x1: 280, y1: 80, x2: 520, y2: 80, t: 12 }, { x1: 280, y1: 420, x2: 520, y2: 420, t: 12 },
  { x1: 80, y1: 180, x2: 80, y2: 320, t: 12 }, { x1: 720, y1: 180, x2: 720, y2: 320, t: 12 },
]
const REALM_ICONS: Record<string, string> = { academia: '📚', tech: '⚡', medicine: '⚕️', creative: '🎨', law: '⚖️' }

function clampToPillar(x: number, y: number, px: number, py: number, pr: number) {
  const dx = x - px; const dy = y - py; const d = Math.sqrt(dx*dx+dy*dy); const min = pr + PLAYER_RADIUS
  if (d < min && d > 0) return { x: px+(dx/d)*min, y: py+(dy/d)*min }; return { x, y }
}
function clampToWall(x: number, y: number, w: { x1: number; y1: number; x2: number; y2: number; t: number }) {
  const isH = w.y1===w.y2
  if (isH) { if (x>=w.x1-w.t&&x<=w.x2+w.t&&Math.abs(y-w.y1)<PLAYER_RADIUS+w.t/2) return { x, y: y<w.y1?w.y1-PLAYER_RADIUS-w.t/2:w.y1+PLAYER_RADIUS+w.t/2 } }
  else { if (y>=w.y1-w.t&&y<=w.y2+w.t&&Math.abs(x-w.x1)<PLAYER_RADIUS+w.t/2) return { x: x<w.x1?w.x1-PLAYER_RADIUS-w.t/2:w.x1+PLAYER_RADIUS+w.t/2, y } }
  return { x, y }
}
function applyCollisions(x: number, y: number) {
  let p = { x: Math.max(PLAYER_RADIUS,Math.min(ARENA_W-PLAYER_RADIUS,x)), y: Math.max(PLAYER_RADIUS,Math.min(ARENA_H-PLAYER_RADIUS,y)) }
  for (const pl of PILLARS) p = clampToPillar(p.x,p.y,pl.x,pl.y,pl.r)
  for (const w of WALLS) p = clampToWall(p.x,p.y,w); return p
}
function hasLOS(ax: number, ay: number, bx: number, by: number) {
  for (const p of PILLARS) {
    const dx=bx-ax,dy=by-ay,fx=ax-p.x,fy=ay-p.y,a=dx*dx+dy*dy,b=2*(fx*dx+fy*dy),c=fx*fx+fy*fy-p.r*p.r,disc=b*b-4*a*c
    if (disc>=0) { const t1=(-b-Math.sqrt(disc))/(2*a),t2=(-b+Math.sqrt(disc))/(2*a); if ((t1>=0&&t1<=1)||(t2>=0&&t2<=1)) return false }
  }; return true
}
function distXY(ax: number, ay: number, bx: number, by: number) { return Math.sqrt((ax-bx)**2+(ay-by)**2) }

export default function BattlePage() {
  const router = useRouter()
  const { id: battleId } = useParams<{ id: string }>()
  const params = useSearchParams()
  const hp = Number(params.get('hp')??0), attack = Number(params.get('attack')??0), defence = Number(params.get('defence')??0)
  const realm = params.get('realm')?? 'academia'

  const [phase, setPhase] = useState<BattlePhase>('waiting')
  const [me, setMe] = useState<Fighter|null>(null)
  const [opponent, setOpponent] = useState<Fighter|null>(null)
  const [userId, setUserId] = useState<string|null>(null)
  const [log, setLog] = useState<string[]>([])
  const [winner, setWinner] = useState<string|null>(null)
  const [goldDelta, setGoldDelta] = useState<number|null>(null)
  const [oppDisconnected, setOppDisconnected] = useState(false)
  const [reconnectTimer, setReconnectTimer] = useState(0)
  const [inRange, setInRange] = useState(false)
  const [hasLOSState, setHasLOSState] = useState(false)
  const [realmCooldownUntil, setRealmCooldownUntil] = useState(0)
  const [bracingUntil, setBracingUntil] = useState(0)
  const [now, setNow] = useState(Date.now())

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']>|null>(null)
  const meRef = useRef<Fighter|null>(null)
  const opponentRef = useRef<Fighter|null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const animFrameRef = useRef<number>(0)
  const lastBroadcast = useRef(0)
  const lastFrameTime = useRef(0)
  const supabaseRef = useRef(createClient())
  const myPosRef = useRef<ArenaPlayer>({ x: 120, y: 250, facing: 0 })
  const oppPosRef = useRef<ArenaPlayer>({ x: 680, y: 250, facing: Math.PI })
  const userIdRef = useRef<string|null>(null)
  const phaseRef = useRef<BattlePhase>('waiting')
  const projectilesRef = useRef<Projectile[]>([])
  const hitFlashesRef = useRef<HitFlash[]>([])

  useEffect(()=>{ meRef.current=me },[me])
  useEffect(()=>{ opponentRef.current=opponent },[opponent])
  useEffect(()=>{ userIdRef.current=userId },[userId])
  useEffect(()=>{ phaseRef.current=phase },[phase])
  useEffect(()=>{ const t=setInterval(()=>setNow(Date.now()),100); return ()=>clearInterval(t) },[])
  useEffect(()=>{ if(logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight },[log])
  function addLog(msg: string) { setLog(prev=>[...prev.slice(-50),msg]) }

  const endBattle = useCallback(async(winnerId: string, loser: Fighter, _winner: Fighter)=>{
    setPhase('ended'); setWinner(winnerId===userIdRef.current?'you':'opponent')
    const gold = calcGoldTransfer(loser.gold); setGoldDelta(winnerId===userIdRef.current?gold:-gold)
    await fetch('/api/battle/end',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ battle_id:battleId, winner_id:winnerId, gold_transferred:gold }) })
  },[battleId])

  const applyDamageToMe = useCallback((damage: number, attackerId: string, proj: Projectile)=>{
    const currentMe = meRef.current; if (!currentMe) return
    const bracingNow = Date.now() < bracingUntil
    const reduced = bracingNow ? Math.round(damage*0.7) : damage
    const newHp = Math.max(0, currentMe.currentHp - reduced)
    hitFlashesRef.current.push({ x:myPosRef.current.x, y:myPosRef.current.y, color:proj.color, age:0 })
    setMe(prev=>prev?{...prev,currentHp:newHp}:prev)
    addLog(`${bracingNow?'🛡️ Blocked! ':''}Hit for ${reduced}${bracingNow?` (was ${damage})`:''}`)
    if (newHp<=0) endBattle(attackerId, currentMe, opponentRef.current!)
  },[bracingUntil, endBattle])

  const applyDamageToOpp = useCallback((damage: number, proj: Projectile)=>{
    const opp = opponentRef.current; const currentMe = meRef.current; if (!opp||!currentMe) return
    const newHp = Math.max(0, opp.currentHp - damage)
    hitFlashesRef.current.push({ x:oppPosRef.current.x, y:oppPosRef.current.y, color:proj.color, age:0 })
    setOpponent(prev=>prev?{...prev,currentHp:newHp}:prev)
    addLog(`⚔️ Hit for ${damage}!`)
    if (newHp<=0) endBattle(userIdRef.current!, opp, currentMe)
  },[endBattle])

  const draw = useCallback((timestamp: number)=>{
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dtMs = lastFrameTime.current ? timestamp-lastFrameTime.current : 16
    lastFrameTime.current = timestamp
    const myPos = myPosRef.current; const oppPos = oppPosRef.current
    ctx.clearRect(0,0,ARENA_W,ARENA_H); ctx.fillStyle='#0d0d18'; ctx.fillRect(0,0,ARENA_W,ARENA_H)
    ctx.strokeStyle='rgba(155,114,207,0.04)'; ctx.lineWidth=1
    for (let x=0;x<ARENA_W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ARENA_H);ctx.stroke()}
    for (let y=0;y<ARENA_H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(ARENA_W,y);ctx.stroke()}
    ctx.strokeStyle='rgba(155,114,207,0.25)'; ctx.lineWidth=2; ctx.strokeRect(1,1,ARENA_W-2,ARENA_H-2)
    for (const w of WALLS) {
      const isH=w.y1===w.y2; ctx.fillStyle='rgba(80,60,120,0.6)'; ctx.strokeStyle='rgba(155,114,207,0.4)'; ctx.lineWidth=1.5
      if(isH){ctx.fillRect(w.x1,w.y1-w.t/2,w.x2-w.x1,w.t);ctx.strokeRect(w.x1,w.y1-w.t/2,w.x2-w.x1,w.t)}
      else{ctx.fillRect(w.x1-w.t/2,w.y1,w.t,w.y2-w.y1);ctx.strokeRect(w.x1-w.t/2,w.y1,w.t,w.y2-w.y1)}
    }
    for (const p of PILLARS) {
      ctx.beginPath();ctx.arc(p.x+3,p.y+4,p.r,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fill()
      const g=ctx.createRadialGradient(p.x-p.r*.3,p.y-p.r*.3,p.r*.1,p.x,p.y,p.r)
      g.addColorStop(0,'rgba(110,80,160,0.9)');g.addColorStop(1,'rgba(40,30,70,0.95)')
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill()
      ctx.strokeStyle='rgba(155,114,207,0.5)';ctx.lineWidth=1.5;ctx.stroke()
    }
    // Draw players
    const drawP = (pos: ArenaPlayer, f: Fighter|null, isMe: boolean) => {
      if(!f) return; const color=isMe?'#9b72cf':'#cf7272'
      if(f.isBracing){ctx.beginPath();ctx.arc(pos.x,pos.y,PLAYER_RADIUS+6,0,Math.PI*2);ctx.fillStyle='rgba(55,138,221,0.2)';ctx.fill();ctx.strokeStyle='rgba(55,138,221,0.6)';ctx.lineWidth=2;ctx.stroke()}
      ctx.beginPath();ctx.arc(pos.x,pos.y,PLAYER_RADIUS,0,Math.PI*2);ctx.fillStyle=isMe?'rgba(100,60,160,0.9)':'rgba(160,60,60,0.9)';ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke()
      ctx.beginPath();ctx.moveTo(pos.x,pos.y);ctx.lineTo(pos.x+Math.cos(pos.facing)*(PLAYER_RADIUS+5),pos.y+Math.sin(pos.facing)*(PLAYER_RADIUS+5));ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke()
      ctx.font='12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(REALM_ICONS[f.realm]??'🌐',pos.x,pos.y)
      ctx.font='500 9px system-ui';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=isMe?'#c8a8f0':'#f0a8a8'
      ctx.fillText(f.name.slice(0,10),pos.x,pos.y-PLAYER_RADIUS-5)
    }
    drawP(myPos,meRef.current,true); drawP(oppPos,opponentRef.current,false)

    // Projectiles
    const surviving: Projectile[] = []
    for (const proj of projectilesRef.current) {
      const alive = updateProjectile(proj,dtMs); if (!alive) continue
      if (proj.noDodge) {
        if (checkNoDodgeHit(proj)) { proj.hit=true; continue }
      } else if (proj.targetId===opponentRef.current?.userId) {
        if (checkHit(proj,oppPosRef.current.x,oppPosRef.current.y)) { proj.hit=true; applyDamageToOpp(proj.damage,proj); continue }
      } else if (proj.targetId===userIdRef.current) {
        if (checkHit(proj,myPosRef.current.x,myPosRef.current.y)) { proj.hit=true; applyDamageToMe(proj.damage,opponentRef.current?.userId??'',proj); continue }
      }
      drawProjectile(ctx,proj); surviving.push(proj)
    }
    projectilesRef.current = surviving
    hitFlashesRef.current = hitFlashesRef.current.filter(h=>{ h.age+=dtMs; if(h.age>300) return false; drawHitFlash(ctx,h.x,h.y,h.color,h.age); return true })

    // Range line
    const d=distXY(myPos.x,myPos.y,oppPos.x,oppPos.y); const los=hasLOS(myPos.x,myPos.y,oppPos.x,oppPos.y)
    if(d<MELEE_RANGE*2.5&&los){ctx.beginPath();ctx.moveTo(myPos.x,myPos.y);ctx.lineTo(oppPos.x,oppPos.y);ctx.strokeStyle=d<MELEE_RANGE?'rgba(227,75,74,0.2)':'rgba(155,114,207,0.08)';ctx.lineWidth=1;ctx.setLineDash([4,6]);ctx.stroke();ctx.setLineDash([])}
    animFrameRef.current = requestAnimationFrame(draw)
  },[applyDamageToMe,applyDamageToOpp])

  useEffect(()=>{
    const interval = setInterval(()=>{
      if(phaseRef.current!=='fighting') return
      const pos=myPosRef.current; const keys=keysRef.current; let dx=0,dy=0
      if(keys.has('ArrowLeft')||keys.has('a')) dx-=PLAYER_SPEED
      if(keys.has('ArrowRight')||keys.has('d')) dx+=PLAYER_SPEED
      if(keys.has('ArrowUp')||keys.has('w')) dy-=PLAYER_SPEED
      if(keys.has('ArrowDown')||keys.has('s')) dy+=PLAYER_SPEED
      if(dx!==0||dy!==0){
        const raw=applyCollisions(pos.x+dx,pos.y+dy); pos.x=raw.x; pos.y=raw.y; pos.facing=Math.atan2(dy,dx)
        const opp=oppPosRef.current; const d=distXY(pos.x,pos.y,opp.x,opp.y); const los=hasLOS(pos.x,pos.y,opp.x,opp.y)
        setInRange(d<MELEE_RANGE&&los); setHasLOSState(los)
        const n=Date.now()
        if(n-lastBroadcast.current>80){ lastBroadcast.current=n; channelRef.current?.send({type:'broadcast',event:'move',payload:{userId:userIdRef.current,x:pos.x,y:pos.y,facing:pos.facing}}) }
      }
    },16); return ()=>clearInterval(interval)
  },[])

  useEffect(()=>{
    const supabase = supabaseRef.current
    let disconnectTimer: ReturnType<typeof setTimeout>|null = null
    async function init(){
      const { data:{user} } = await supabase.auth.getUser()
      if(!user){ router.push('/auth'); return }
      setUserId(user.id); userIdRef.current=user.id
      const res=await fetch('/api/character/get'); const data=await res.json(); const gold=data.character?.gold??0
      const myFighter: Fighter = { userId:user.id, name:data.character?.name??'You', realm, maxHp:hp, currentHp:hp, attack, defence, isBracing:false, isStunned:false, defenceDebuffMultiplier:1.0, defenceDebuffUntil:0, attackDebuffMultiplier:1.0, attackDebuffUntil:0, realmSkillLastUsed:0, gold }
      setMe(myFighter); meRef.current=myFighter
      const channel=supabase.channel(`battle:${battleId}`,{config:{presence:{key:user.id}}})
      channelRef.current=channel
      channel.on('presence',{event:'join'},({key,newPresences}:{key:string,newPresences:{name:string,hp:number,attack:number,defence:number,gold:number,realm:string}[]})=>{
        if(key!==user.id){
          const p=newPresences[0]
          const opp: Fighter={userId:key,name:p.name,realm:p.realm,maxHp:p.hp,currentHp:p.hp,attack:p.attack,defence:p.defence,isBracing:false,isStunned:false,defenceDebuffMultiplier:1.0,defenceDebuffUntil:0,attackDebuffMultiplier:1.0,attackDebuffUntil:0,realmSkillLastUsed:0,gold:p.gold}
          setOpponent(opp); opponentRef.current=opp; setPhase('fighting'); phaseRef.current='fighting'
          setOppDisconnected(false); if(disconnectTimer) clearTimeout(disconnectTimer)
          addLog('⚔️ Battle started! Dodge the attacks!'); animFrameRef.current=requestAnimationFrame(draw)
        }
      })
      channel.on('presence',{event:'leave'},({key}:{key:string})=>{
        if(key!==user.id){
          setOppDisconnected(true); addLog('⚠️ Opponent disconnected — 5s to reconnect...')
          let count=RECONNECT_WINDOW/1000; setReconnectTimer(count)
          disconnectTimer=setInterval(()=>{ count--; setReconnectTimer(count); if(count<=0){ clearInterval(disconnectTimer!); const opp=opponentRef.current; const me2=meRef.current; if(opp&&me2) endBattle(user.id,opp,me2) }},1000)
        }
      })
      channel.on('broadcast',{event:'move'},({payload}:{payload:{userId:string,x:number,y:number,facing:number}})=>{
        if(payload.userId!==user.id){ oppPosRef.current={x:payload.x,y:payload.y,facing:payload.facing}; const mp=myPosRef.current; const d=distXY(mp.x,mp.y,payload.x,payload.y); const los=hasLOS(mp.x,mp.y,payload.x,payload.y); setInRange(d<MELEE_RANGE&&los); setHasLOSState(los) }
      })
      // Incoming projectile from opponent
      channel.on('broadcast',{event:'projectile'},({payload}:{payload:{actionType:string,realm:string,fromX:number,fromY:number,toX:number,toY:number,targetId:string,damage:number,effect?:string}})=>{
        if(phaseRef.current!=='fighting') return
        if(payload.actionType==='brace'){
          setOpponent(prev=>prev?{...prev,isBracing:true}:prev)
          setTimeout(()=>setOpponent(prev=>prev?{...prev,isBracing:false}:prev),1000)
          addLog('🛡️ Opponent braced!'); return
        }
        if(payload.targetId!==user.id) return
        let proj: Projectile
        if(payload.actionType==='strike') proj=createSword(payload.fromX,payload.fromY,payload.toX,payload.toY,user.id,payload.damage)
        else if(payload.actionType==='realm_heal') proj=createHealPulse(payload.fromX,payload.fromY,payload.toX,payload.toY,user.id,payload.damage)
        else proj=createRealmProjectile(payload.realm,payload.fromX,payload.fromY,payload.toX,payload.toY,user.id,payload.damage)
        // Debuffs apply on arrival (when projectile hits, handled in draw loop via effect tag)
        ;(proj as Projectile & {effect?:string}).effect=payload.effect
        // For non-damage effects, set damage=0 so only visual fires
        if(payload.effect==='defence_debuff'||payload.effect==='attack_debuff'||payload.effect==='stun'){
          proj.damage=0
          // Apply effect immediately since it's a debuff projectile
          if(payload.effect==='defence_debuff'){ const until=Date.now()+(REALM_SKILLS[payload.realm]?.debuffDuration??2)*1000; setMe(prev=>prev?{...prev,defenceDebuffMultiplier:0.75,defenceDebuffUntil:until}:prev); setTimeout(()=>setMe(prev=>prev?{...prev,defenceDebuffMultiplier:1.0}:prev),until-Date.now()); addLog('📖 Opponent weakened your Defence!') }
          if(payload.effect==='attack_debuff'){ const until=Date.now()+(REALM_SKILLS[payload.realm]?.debuffDuration??3)*1000; setMe(prev=>prev?{...prev,attackDebuffMultiplier:0.80,attackDebuffUntil:until}:prev); setTimeout(()=>setMe(prev=>prev?{...prev,attackDebuffMultiplier:1.0}:prev),until-Date.now()); addLog('⚖️ Opponent reduced your Attack!') }
          if(payload.effect==='stun'){ setMe(prev=>prev?{...prev,isStunned:true}:prev); setTimeout(()=>setMe(prev=>prev?{...prev,isStunned:false}:prev),1000); addLog('🎨 You are stunned!') }
        }
        if(payload.effect==='heal'){ setOpponent(prev=>prev?{...prev,currentHp:Math.min(prev.maxHp,prev.currentHp+payload.damage)}:prev); addLog('⚕️ Opponent healed!') }
        projectilesRef.current.push(proj)
      })
      channel.subscribe(async(status)=>{ if(status==='SUBSCRIBED') await channel.track({name:data.character?.name??'Unknown',hp,attack,defence,gold,realm}) })
    }
    const onKeyDown=(e: KeyboardEvent)=>{ keysRef.current.add(e.key); if(e.code==='Space'){e.preventDefault();handleBrace()} if(e.code==='KeyQ'){e.preventDefault();handleRealmSkill()} }
    const onKeyUp=(e: KeyboardEvent)=>keysRef.current.delete(e.key)
    const onContext=(e: MouseEvent)=>{ e.preventDefault(); handleStrike() }
    window.addEventListener('keydown',onKeyDown); window.addEventListener('keyup',onKeyUp); window.addEventListener('contextmenu',onContext)
    init()
    return ()=>{ cancelAnimationFrame(animFrameRef.current); if(channelRef.current){supabaseRef.current.removeChannel(channelRef.current);channelRef.current=null}; window.removeEventListener('keydown',onKeyDown); window.removeEventListener('keyup',onKeyUp); window.removeEventListener('contextmenu',onContext) }
  },[battleId,draw,endBattle])

  function fireProj(actionType: string, proj: Projectile, extra: Record<string,unknown>={}) {
    channelRef.current?.send({ type:'broadcast', event:'projectile', payload:{ actionType, realm, fromX:proj.originX, fromY:proj.originY, toX:proj.targetX, toY:proj.targetY, targetId:proj.targetId, damage:proj.damage, ...extra } })
  }

  function handleStrike() {
    const m=meRef.current; const opp=opponentRef.current
    if(!m||!opp||phaseRef.current!=='fighting'||m.isStunned) return
    const mp=myPosRef.current; const op=oppPosRef.current
    if(distXY(mp.x,mp.y,op.x,op.y)>MELEE_RANGE||!hasLOS(mp.x,mp.y,op.x,op.y)){addLog('⚔️ Too far!');return}
    const damage=calcDamage(m.attack*m.attackDebuffMultiplier,opp.defence*opp.defenceDebuffMultiplier,1.0,opp.isBracing)
    const proj=createSword(mp.x,mp.y,op.x,op.y,opp.userId,damage)
    projectilesRef.current.push(proj); fireProj('strike',proj); addLog('⚔️ Strike!')
  }

  function handleBrace() {
    const m=meRef.current; if(!m||phaseRef.current!=='fighting'||m.isStunned) return
    setBracingUntil(Date.now()+1000); setMe(prev=>prev?{...prev,isBracing:true}:prev)
    setTimeout(()=>setMe(prev=>prev?{...prev,isBracing:false}:prev),1000); addLog('🛡️ Braced!')
    channelRef.current?.send({type:'broadcast',event:'projectile',payload:{actionType:'brace',realm,fromX:0,fromY:0,toX:0,toY:0,targetId:opponentRef.current?.userId,damage:0}})
  }

  function handleRealmSkill() {
    const m=meRef.current; const opp=opponentRef.current
    if(!m||!opp||phaseRef.current!=='fighting'||m.isStunned) return
    const skill=REALM_SKILLS[realm]; if(!skill) return
    const cooldownMs=skill.cooldown*1000; if(Date.now()-m.realmSkillLastUsed<cooldownMs) return
    const mp=myPosRef.current; const op=oppPosRef.current
    const d=distXY(mp.x,mp.y,op.x,op.y); const los=hasLOS(mp.x,mp.y,op.x,op.y)
    const needsRange=skill.multiplier||skill.defenceDebuff||skill.attackDebuff||skill.stunChance
    if(needsRange&&(d>MELEE_RANGE||!los)){addLog(`${skill.icon} Too far!`);return}
    const now2=Date.now(); setMe(prev=>prev?{...prev,realmSkillLastUsed:now2}:prev); setRealmCooldownUntil(now2+cooldownMs)
    const ea=m.attack*m.attackDebuffMultiplier; const ed=opp.defence*opp.defenceDebuffMultiplier
    if(skill.multiplier){
      const damage=calcDamage(ea,ed,skill.multiplier,opp.isBracing)
      const proj=createRealmProjectile(realm,mp.x,mp.y,op.x,op.y,opp.userId,damage)
      const stunEffect=skill.stunChance&&Math.random()<skill.stunChance?'stun':undefined
      projectilesRef.current.push(proj); fireProj('realm_offensive',proj,stunEffect?{effect:stunEffect}:{}); addLog(`${skill.icon} ${skill.name}!`)
    }
    if(skill.healPercent){
      const healAmount=Math.round(m.maxHp*skill.healPercent)
      const proj=createHealPulse(mp.x,mp.y,mp.x,mp.y,m.userId,healAmount); proj.noDodge=true
      setMe(prev=>prev?{...prev,currentHp:Math.min(prev.maxHp,prev.currentHp+healAmount)}:prev)
      projectilesRef.current.push(proj); fireProj('realm_heal',proj,{effect:'heal'}); addLog(`${skill.icon} Healed ${healAmount}!`)
    }
    if(skill.defenceDebuff){
      const proj=createRealmProjectile(realm,mp.x,mp.y,op.x,op.y,opp.userId,0)
      const until=now2+(skill.debuffDuration??2)*1000
      setOpponent(prev=>prev?{...prev,defenceDebuffMultiplier:1-skill.defenceDebuff!,defenceDebuffUntil:until}:prev)
      setTimeout(()=>setOpponent(prev=>prev?{...prev,defenceDebuffMultiplier:1.0}:prev),skill.debuffDuration!*1000)
      projectilesRef.current.push(proj); fireProj('realm_debuff',proj,{effect:'defence_debuff'}); addLog(`${skill.icon} ${skill.name}!`)
    }
    if(skill.attackDebuff){
      const proj=createRealmProjectile(realm,mp.x,mp.y,op.x,op.y,opp.userId,0)
      const until=now2+(skill.debuffDuration??3)*1000
      setOpponent(prev=>prev?{...prev,attackDebuffMultiplier:1-skill.attackDebuff!,attackDebuffUntil:until}:prev)
      setTimeout(()=>setOpponent(prev=>prev?{...prev,attackDebuffMultiplier:1.0}:prev),skill.debuffDuration!*1000)
      projectilesRef.current.push(proj); fireProj('realm_debuff',proj,{effect:'attack_debuff'}); addLog(`${skill.icon} ${skill.name}!`)
    }
  }

  const realmCooldownLeft=Math.max(0,(realmCooldownUntil-now)/1000)
  const realmSkill=REALM_SKILLS[realm]

  function HpBar({fighter,flip=false}:{fighter:Fighter;flip?:boolean}) {
    const pct=Math.round((fighter.currentHp/fighter.maxHp)*100)
    const color=pct>50?'#1D9E75':pct>25?'#EF9F27':'#E24B4A'
    const ts=getTierStyle(fighter.maxHp+fighter.attack+fighter.defence)
    return (
      <div style={{flex:1}}>
        <div style={{display:'flex',justifyContent:flip?'flex-end':'flex-start',marginBottom:'4px',gap:'8px',alignItems:'center'}}>
          <span style={{fontFamily:'"Cinzel",serif',fontSize:'0.85rem',color:'#e8e0f0'}}>{fighter.name}</span>
          <span style={{padding:'0.1rem 0.5rem',background:ts.bg+'22',border:`1px solid ${ts.color}44`,borderRadius:'999px',fontSize:'0.55rem',color:ts.color,letterSpacing:'0.1em',textTransform:'uppercase'}}>{ts.name}</span>
        </div>
        <div style={{height:'10px',background:'rgba(155,114,207,0.1)',borderRadius:'5px',overflow:'hidden',direction:flip?'rtl':'ltr'}}>
          <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:'5px',transition:'width 0.2s ease'}}/>
        </div>
        <div style={{display:'flex',justifyContent:flip?'flex-end':'flex-start',marginTop:'3px',gap:'6px'}}>
          <span style={{fontFamily:'"Crimson Text",serif',fontSize:'0.75rem',color:'#6b5c80'}}>{fighter.currentHp.toLocaleString()} / {fighter.maxHp.toLocaleString()}</span>
          {fighter.isBracing&&<span style={{fontSize:'0.65rem',color:'#378ADD'}}>🛡️</span>}
          {fighter.isStunned&&<span style={{fontSize:'0.65rem',color:'#EF9F27'}}>⚡</span>}
        </div>
      </div>
    )
  }

  return (
    <div style={{minHeight:'100vh',background:'#0a0a0f',fontFamily:'"Cinzel",serif',color:'#e8e0f0',display:'flex',flexDirection:'column',alignItems:'center',padding:'1rem'}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital@0;1&display=swap');@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}.pulse{animation:pulse 1s ease-in-out infinite}.skill-btn{transition:all .12s;border:none;cursor:pointer}.skill-btn:active{transform:scale(.94)}.skill-btn:disabled{opacity:.35;cursor:not-allowed;transform:none}`}</style>

      {phase==='waiting'&&<div style={{textAlign:'center',marginTop:'8rem'}}><p className="pulse" style={{fontFamily:'"Crimson Text",serif',color:'#6b5c80',fontSize:'1.1rem'}}>Waiting for opponent...</p></div>}

      {(phase==='fighting'||phase==='ended')&&me&&opponent&&(
        <div style={{width:'100%',maxWidth:`${ARENA_W}px`}}>
          <div style={{display:'flex',gap:'1rem',alignItems:'flex-start',marginBottom:'0.75rem'}}>
            <HpBar fighter={me}/><div style={{fontSize:'0.8rem',color:'#4a3860',fontWeight:700,paddingTop:'6px',flexShrink:0}}>VS</div><HpBar fighter={opponent} flip/>
          </div>
          {oppDisconnected&&<div className="pulse" style={{textAlign:'center',color:'#EF9F27',fontFamily:'"Crimson Text",serif',marginBottom:'0.5rem',fontSize:'0.85rem'}}>⚠️ Opponent disconnected — forfeiting in {reconnectTimer}s...</div>}
          <div style={{position:'relative',border:'1px solid rgba(155,114,207,0.2)',borderRadius:'8px',overflow:'hidden',marginBottom:'0.75rem'}}>
            <canvas ref={canvasRef} width={ARENA_W} height={ARENA_H} style={{display:'block'}}/>
            {phase==='fighting'&&<div style={{position:'absolute',top:'10px',left:'50%',transform:'translateX(-50%)',padding:'0.2rem 0.8rem',background:inRange?'rgba(163,45,45,0.85)':'rgba(10,10,20,0.7)',border:`1px solid ${inRange?'rgba(227,75,74,0.6)':'rgba(155,114,207,0.2)'}`,borderRadius:'999px',fontSize:'0.6rem',letterSpacing:'0.15em',color:inRange?'#f09595':'#4a3860',transition:'all 0.2s'}}>{inRange?'⚔️ IN RANGE':hasLOSState?'CLOSE IN':'👁️ HIDDEN'}</div>}
            {phase==='ended'&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{textAlign:'center',padding:'2rem',background:'#0f0f1a',border:`1px solid ${winner==='you'?'rgba(30,120,80,0.5)':'rgba(163,45,45,0.5)'}`,borderRadius:'16px'}}>
                <div style={{fontSize:'2.5rem',marginBottom:'0.5rem'}}>{winner==='you'?'🏆':'💀'}</div>
                <h2 style={{margin:'0 0 0.5rem',fontSize:'1.4rem',color:winner==='you'?'#1D9E75':'#E24B4A'}}>{winner==='you'?'Victory!':'Defeated'}</h2>
                {goldDelta!==null&&<p style={{fontFamily:'"Crimson Text",serif',color:goldDelta>0?'#BA7517':'#E24B4A',fontSize:'1rem',margin:'0 0 1.5rem'}}>{goldDelta>0?`+${goldDelta}`:goldDelta} gold</p>}
                <div style={{display:'flex',gap:'0.75rem',justifyContent:'center'}}>
                  <button onClick={()=>router.push('/map')} style={{padding:'0.6rem 1.5rem',background:'rgba(155,114,207,0.2)',border:'1px solid rgba(155,114,207,0.4)',borderRadius:'8px',color:'#c8a8f0',fontFamily:'"Cinzel",serif',fontSize:'0.7rem',letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer'}}>Back to map</button>
                  <button onClick={()=>router.push('/profile')} style={{padding:'0.6rem 1.5rem',background:'transparent',border:'1px solid rgba(155,114,207,0.2)',borderRadius:'8px',color:'#6b5c80',fontFamily:'"Cinzel",serif',fontSize:'0.7rem',letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer'}}>My profile</button>
                </div>
              </div>
            </div>}
          </div>
          {phase==='fighting'&&(
            <div style={{display:'flex',gap:'0.75rem',alignItems:'stretch'}}>
              <div ref={logRef} style={{flex:1,height:'90px',overflowY:'auto',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(155,114,207,0.1)',borderRadius:'8px',padding:'0.5rem 0.75rem'}}>
                {log.length===0&&<p style={{fontFamily:'"Crimson Text",serif',color:'#3a2e50',fontSize:'0.8rem',margin:0}}>Battle log...</p>}
                {log.map((e,i)=><p key={i} style={{fontFamily:'"Crimson Text",serif',color:'#8878a0',fontSize:'0.8rem',margin:'1px 0'}}>{e}</p>)}
              </div>
              <div style={{display:'flex',gap:'0.5rem',flexShrink:0}}>
                <button className="skill-btn" onClick={handleStrike} disabled={me.isStunned||!inRange} style={{width:'72px',height:'90px',background:(me.isStunned||!inRange)?'rgba(255,255,255,0.03)':'rgba(239,159,39,0.15)',border:`1px solid ${(me.isStunned||!inRange)?'rgba(155,114,207,0.1)':'rgba(239,159,39,0.4)'}`,borderRadius:'8px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'3px'}}>
                  <div style={{fontSize:'1.3rem'}}>⚔️</div><div style={{fontFamily:'"Cinzel",serif',fontSize:'0.55rem',color:'#e8e0f0'}}>Strike</div><div style={{fontFamily:'"Crimson Text",serif',fontSize:'0.65rem',color:'#6b5c80'}}>R-click</div>
                </button>
                <button className="skill-btn" onClick={handleBrace} disabled={me.isStunned} style={{width:'72px',height:'90px',background:me.isStunned?'rgba(255,255,255,0.03)':'rgba(55,138,221,0.15)',border:`1px solid ${me.isStunned?'rgba(155,114,207,0.1)':'rgba(55,138,221,0.4)'}`,borderRadius:'8px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'3px'}}>
                  <div style={{fontSize:'1.3rem'}}>🛡️</div><div style={{fontFamily:'"Cinzel",serif',fontSize:'0.55rem',color:'#e8e0f0'}}>Brace</div><div style={{fontFamily:'"Crimson Text",serif',fontSize:'0.65rem',color:'#6b5c80'}}>Space</div>
                </button>
                <button className="skill-btn" onClick={handleRealmSkill} disabled={me.isStunned||realmCooldownLeft>0} style={{width:'72px',height:'90px',background:(me.isStunned||realmCooldownLeft>0)?'rgba(255,255,255,0.03)':'rgba(155,114,207,0.15)',border:`1px solid ${(me.isStunned||realmCooldownLeft>0)?'rgba(155,114,207,0.1)':'rgba(155,114,207,0.4)'}`,borderRadius:'8px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'3px'}}>
                  <div style={{fontSize:'1.3rem'}}>{realmSkill?.icon}</div><div style={{fontFamily:'"Cinzel",serif',fontSize:'0.55rem',color:'#e8e0f0'}}>{realmSkill?.name}</div>
                  {realmCooldownLeft>0?<div style={{fontFamily:'"Crimson Text",serif',fontSize:'0.65rem',color:'#E24B4A'}}>{realmCooldownLeft.toFixed(1)}s</div>:<div style={{fontFamily:'"Crimson Text",serif',fontSize:'0.65rem',color:'#6b5c80'}}>Q</div>}
                </button>
              </div>
            </div>
          )}
          {phase==='fighting'&&<div style={{textAlign:'center',marginTop:'0.5rem',fontFamily:'"Crimson Text",serif',color:'rgba(155,114,207,0.35)',fontSize:'0.75rem'}}>Move: WASD · Strike: Right-click · Brace: Space · Realm skill: Q · Dodge by moving!</div>}
        </div>
      )}
    </div>
  )
}
