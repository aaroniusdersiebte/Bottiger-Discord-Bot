/**
 * AccountLinkService - Discord↔Twitch Account-Verknüpfung
 *
 * Verwaltet:
 * - discord-links.json: { discordId → twitchUsername }
 * - discord-users.json: { discordId → { points } } (für unverknüpfte User)
 * - pending-discord-links.json: { CODE → { discordId, twitchName, expiresAt } }
 *
 * Punkte-Routing:
 * - Verknüpft: users.json[twitchUsername].stats.points
 * - Unverknüpft: discord-users.json[discordId].points
 */

const fs = require('fs');
const path = require('path');

class AccountLinkService {
  constructor(config) {
    this.config = config;
    this._ensureFiles();
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
      try {
        const users = this._readUsersJson();
        const lower = twitchUsername.toLowerCase();
        if (users[lower]) {
          if (!users[lower].stats) users[lower].stats = {};
          users[lower].stats.points = safePoints;
          this._writeUsersJson(users);
          return;
        }
      } catch { /* fall through */ }
    }

    const discordUsers = this._read(this.config.paths.discordUsers);
    if (!discordUsers[discordId]) discordUsers[discordId] = { points: 0 };
    discordUsers[discordId].points = safePoints;
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

    this.setPoints(winnerId, winnerPoints + actual);
    this.setPoints(loserId, loserPoints - actual);

    return {
      success: true,
      actualAmount: actual,
      winnerNewPoints: winnerPoints + actual,
      loserNewPoints: loserPoints - actual
    };
  }

  // ========== PRIVATE ==========

  _readUsersJson() {
    if (!fs.existsSync(this.config.paths.usersJson)) {
      throw new Error('users.json nicht gefunden');
    }
    return JSON.parse(fs.readFileSync(this.config.paths.usersJson, 'utf8'));
  }

  _writeUsersJson(data) {
    fs.writeFileSync(this.config.paths.usersJson, JSON.stringify(data, null, 2), 'utf8');
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
