'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { runShowcase, runAmbientLoop } from '@/lib/showcase'

export default function LandingPage() {
  const router = useRouter()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const [checkingAuth, setCheckingAuth] = useState(true)
  const [showCTA, setShowCTA] = useState(false)
  const [activeScene, setActiveScene] = useState(0)

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace('/map')
      } else {
        setCheckingAuth(false)
      }
    })
  }, [router])

  // ── Start ambient loop helper ───────────────────────────────────────────────
  const startAmbient = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    cleanupRef.current = runAmbientLoop(canvas)
  }, [])

  // ── Start showcase ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (checkingAuth) return

    const canvas = canvasRef.current
    if (!canvas) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    cleanupRef.current = runShowcase(canvas, {
      onSceneChange: (index) => setActiveScene(index),
      onComplete: () => {
        setShowCTA(true)
        startAmbient()
      },
    })

    // Resize handler
    function onResize() {
      const c = canvasRef.current
      if (!c) return
      c.width = window.innerWidth
      c.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [checkingAuth, startAmbient])

  // ── Skip handler ────────────────────────────────────────────────────────────
  const handleSkip = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    setShowCTA(true)
    startAmbient()
  }, [startAmbient])

  // ── Render nothing while checking auth ─────────────────────────────────────
  if (checkingAuth) return null

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Crimson+Text:ital,wght@0,400;0,600;1,400&display=swap');
      `}</style>

      {/* Canvas background */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          background: '#0a0a0f',
        }}
      />

      {/* Skip button — visible during showcase */}
      {!showCTA && (
        <button
          onClick={handleSkip}
          style={{
            position: 'fixed',
            top: '20px',
            right: '24px',
            zIndex: 10,
            padding: '8px 18px',
            background: 'rgba(0,0,0,0.55)',
            border: '1px solid rgba(196,166,90,0.5)',
            borderRadius: '6px',
            color: '#c4a65a',
            fontSize: '13px',
            fontFamily: "'Cinzel', serif",
            letterSpacing: '0.05em',
            cursor: 'pointer',
          }}
        >
          Skip
        </button>
      )}

      {/* Scene indicator dots */}
      {!showCTA && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: activeScene === i ? '#c4a65a' : 'rgba(255,255,255,0.25)',
                transition: 'background 0.3s ease',
              }}
            />
          ))}
        </div>
      )}

      {/* CTA overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          background: 'rgba(0,0,0,0.55)',
          opacity: showCTA ? 1 : 0,
          pointerEvents: showCTA ? 'auto' : 'none',
          transition: 'opacity 0.8s ease-in',
        }}
      >
        {/* Label */}
        <p
          style={{
            margin: '0 0 12px',
            fontFamily: "'Cinzel', serif",
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#c4a65a',
          }}
        >
          World Scale
        </p>

        {/* Heading */}
        <h1
          style={{
            margin: '0 0 20px',
            fontFamily: "'Cinzel', serif",
            fontSize: 'clamp(28px, 5vw, 56px)',
            fontWeight: 700,
            lineHeight: 1.15,
            textAlign: 'center',
            background: 'linear-gradient(135deg, #c4a65a 0%, #f0d890 50%, #c4a65a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Your Real-World Skills Are Your Superpower
        </h1>

        {/* Subtitle */}
        <p
          style={{
            margin: '0 0 40px',
            fontFamily: "'Crimson Text', serif",
            fontSize: 'clamp(16px, 2.2vw, 20px)',
            lineHeight: 1.6,
            textAlign: 'center',
            color: 'rgba(220,210,190,0.85)',
            maxWidth: '560px',
          }}
        >
          Turn your academic credentials, technical expertise, and professional achievements
          into a fantasy character. Compete, explore, and rise through the ranks.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <CTAButtonGold onClick={() => router.push('/auth')}>
            CREATE ACCOUNT
          </CTAButtonGold>
          <CTAButtonOutline onClick={() => router.push('/score')}>
            TRY THE SCORER
          </CTAButtonOutline>
        </div>
      </div>
    </>
  )
}

// ── Sub-components for buttons with hover state ────────────────────────────

function CTAButtonGold({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '14px 32px',
        fontFamily: "'Cinzel', serif",
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        cursor: 'pointer',
        border: 'none',
        borderRadius: '6px',
        background: 'linear-gradient(135deg, #c4a65a 0%, #f0d890 50%, #c4a65a 100%)',
        color: '#1a1200',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 6px 24px rgba(196,166,90,0.45)' : '0 2px 8px rgba(196,166,90,0.2)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {children}
    </button>
  )
}

function CTAButtonOutline({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '14px 32px',
        fontFamily: "'Cinzel', serif",
        fontSize: '13px',
        fontWeight: 700,
        letterSpacing: '0.12em',
        cursor: 'pointer',
        background: 'transparent',
        borderRadius: '6px',
        border: hovered ? '1px solid #c4a65a' : '1px solid rgba(196,166,90,0.4)',
        color: '#c4a65a',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'transform 0.15s ease, border-color 0.15s ease',
      }}
    >
      {children}
    </button>
  )
}
