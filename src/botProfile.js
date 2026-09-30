/**
 * Bot-Profil: unterscheidet den Betrieb bei Aaronius ("playground") von der
 * Auslieferung an Zappify-Kunden ("customer").
 *
 * Gesetzt via env ZAPPIFY_BOT_PROFILE (Zappify uebergibt das beim spawn).
 *
 * customer:
 *  - keine Aaronius-eigenen Services (Docs/Feature/Changelog/Meme-Showcase/Forum/
 *    BugFix/AssetSync) und keine Commands /docs, /sync-assets
 *  - kein direkter users.db-Zugriff (better-sqlite3) - alles ueber die Zappify-API;
 *    ist Zappify aus, sind DB-abhaengige Features (Leaderboard, Autocomplete)
 *    voruebergehend eingeschraenkt
 *  - Bad-Word-Alerts (BadWordAlertPoller) laufen dagegen in BEIDEN Profilen -
 *    generischer Mechanismus, nur an wenn ein Alert-Channel konfiguriert ist
 *    (siehe index.js). Ebenso /meme-submit und /wolpertinger-submit (Community-
 *    Einreichungen ueber die Bild-Freigabe, nicht zu verwechseln mit den
 *    Aaronius-eigenen Showcase-Services MemeSyncService/AssetSyncService).
 */

const PROFILE = process.env.ZAPPIFY_BOT_PROFILE === 'customer' ? 'customer' : 'playground';

module.exports = {
  PROFILE,
  isCustomer: PROFILE === 'customer',
  isPlayground: PROFILE !== 'customer',
};
