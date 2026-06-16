// Public legal pages served straight off the Worker (no auth) so there's a real,
// stable privacy-policy URL for App Store Connect without external hosting:
//   https://match-play-api.bryan-babb1.workers.dev/privacy
const CONTACT_EMAIL = 'bryan.babb1@gmail.com';
const EFFECTIVE = 'June 15, 2026';

const PRIVACY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Foretera — Privacy Policy</title>
<style>
  :root { --ink:#1A1916; --muted:#6f6a60; --accent:#F2542D; --bg:#FAF8F4; --line:#e7e1d6; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width:760px; margin:0 auto; padding:48px 24px 80px; }
  .brand { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
  .dot { width:34px; height:34px; border-radius:9px; background:var(--accent); }
  h1 { font-size:30px; letter-spacing:-0.5px; margin:18px 0 4px; }
  h2 { font-size:19px; margin:34px 0 8px; }
  .eff { color:var(--muted); font-size:14px; margin-bottom:8px; }
  p, li { color:#2b2924; }
  a { color:var(--accent); }
  ul { padding-left:22px; }
  hr { border:none; border-top:1px solid var(--line); margin:28px 0; }
  .muted { color:var(--muted); font-size:14px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand"><div class="dot"></div><strong>Foretera</strong></div>
  <h1>Privacy Policy</h1>
  <p class="eff">Effective ${EFFECTIVE}</p>
  <p>Foretera is a head-to-head golf match-play and community app. This policy explains what
  we collect, why, and your choices. We keep it short and plain.</p>

  <h2>Who we are</h2>
  <p>Foretera is operated by an independent developer (Bryan Babb). Contact:
  <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>

  <h2>What we collect</h2>
  <ul>
    <li><strong>Account info</strong> — your email address and password are handled by our
      authentication provider (Clerk); we store your display name and (optional) profile photo.</li>
    <li><strong>Golf profile</strong> — your handicap index and home course, if you provide them.</li>
    <li><strong>Match &amp; score data</strong> — matches you post, accept, and play, and the
      hole-by-hole scores and results you enter.</li>
    <li><strong>Messages</strong> — optional in-match messages and GIFs you send to an opponent.</li>
    <li><strong>Device push token</strong> — only if you enable notifications, so we can send
      challenge and score-reminder alerts.</li>
    <li><strong>Diagnostics</strong> — basic error logs to keep the app stable.</li>
  </ul>

  <h2>How we use it</h2>
  <ul>
    <li>Create and secure your account.</li>
    <li>Match you with other golfers and run the match-play experience (scoring, results, the reveal).</li>
    <li>Send notifications you opt into.</li>
    <li>Operate, troubleshoot, and improve the app.</li>
  </ul>

  <h2>What we do <em>not</em> do</h2>
  <p>We do <strong>not</strong> sell your data, show third-party ads, or track you across other
  apps or websites for advertising. "Stakes" shown in the app are a display-only label for
  context between friends — Foretera never processes payments and no money moves through it.</p>

  <h2>Service providers</h2>
  <p>We use trusted providers solely to run the app: <strong>Clerk</strong> (authentication),
  <strong>Cloudflare</strong> (hosting &amp; database), <strong>Expo</strong> (push notifications),
  and <strong>GIPHY</strong> (GIF search inside messages). They process data only to provide
  these services.</p>

  <h2>Data retention</h2>
  <p>We keep your information while your account is active. Diagnostic logs are retained for up
  to 30 days.</p>

  <h2>Your choices &amp; account deletion</h2>
  <ul>
    <li>You can <strong>delete your account in the app</strong>: <strong>Settings → Delete account</strong>.
      This permanently removes your account and profile. Completed match results may remain, but
      your name is removed (anonymized).</li>
    <li>You can turn notifications on or off in Settings at any time.</li>
    <li>You may also email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> with any
      privacy request.</li>
  </ul>

  <h2>Children</h2>
  <p>Foretera is not directed to children under 13, and we do not knowingly collect personal
  information from them.</p>

  <h2>Security</h2>
  <p>Data is transmitted over HTTPS/TLS and stored with our managed providers. No method of
  transmission or storage is 100% secure, but we take reasonable measures to protect your data.</p>

  <h2>Changes</h2>
  <p>We may update this policy; we'll revise the effective date above when we do.</p>

  <hr>
  <p class="muted">Questions? <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
</div>
</body>
</html>`;

export function privacyPage(): Response {
  return new Response(PRIVACY_HTML, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
