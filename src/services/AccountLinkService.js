/**
 * AccountLinkService - Discord↔Twitch Account-Verknüpfung
 *
 * Verwaltet:
 * - discord-links.json: { discordId → twitchUsername }
 * - discord-users.json: { discordId → { points } } (für unverknüpfte User)
 * - pending-discord-links.json: { CODE → { discordId, twitchName, expiresAt } }
 *
 * Punkte-Routing:
 * - Verknüpft: users.db (read-only gelesen; Writes via PendingWriteQueue -> Zappify)
 * - Unverknüpft: discord-users.json[discordId].points (bot-eigene Datei)
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const PendingWriteQueue = require('../utils/pendingWriteQueue');

class AccountLinkService {
  constructor(config) {
    this.config = config;
    this._db = null;
    this.pendingWrites = new PendingWriteQueue(config.paths.pendingWrites);
    this._ensureFiles();
  }

  _getDb() {
    if (!this._db) {
      const dbPath = this.config.paths.usersDb;
      if (!fs.existsSync(dbPath)) return null;
      // NUR lesend — Punkte-Writes für verknüpfte User laufen über die Queue.
      this._db = new Database(dbPath, { readonly: true, fileMustExist: true });
      this._db.pragma('busy_timeout = 5000');
    }
    return this._db;
  }

  _ensureFiles() {
    const files = [
      this.config.paths.discordLinks,
      this.config.paths.discordUsers,
      this.config.paths.pendingDiscordLinks
    ];
    for (const p of files) {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(p)) fs.writeFileSync(p, '{}', 'utf8');
    }
  }

  _read(filePath) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
  }

  _write(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  // ========== LINK STATUS ==========

  isLinked(discordId) {
    return this.getTwitchUsername(discordId) !== null;
  }

  getTwitchUsername(discordId) {
    const links = this._read(this.config.paths.discordLinks);
    return links[discordId] || null;
  }

  getDiscordId(twitchUsername) {
    const links = this._read(this.config.paths.discordLinks);
    const lower = twitchUsername.toLowerCase();
    for (const [did, twitch] of Object.entries(links)) {
      if (twitch.toLowerCase() === lower) return did;
    }
    return null;
  }

  // ========== PENDING LINKS ==========

  createPendingLink(discordId) {
    const pending = this._read(this.config.paths.pendingDiscordLinks);

    // Alte pending links für diesen User entfernen
    for (const code of Object.keys(pending)) {
      if (pending[code].discordId === discordId) delete pending[code];
    }

    const code = this._generateCode();
    const now = Date.now();
    const expiresAt = now + 10 * 60 * 1000; // 10 Minuten

    pending[code] = { code, discordId, createdAt: now, expiresAt };
    this._write(this.config.paths.pendingDiscordLinks, pending);

    return { code, expiresAt };
  }

  // ========== PUNKTE ==========

  getPoints(discordId) {
    const twitchUsername = this.getTwitchUsername(discordId);
    if (twitchUsername) {
      try {
        const users = this._readUsersJson();
        return users[twitchUsername.toLowerCase()]?.stats?.points || 0;
      } catch { /* fall through */ }
    }
    const discordUsers = this._read(this.config.paths.discordUsers);
    return discordUsers[discordId]?.points || 0;
  }

  setPoints(discordId, points) {
    const safePoints = Math.max(0, Math.round(points));
    const twitchUsername = this.getTwitchUsername(discordId);

    if (twitchUsername) {
      // Verknüpfter User -> Punkte leben in users.db, die nur Zappify schreibt.
      // Absolut-Set einreihen; DiscordSyncService übernimmt.
      this.pendingWrites.enqueue('points.set', {
        username: twitchUsername.toLowerCase(),
        points: safePoints
      });
      return;
    }

    const discordUsers = this._read(this.config.paths.discordUsers);
    if (!discordUsers[discordId]) discordUsers[discordId] = { points: 0 };
    discordUsers[discordId].points = safePoints;
    this._write(this.config.paths.discordUsers, discordUsers);
  }

  /**
   * Ändert Punkte um einen Delta-Wert (race-sicher — kein stale Absolutwert).
   * @param {string} discordId
   * @param {number} delta  positiv oder negativ
   */
  adjustPoints(discordId, delta) {
    const d = Math.round(delta);
    if (d === 0) return;
    const twitchUsername = this.getTwitchUsername(discordId);

    if (twitchUsername) {
      this.pendingWrites.enqueue('points.add', {
        username: twitchUsername.toLowerCase(),
        delta: d
      });
      return;
    }

    const discordUsers = this._read(this.config.paths.discordUsers);
    if (!discordUsers[discordId]) discordUsers[discordId] = { points: 0 };
    discordUsers[discordId].points = Math.max(0, (discordUsers[discordId].points || 0) + d);
    this._write(this.config.paths.discordUsers, discordUsers);
  }

  hasEnoughPoints(discordId, amount) {
    return this.getPoints(discordId) >= amount;
  }

  /**
   * Transferiert Punkte vom Verlierer zum Gewinner
   * @returns {{ success, actualAmount, winnerNewPoints, loserNewPoints }}
   */
  transferPoints(winnerId, loserId, amount) {
    const winnerPoints = this.getPoints(winnerId);
    const loserPoints = this.getPoints(loserId);
    const actual = Math.min(amount, loserPoints);

    // Delta-basiert (race-sicher, falls Zappify gerade aus ist)
    this.adjustPoints(winnerId, actual);
    this.adjustPoints(loserId, -actual);

    return {
      success: true,
      actualAmount: actual,
      winnerNewPoints: winnerPoints + actual,
      loserNewPoints: loserPoints - actual
    };
  }

  // ========== PRIVATE ==========

  _readUsersJson() {
    const db = this._getDb();
    if (!db) throw new Error('users.db nicht gefunden');
    const rows = db.prepare('SELECT username, points FROM users').all();
    const out = {};
    for (const row of rows) {
      out[row.username] = { stats: { points: row.points } };
    }
    return out;
  }

  _generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }
}

module.exports = AccountLinkService;
