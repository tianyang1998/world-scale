// web/lib/audioManager.ts

export type BGMTrack = 'landing' | 'map' | 'pvp' | 'pve' | 'win' | 'lose'
export type SFXKey = 'playerAttack' | 'hit' | 'dodge' | 'bossAttack' | 'victory' | 'defeat'

const BGM_LOOP: Record<BGMTrack, boolean> = {
  landing: true,
  map: true,
  pvp: true,
  pve: true,
  win: false,
  lose: false,
}

const FADE_DURATION = 1.0 // seconds

class AudioManager {
  private audioCtx: AudioContext | null = null
  private bgmEl: HTMLAudioElement | null = null
  private bgmGain: GainNode | null = null
  private currentTrack: BGMTrack | null = null
  private bgmFadeTimeout: ReturnType<typeof setTimeout> | null = null
  private bgmVolume: number
  private sfxVolume: number
  private unlockHandlerAdded = false

  constructor() {
    this.bgmVolume = parseFloat(
      typeof window !== 'undefined'
        ? (localStorage.getItem('ws_bgm_volume') ?? '0.5')
        : '0.5'
    )
    this.sfxVolume = parseFloat(
      typeof window !== 'undefined'
        ? (localStorage.getItem('ws_sfx_volume') ?? '0.5')
        : '0.5'
    )
  }

