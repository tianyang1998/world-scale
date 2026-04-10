export default function CreditsPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#e8e0f0',
      fontFamily: '"Georgia", serif',
      padding: '4rem 2rem',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Crimson+Text:ital@0;1&display=swap');
        .prose h1 { font-family: 'Cinzel', serif; font-size: 1.8rem; font-weight: 600; color: #c4a65a; margin: 0 0 0.5rem; letter-spacing: 0.08em; }
        .prose h2 { font-family: 'Cinzel', serif; font-size: 1rem; font-weight: 600; color: #9b72cf; letter-spacing: 0.12em; text-transform: uppercase; margin: 2.5rem 0 0.75rem; }
        .prose p, .prose li { font-family: 'Crimson Text', serif; font-size: 1.1rem; line-height: 1.75; color: #c8b8e0; margin: 0 0 0.75rem; }
        .prose ul { padding-left: 1.5rem; margin: 0 0 0.75rem; }
        .prose a { color: #9b72cf; text-decoration: underline; }
        .prose .revised { font-family: 'Crimson Text', serif; font-size: 0.9rem; color: #4a3860; margin: 0.25rem 0 3rem; }
        .prose .track { font-family: 'Crimson Text', serif; font-size: 1.05rem; color: #c8b8e0; margin: 0 0 1.25rem; }
        .prose .track strong { color: #e8e0f0; }
        .prose .track .meta { font-size: 0.9rem; color: #6b5c80; display: block; margin-top: 0.15rem; }
      `}</style>

      <div className="prose" style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h1>Credits</h1>
        <p className="revised">World Scale — Open Game Art Attribution</p>

        <h2>Background Music</h2>
        <p>
          All music used in World Scale is licensed under{' '}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer">CC0 (Public Domain)</a>.
          We are grateful to the following artists for sharing their work freely.
        </p>

        <div className="track">
          <strong>&ldquo;Summers&rdquo;</strong> by symphony
          <span className="meta">Used on: Landing page &nbsp;&bull;&nbsp; License: CC0</span>
          <span className="meta">
            <a href="https://soundcloud.com/symphony" target="_blank" rel="noopener noreferrer">soundcloud.com/symphony</a>
          </span>
        </div>

        <div className="track">
          <strong>&ldquo;Fairy Lights&rdquo;</strong> by troubadour
          <span className="meta">Used on: World Map &nbsp;&bull;&nbsp; License: CC0</span>
          <span className="meta">Source: opengameart.org</span>
        </div>

        <div className="track">
          <strong>&ldquo;Cosmic Priest&rdquo;</strong> by Centurion_of_war
          <span className="meta">Used on: PvP Battle &nbsp;&bull;&nbsp; License: CC0</span>
          <span className="meta">Source: opengameart.org</span>
        </div>

        <div className="track">
          <strong>&ldquo;Carnage Boss Battle 6 Mix&rdquo;</strong> by glitchart
          <span className="meta">Used on: PvE Boss Raid &nbsp;&bull;&nbsp; License: CC0</span>
          <span className="meta">Source: opengameart.org &nbsp;&bull;&nbsp; This track is a mix of:</span>
          <span className="meta" style={{ paddingLeft: '1rem' }}>
            &ldquo;Carnage&rdquo; by Centurion of war &mdash;{' '}
            <a href="https://opengameart.org/content/carnage-incarnate" target="_blank" rel="noopener noreferrer">opengameart.org/content/carnage-incarnate</a>
          </span>
          <span className="meta" style={{ paddingLeft: '1rem' }}>
            &ldquo;Boss Battle 6 (8 bit)&rdquo; by nene &mdash;{' '}
            <a href="https://opengameart.org/content/boss-battle-6-8-bit" target="_blank" rel="noopener noreferrer">opengameart.org/content/boss-battle-6-8-bit</a>
          </span>
          <span className="meta" style={{ paddingLeft: '1rem' }}>
            &ldquo;Boss Battle 8 Retro 01 Loop&rdquo; by nene &mdash;{' '}
            <a href="https://opengameart.org/content/boss-battle-8-retro" target="_blank" rel="noopener noreferrer">opengameart.org/content/boss-battle-8-retro</a>
          </span>
        </div>

        <div className="track">
          <strong>&ldquo;Interstellar Fleet 1&rdquo;</strong> by Zane Little Music
          <span className="meta">Used on: Victory screen &nbsp;&bull;&nbsp; License: CC0</span>
          <span className="meta">Source: opengameart.org</span>
        </div>

        <div className="track">
          <strong>&ldquo;Game Over Theme (No Hope)&rdquo;</strong> by Cleyton Kauffman
          <span className="meta">Used on: Defeat screen &nbsp;&bull;&nbsp; License: CC0</span>
          <span className="meta">
            <a href="https://soundcloud.com/cleytonkauffman" target="_blank" rel="noopener noreferrer">soundcloud.com/cleytonkauffman</a>
          </span>
        </div>

        <h2>Sound Effects</h2>
        <p>
          All sound effects in World Scale are synthesized programmatically using the Web Audio API.
          No third-party sound effect files are used.
        </p>

        <h2>Back</h2>
        <p>
          <a href="/">Return to World Scale</a>
        </p>
      </div>
    </div>
  )
}