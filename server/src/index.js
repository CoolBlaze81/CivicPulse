import { openDb, getDb } from './db.js';
import { createApp } from './app.js';
import { sweepExpired } from './services/verification.js';
import { seedDatabase } from './seed.js';

await openDb();
// First run: fill the database with the MSMO demo data.
if ((await getDb().prepare('SELECT COUNT(*) n FROM "user"').get()).n === 0) {
  console.log('Empty database, loading demo data (takes a few seconds)...');
  await seedDatabase();
}

const PORT = Number(process.env.PORT || 4000);
createApp().listen(PORT, () => {
  console.log(`CivicPulse API listening on http://localhost:${PORT}`);
});

// Close verification windows that have run out (FR-62, FR-63).
setInterval(() => {
  sweepExpired().catch((e) => console.error('verification sweep failed', e));
}, 60 * 1000);
