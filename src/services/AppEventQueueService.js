/**
 * AppEventQueueService - Rückkanal von Zappify zum Bot.
 *
 * Zappify schreibt Freigabe-/Ablehn-Ereignisse der App-seitigen Bild-Freigabe in
 * config.paths.pendingBotNotifications:
 *   { version:1, entries:[ { id, type, discordUserId, username, imageType, code, reason, createdAt } ] }
 *   type: 'image.approved' | 'image.rejected'
 *
 * Der Bot stellt sie dem Nutzer per DM zu und entfernt verarbeitete Einträge.
 */

const fs = require('fs');
const path = require('path');

const POLL_MS = 15 * 1000;
const MAX_ATTEMPTS = 5;
const BINGO_INVITE = '🎲 **Eine Bingo-Runde laeuft!** Hol dir deine Karte mit `/bingo start`.';

class AppEventQueueService {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.filePath = config.paths.pendingBotNotifications;
    this._timer = null;
    this._running = false;
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), POLL_MS);
    console.log('[AppEventQueue] ✅ Rückkanal aktiv');
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async _tick() {
    if (this._running) return;
    this._running = true;
    try {
      await this._process();
    } catch (err) {
      console.warn('[AppEventQueue] Fehler:', err.message);
    } finally {
      this._running = false;
    }
  }

  _read() {
    if (!fs.existsSync(this.filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return data && Array.isArray(data.entries) ? data : null;
    } catch {
      return null;
    }
  }

  _write(data) {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.warn('[AppEventQueue] Konnte Queue nicht zurückschreiben:', err.message);
    }
  }

  async _process() {
    const data = this._read();
    if (!data || data.entries.length === 0) return;

    const keep = [];
    for (const entry of data.entries) {
      const done = await this._deliver(entry);
      if (!done) {
        entry._attempts = (entry._attempts || 0) + 1;
        if (entry._attempts < MAX_ATTEMPTS) keep.push(entry);
        else console.warn(`[AppEventQueue] Eintrag ${entry.id} nach ${MAX_ATTEMPTS} Versuchen verworfen`);
      }
    }
    this._write({ version: 1, entries: keep });
  }

  /**
   * Broadcast "Runde gestartet" an alle per /link verknuepften User + Polling anwerfen.
   * Best effort: immer als erledigt behandelt (kein Retry-Spam).
   * @returns {Promise<boolean>}
   */
  async _deliverBingoRoundStarted() {
    try { this.client.bingoService?.startPolling(this.client); } catch { /* egal */ }

    let links = {};
    try {
      const p = this.config.paths.discordLinks;
      if (p && fs.existsSync(p)) links = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
    } catch { links = {}; }

    const ids = Object.keys(links);
    if (ids.length === 0) return true;

    for (const discordId of ids) {
      try {
        const user = await this.client.users.fetch(discordId);
        await user.send(BINGO_INVITE);
      } catch (err) {
        if (err.code !== 50007) {
          console.warn(`[AppEventQueue] Bingo-Einladung an ${discordId} fehlgeschlagen: ${err.message}`);
        }
      }
    }
    console.log(`[AppEventQueue] Bingo-Einladung an ${ids.length} verknuepfte User verschickt`);
    return true;
  }

  /** @returns {Promise<boolean>} true = erledigt (auch bei "User nicht erreichbar") */
  async _deliver(entry) {
    if (!entry) return true;

    // Bingo-Rueckkanal (Broadcast an verknuepfte User bzw. Lifecycle)
    if (entry.type === 'bingo.round-started') return this._deliverBingoRoundStarted();
    if (entry.type === 'bingo.round-ended') {
      try { this.client.bingoService?.stopAndClear(); } catch { /* egal */ }
      return true;
    }

    if (!entry.discordUserId) return true;
    let text;
    if (entry.type === 'image.approved') {
      const isAvatar = entry.imageType === 'custom-avatar';
      text = isAvatar
        ? `**✅ Dein Custom-Avatar wurde freigegeben!**\n\n`
          + (entry.code ? `Falls dein Avatar noch nicht aktiv ist, schreibe im Twitch/YouTube-Chat:\n\`!verify ${entry.code}\`` : 'Dein Avatar ist jetzt aktiv.')
        : `**✅ Dein Bild wurde freigegeben** und erscheint im Stream.`;
    } else if (entry.type === 'image.rejected') {
      text = `**❌ Dein Bild wurde leider abgelehnt.**`
        + (entry.reason ? `\n\nGrund: ${entry.reason}` : '')
        + `\n\nDu kannst es später erneut versuchen.`;
    } else {
      return true; // unbekannter Typ -> nicht ewig behalten
    }

    try {
      const user = await this.client.users.fetch(entry.discordUserId);
      await user.send(text);
      console.log(`[AppEventQueue] DM an ${user.tag}: ${entry.type}`);
      return true;
    } catch (err) {
      // DMs zu (50007) o.ä. -> als erledigt behandeln, nicht endlos retryen
      if (err.code === 50007) {
        console.warn(`[AppEventQueue] ${entry.discordUserId} hat DMs deaktiviert - übersprungen`);
        return true;
      }
      console.warn(`[AppEventQueue] DM fehlgeschlagen (${entry.discordUserId}): ${err.message}`);
      return false;
    }
  }
}

module.exports = AppEventQueueService;
