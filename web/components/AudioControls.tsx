// web/components/AudioControls.tsx
'use client'

import { useState, useCallback } from 'react'
import { audioManager } from '@/lib/audioManager'

export default function AudioControls() {
  const [bgmVol, setBgmVol] = useState(() => audioManager.getBGMVolume())
  const [sfxVol, setSfxVol] = useState(() => audioManager.getSFXVolume())
  const [bgmMuted, setBgmMuted] = useState(false)
  const [sfxMuted, setSfxMuted] = useState(false)
  const [prevBgm, setPrevBgm] = useState<number | null>(null)
  const [prevSfx, setPrevSfx] = useState<number | null>(null)

  const handleBgmChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setBgmVol(v)
    setBgmMuted(v === 0)
    audioManager.setBGMVolume(v)
  }, [])

  const handleSfxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setSfxVol(v)
    setSfxMuted(v === 0)
    audioManager.setSFXVolume(v)
  }, [])

  const toggleBgmMute = useCallback(() => {
    if (bgmMuted) {
      const restore = prevBgm !== null ? prevBgm : 0.5
      setBgmVol(restore)
      setBgmMuted(false)
      audioManager.setBGMVolume(restore)
    } else {
      setPrevBgm(bgmVol)
      setBgmVol(0)
      setBgmMuted(true)
      audioManager.setBGMVolume(0)
    }
  }, [bgmMuted, bgmVol, prevBgm])

  const toggleSfxMute = useCallback(() => {
    if (sfxMuted) {
      const restore = prevSfx !== null ? prevSfx : 0.5
      setSfxVol(restore)
      setSfxMuted(false)
      audioManager.setSFXVolume(restore)
    } else {
      setPrevSfx(sfxVol)
      setSfxVol(0)
      setSfxMuted(true)
      audioManager.setSFXVolume(0)
    }
  }, [sfxMuted, sfxVol, prevSfx])

  return (
    <div style={{
      position: 'fixed',
      top: '12px',
      right: '12px',
      zIndex: 500,
      background: 'rgba(10,10,20,0.82)',
      border: '1px solid rgba(155,114,207,0.2)',
      borderRadius: '10px',
      padding: '6px 10px',
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
      fontSize: '0.65rem',
      letterSpacing: '0.08em',
      color: '#7a6a90',
    }}>
      {/* BGM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <button
          onClick={toggleBgmMute}
          title={bgmMuted ? 'Unmute BGM' : 'Mute BGM'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: bgmMuted ? '#4a3860' : '#9b72cf', fontSize: '0.75rem', padding: 0, lineHeight: 1 }}
        >
          ♪
        </button>
        <span>BGM</span>
        <input
          type="range"
          min={0} max={1} step={0.05}
          value={bgmVol}
          onChange={handleBgmChange}
          style={{ width: '60px', accentColor: '#9b72cf', cursor: 'pointer' }}
        />
      </div>
      {/* SFX */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <button
          onClick={toggleSfxMute}
          title={sfxMuted ? 'Unmute SFX' : 'Mute SFX'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: sfxMuted ? '#4a3860' : '#9b72cf', fontSize: '0.75rem', padding: 0, lineHeight: 1 }}
        >
          ◈
        </button>
        <span>SFX</span>
        <input
          type="range"
          min={0} max={1} step={0.05}
          value={sfxVol}
          onChange={handleSfxChange}
          style={{ width: '60px', accentColor: '#9b72cf', cursor: 'pointer' }}
        />
      </div>
    </div>
  )
}
