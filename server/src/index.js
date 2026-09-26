import { openDb, getDb } from './db.js';
import { createApp } from './app.js';
import { sweepExpired } from './services/verification.js';
import { seed } from './seed.js';

openDb();
// First run: fill the database with the MSMO demo data.
if (getDb().prepare('SELECT COUNT(*) n FROM user').get().n === 0) {
  console.log('Empty database, loading demo data...');
  seed();
}

const PORT = Number(process.env.PORT || 4000);
createApp().listen(PORT, () => {
  console.log(`CivicPulse API listening on http://localhost:${PORT}`);
});

// Close verification windows that have run out (FR-62, FR-63).
setInterval(() => {
  try {
    sweepExpired();
  } catch (e) {
    console.error('verification sweep failed', e);
  }
}, 60 * 1000);
