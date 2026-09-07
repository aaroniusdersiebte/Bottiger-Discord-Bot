/**
 * Bot-Profil: unterscheidet den Betrieb bei Aaronius ("playground") von der
 * Auslieferung an Zappify-Kunden ("customer").
 *
 * Gesetzt via env ZAPPIFY_BOT_PROFILE (Zappify uebergibt das beim spawn).
 *
 * customer:
 *  - keine Aaronius-eigenen Services (Docs/Feature/Changelog/Meme/Forum/BugFix/
 *    Badword/AlertServer) und keine Commands /docs, /sync-assets
 *  - kein direkter users.db-Zugriff (better-sqlite3) - alles ueber die Zappify-API;
 *    ist Zappify aus, sind DB-abhaengige Features (Leaderboard, Autocomplete)
 *    voruebergehend eingeschraenkt
 */

const PROFILE = process.env.ZAPPIFY_BOT_PROFILE === 'customer' ? 'customer' : 'playground';

module.exports = {
  PROFILE,
  isCustomer: PROFILE === 'customer',
  isPlayground: PROFILE !== 'customer',
};