  private addUnlockListener(): void {
    if (this.unlockHandlerAdded) return
    this.unlockHandlerAdded = true
    const unlock = () => {
      if (this.audioCtx?.state === 'suspended') {
        this.audioCtx.resume().then(() => {
          // Try to play BGM if a track is pending
          if (this.bgmEl && this.bgmEl.paused && this.currentTrack) {
            this.bgmEl.play().catch(() => {})
          }
        })
      }
      window.removeEventListener('click', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('click', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', unlock)
  }

  private getCtx(): AudioContext {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      this.addUnlockListener()
    }
    // Resume if suspended (browser autoplay policy)
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume()
    }
    return this.audioCtx
  }

  private ensureBGM(): { el: HTMLAudioElement; gain: GainNode } {
    if (this.bgmEl && this.bgmGain) {
      return { el: this.bgmEl, gain: this.bgmGain }
    }
    const ctx = this.getCtx()
    const el = new Audio()
    el.crossOrigin = 'anonymous'
    const source = ctx.createMediaElementSource(el)
    const gain = ctx.createGain()
    gain.gain.value = this.bgmVolume
    source.connect(gain)
    gain.connect(ctx.destination)
    this.bgmEl = el
    this.bgmGain = gain
    return { el: this.bgmEl, gain: this.bgmGain }
  }

  playBGM(track: BGMTrack): void {
    if (this.currentTrack === track) return
    this.currentTrack = track  // set immediately so rapid calls are guarded

    if (this.bgmFadeTimeout !== null) {
      clearTimeout(this.bgmFadeTimeout)
      this.bgmFadeTimeout = null
    }

    const ctx = this.getCtx()
    const { el, gain } = this.ensureBGM()
    const now = ctx.currentTime
    gain.gain.cancelScheduledValues(now)
    gain.gain.setValueAtTime(gain.gain.value, now)
    gain.gain.linearRampToValueAtTime(0, now + FADE_DURATION)

    this.bgmFadeTimeout = setTimeout(() => {
      this.bgmFadeTimeout = null
      el.pause()
      el.src = `/audio/bgm/${track}.mp3`
      el.loop = BGM_LOOP[track]
      el.play().catch(() => {})
      const resumeNow = ctx.currentTime
      gain.gain.cancelScheduledValues(resumeNow)
      gain.gain.setValueAtTime(0, resumeNow)
      gain.gain.linearRampToValueAtTime(this.bgmVolume, resumeNow + FADE_DURATION)
    }, FADE_DURATION * 1000)
  }

  stopBGM(): void {
    if (!this.bgmEl || !this.bgmGain) return
    this.currentTrack = null  // set immediately

    if (this.bgmFadeTimeout !== null) {
      clearTimeout(this.bgmFadeTimeout)
      this.bgmFadeTimeout = null
    }

    const ctx = this.getCtx()
    const now = ctx.currentTime
    this.bgmGain.gain.cancelScheduledValues(now)
    this.bgmGain.gain.setValueAtTime(this.bgmGain.gain.value, now)
    this.bgmGain.gain.linearRampToValueAtTime(0, now + FADE_DURATION)
    this.bgmFadeTimeout = setTimeout(() => {
      this.bgmFadeTimeout = null
      this.bgmEl?.pause()
    }, FADE_DURATION * 1000)
  }

  setBGMVolume(value: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, value))
    if (this.bgmGain) {
      const ctx = this.getCtx()
      this.bgmGain.gain.cancelScheduledValues(ctx.currentTime)
      this.bgmGain.gain.setValueAtTime(this.bgmVolume, ctx.currentTime)
    }
    if (this.bgmVolume === 0 && this.bgmFadeTimeout !== null) {
      clearTimeout(this.bgmFadeTimeout)
      this.bgmFadeTimeout = null
      // Reset currentTrack so re-enabling volume re-triggers the track
      this.currentTrack = null
    }
    localStorage.setItem('ws_bgm_volume', String(this.bgmVolume))
  }

  setSFXVolume(value: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, value))
    localStorage.setItem('ws_sfx_volume', String(this.sfxVolume))
  }

  getBGMVolume(): number { return this.bgmVolume }
  getSFXVolume(): number { return this.sfxVolume }

  playSFX(sfx: SFXKey): void {
    if (this.sfxVolume === 0) return
    const ctx = this.getCtx()
    const vol = this.sfxVolume

    switch (sfx) {
      case 'playerAttack': {
        // Short high-pitched frequency sweep up
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(400, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.12)
        gain.gain.setValueAtTime(vol * 0.4, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(); osc.stop(ctx.currentTime + 0.15)
        break
      }
      case 'hit': {
        // Noise burst + low thud
        const bufferSize = Math.floor(ctx.sampleRate * 0.08)
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
        const noise = ctx.createBufferSource()
        noise.buffer = buffer
        const noiseGain = ctx.createGain()
        noiseGain.gain.setValueAtTime(vol * 0.5, ctx.currentTime)
        noiseGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08)
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 1200
        noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(ctx.destination)
        noise.start()
        // Low thud
        const thud = ctx.createOscillator()
        const thudGain = ctx.createGain()
        thud.type = 'sine'
        thud.frequency.setValueAtTime(120, ctx.currentTime)
        thud.frequency.linearRampToValueAtTime(40, ctx.currentTime + 0.1)
        thudGain.gain.setValueAtTime(vol * 0.6, ctx.currentTime)
        thudGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12)
        thud.connect(thudGain); thudGain.connect(ctx.destination)
        thud.start(); thud.stop(ctx.currentTime + 0.12)
        break
      }
      case 'dodge': {
        // Quick ascending blip
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.setValueAtTime(300, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.08)
        gain.gain.setValueAtTime(vol * 0.25, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(); osc.stop(ctx.currentTime + 0.1)
        break
      }
      case 'bossAttack': {
        // Deep low-frequency rumble sweep
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(80, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(30, ctx.currentTime + 0.3)
        gain.gain.setValueAtTime(vol * 0.5, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(); osc.stop(ctx.currentTime + 0.35)
        break
      }
      case 'victory': {
        // Ascending arpeggio: C5 E5 G5 C6
        const notes = [523.25, 659.25, 783.99, 1046.50]
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          const t = ctx.currentTime + i * 0.12
          gain.gain.setValueAtTime(0, t)
          gain.gain.linearRampToValueAtTime(vol * 0.4, t + 0.03)
          gain.gain.linearRampToValueAtTime(0, t + 0.2)
          osc.connect(gain); gain.connect(ctx.destination)
          osc.start(t); osc.stop(t + 0.22)
        })
        break
      }
      case 'defeat': {
        // Descending tone drop
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(440, ctx.currentTime)
        osc.frequency.linearRampToValueAtTime(110, ctx.currentTime + 0.6)
        gain.gain.setValueAtTime(vol * 0.4, ctx.currentTime)
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.65)
        osc.connect(gain); gain.connect(ctx.destination)
        osc.start(); osc.stop(ctx.currentTime + 0.65)
        break
      }
    }
  }
}

export const audioManager = new AudioManager()
