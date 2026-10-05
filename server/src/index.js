import { openDb } from './db.js';
import { createApp } from './app.js';
import { sweepExpired } from './services/verification.js';
import { ensureDemoData } from './seed.js';

await openDb();
// First run (or older demo data): load the MSMO demo data. About half a minute.
await ensureDemoData();

const PORT = Number(process.env.PORT || 4000);
createApp().listen(PORT, () => {
  console.log(`CivicPulse API listening on http://localhost:${PORT}`);
});

// Close verification windows that have run out (FR-62, FR-63).
setInterval(() => {
  sweepExpired().catch((e) => console.error('verification sweep failed', e));
}, 60 * 1000);
