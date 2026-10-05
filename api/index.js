// Vercel serverless entry: every /api request is handled by the Express app.
// The first request on a fresh database (or one holding older demo data)
// loads the demo data.
let starting = null;

async function start() {
  const { createApp } = await import('../server/src/app.js');
  const { ready } = await import('../server/src/db.js');
  const { ensureDemoData } = await import('../server/src/seed.js');
  await ready();
  await ensureDemoData();
  return createApp();
}

export default async function handler(req, res) {
  let app;
  try {
    app = await (starting ??= start());
  } catch (e) {
    starting = null;
    console.error('CivicPulse failed to start', e);
    const message = /JWT_SECRET/.test(e.message)
      ? 'The server is missing JWT_SECRET. Add it in the Vercel project settings and redeploy.'
      : 'The server could not reach its database. Check DATABASE_URL in the Vercel project settings.';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message, code: 'SERVER_ERROR' }));
    return;
  }
  app(req, res);
}
