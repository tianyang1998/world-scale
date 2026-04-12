export default function PrivacyPage() {
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
      `}</style>

      <div className="prose" style={{ maxWidth: '700px', margin: '0 auto' }}>
        <h1>Privacy Policy</h1>
        <p className="revised">Last Revised: April 12, 2026</p>

        <h2>1. Introduction</h2>
        <p>
          World Scale (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a browser-based multiplayer RPG where your
          real-world professional credentials determine your character&rsquo;s power. This policy explains what data we
          collect, how we use it, and your rights over it. For any privacy-related questions, contact us at{' '}
          <a href="mailto:privacy@worldscalegame.com">privacy@worldscalegame.com</a>.
        </p>

        <h2>2. What We Collect</h2>
        <ul>
          <li><strong>Email address</strong> — provided when you create an account.</li>
          <li>
            <strong>Professional credentials</strong> — the data you enter to score your character (e.g. h-index,
            GitHub statistics, years of practice, publications, notable cases). This data is voluntary and
            entered by you.
          </li>
          <li>
            <strong>Character data</strong> — your character name, realm, tier, gold, stats, and equipped
            cosmetics, generated from your credentials.
          </li>
          <li>
            <strong>Technical data</strong> — our hosting and database providers (Supabase, Vercel) may
            automatically collect technical information such as IP addresses, browser user agent strings, and
            request timestamps as part of normal infrastructure operation. We do not intentionally collect or
            use this data ourselves.
          </li>
        </ul>

        <h2>3. How We Use Your Data</h2>
        <ul>
          <li>To authenticate you and maintain your session.</li>
          <li>To calculate your character&rsquo;s power score from your credentials.</li>
          <li>To run multiplayer features: world map presence, PvP battles, and PvE raids.</li>
          <li>To display your rank on the public leaderboard.</li>
        </ul>
        <p>We do not use your data for advertising, and we do not sell your data to any third party. We also do not &ldquo;share&rdquo; your data with third parties for cross-context behavioral advertising as defined under the California Consumer Privacy Act (CCPA) and similar state laws. Your credentials and character data are processed solely by Supabase and Vercel as described in &sect;4, for the purpose of operating the game.</p>

        <h2>4. Third-Party Services</h2>
        <ul>
          <li>
            <strong>Supabase</strong> — provides authentication and database storage. Data may be stored in EU
            or US data centers.{' '}
            <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase Privacy Policy</a>.
          </li>
          <li>
            <strong>Vercel</strong> — provides hosting and edge function execution.{' '}
            <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel Privacy Policy</a>.
          </li>
        </ul>
        <p>No other third-party services have access to your personal data.</p>

        <h2>5. Data Retention</h2>
        <p>
          Your account and character data is retained until you delete your account. Upon deletion, your data
          is permanently removed from our database. Infrastructure logs held by Supabase and Vercel may be
          retained subject to their own policies.
        </p>

        <h2>6. Your Rights</h2>
        <p>Regardless of where you are located, you have the following rights:</p>
        <ul>
          <li><strong>Access</strong> — request a copy of the data we hold about you by emailing <a href="mailto:privacy@worldscalegame.com">privacy@worldscalegame.com</a>.</li>
          <li><strong>Correction</strong> — update your professional credentials at any time via the Score page.</li>
          <li><strong>Deletion</strong> — permanently delete your account and all associated data using the &ldquo;Delete Account&rdquo; button on your Profile page.</li>
          <li><strong>Portability</strong> — request your data in a portable format by emailing <a href="mailto:privacy@worldscalegame.com">privacy@worldscalegame.com</a>.</li>
          <li><strong>Opt-Out Signals (GPC)</strong> — We honor Global Privacy Control (GPC) browser signals as a valid opt-out of data sharing for advertising or cross-context behavioral tracking. Because we do not engage in such sharing, a GPC signal has no practical effect on how we process your data &mdash; but we recognize and respect it as required by California, Colorado, Connecticut, and other applicable state laws effective January 1, 2026.</li>
        </ul>

        <h2>7. Children &amp; Sensitive Data</h2>
        <p>
          World Scale is intended for working professionals and is not designed for users under the age of 16.
          We do not knowingly collect personal data from anyone under 16. If you believe a minor has provided
          us with their data, please contact us at{' '}
          <a href="mailto:privacy@worldscalegame.com">privacy@worldscalegame.com</a> and we will delete it promptly.
        </p>
        <p>
          The professional credentials you enter (such as publication counts, GitHub statistics, or years of
          practice) are not &ldquo;sensitive personal data&rdquo; as defined under the General Data Protection
          Regulation (GDPR) or CCPA. Sensitive categories under those laws include health records, biometric
          data, racial or ethnic origin, financial account details, and similar categories. Aggregate
          professional metrics do not fall within these categories.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. When we do, we will update the &ldquo;Last Revised&rdquo; date at
          the top of this page. Your continued use of World Scale after any change constitutes acceptance of
          the updated policy.
        </p>

        <h2>9. Contact</h2>
        <p>
          For any privacy-related questions or requests:{' '}
          <a href="mailto:privacy@worldscalegame.com">privacy@worldscalegame.com</a>
        </p>
      </div>
    </div>
  )
}
