/**
 * UserService - Dual-Mode User-Verwaltung
 *
 * Modi:
 * - API-Mode: Nutzt Stream Visualizer API (wenn Visualizer läuft)
 * - Standalone-Mode: Direkter File-Access (wenn Visualizer aus)
 *
 * Automatische Modus-Erkennung via ModeDetector
 */

const fs = require('fs');
const path = require('path');
const ModeDetector = require('./ModeDetector');
const AssetManager = require('./AssetManager');
const ImageGenerator = require('./ImageGenerator');
const PendingWriteQueue = require('../utils/pendingWriteQueue');
const botProfile = require('../botProfile');

class UserService {
  constructor(apiClient, config) {
    this.apiClient = apiClient;
    this.config = config;
    this.modeDetector = new ModeDetector(apiClient);
    this.assetManager = new AssetManager(config.paths.assets);
    this.imageGenerator = new ImageGenerator(apiClient);

    // SQLite Verbindung (lazy init bei erstem Zugriff) — IMMER read-only
    this._db = null;

    // Schreib-Queue für Zappify (wenn App aus ist)
    this.pendingWrites = new PendingWriteQueue(config.paths.pendingWrites);
  }

  _getDb() {
    // Kunden-Modus: kein direkter DB-Zugriff (better-sqlite3 ist im Bundle nicht
    // enthalten). Alles laeuft ueber die Zappify-API; ist Zappify aus, gibt es
    // diese Info voruebergehend nicht.
    if (botProfile.isCustomer) {
      throw new Error('Diese Info ist nur verfuegbar, solange Zappify laeuft.');
    }
    if (!this._db) {
      const dbPath = this.config.paths.usersDb;
      if (!fs.existsSync(dbPath)) {
        throw new Error(`users.db nicht gefunden: ${dbPath} — wurde Zappify schon einmal gestartet?`);
      }
      // NUR lesend. Schreibvorgänge laufen über die API bzw. PendingWriteQueue.
      // read-only ist WAL-safe: beliebig viele Leser parallel zu Zappifys Writer.
      const Database = require('better-sqlite3');
      this._db = new Database(dbPath, { readonly: true, fileMustExist: true });
      this._db.pragma('busy_timeout = 5000');
    }
    return this._db;
  }

  _rowToUser(row) {
    if (!row) return null;
    return {
      platform: row.platform || null,
      userId: row.user_id || null,
      character: row.character ? JSON.parse(row.character) : null,
      customAvatar: {
        enabled: !!row.custom_avatar_enabled,
        filename: row.custom_avatar_filename || null
      },
      stats: {
        ttsCount: row.tts_count,
        donationCount: row.donation_count,
        totalDonated: row.total_donated,
        subCount: row.sub_count,
        messageCount: row.message_count,
        points: row.points,
        level: row.level,
        totalXP: row.total_xp,
        lastLevelUp: row.last_level_up || null,
        lastChatActivity: row.last_chat_activity || null,
        lastCharacterReset: row.last_character_reset || null,
        lastCharacterCustomization: row.last_character_customization || null,
        monthsSub: row.months_sub,
        streamsAttended: row.streams_attended,
        firstWordToday: row.first_word_today || null,
        roles: row.roles ? JSON.parse(row.roles) : [],
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
      }
    };
  }

  /**
   * Initialisiert den Service
   */
  async init() {
    console.log('[UserService] Initialisiere Service...');

    // Initiale Modus-Erkennung
    await this.modeDetector.detectMode();

    // Assets laden (für Standalone-Mode)
    try {
      this.assetManager.loadAssets();
    } catch (err) {
      console.error('[UserService] ⚠️ Fehler beim Laden der Assets:', err.message);
    }

    console.log('[UserService] ✅ Initialisierung abgeschlossen');
  }

  /**
   * Gibt alle verfügbaren Assets zurück
   * @returns {Promise<object>}
   */
  async getAssets() {
    const mode = await this.modeDetector.getCurrentMode();

    if (mode === 'api') {
      // API-Mode: Nutze API
      console.log('[UserService] 🟢 Lade Assets via API');
      return await this.apiClient.getAssets();
    } else {
      // Standalone-Mode: Direkter File-Access
      console.log('[UserService] 🔴 Lade Assets aus Files');
      return this.assetManager.getAssets();
    }
  }

  /**
   * Gibt User-Daten zurück
   * @param {string} username
   * @returns {Promise<object>}
   */
  async getUser(username) {
    const mode = await this.modeDetector.getCurrentMode();

    if (mode === 'api') {
      // API-Mode: Nutze API
      console.log(`[UserService] 🟢 Lade User "${username}" via API`);
      return await this.apiClient.getUser(username);
    } else {
      // Standalone-Mode: Direkter File-Access
      console.log(`[UserService] 🔴 Lade User "${username}" aus File`);
      return this._getUserFromFile(username);
    }
  }

  /**
   * Gibt alle User zurück
   * @returns {Promise<object>} Alle User aus users.json
   */
  async getAllUsers() {
    const mode = await this.modeDetector.getCurrentMode();

    if (mode === 'api') {
      console.log('[UserService] 🟢 Lade alle User via API');
      try {
        return await this.apiClient.getAllUsers();
      } catch (err) {
        // Fallback auf File-Access wenn API-Endpoint fehlt
        console.warn('[UserService] ⚠️ API-Endpoint fehlt, Fallback auf File-Access');
        return this._getAllUsersFromFile();
      }
    } else {
      console.log('[UserService] 🔴 Lade alle User aus File');
      return this._getAllUsersFromFile();
    }
  }

  /**
   * Erstellt Verifizierungs-Code für Charakter-Anpassung
   * @param {string} username
   * @param {object} customization
   * @returns {Promise<object>} { success, code, expiresAt }
   */
  async createVerificationCode(username, customization) {
    const mode = await this.modeDetector.getCurrentMode();

    if (mode === 'api') {
      // API-Mode: Nutze API
      console.log(`[UserService] 🟢 Erstelle Code via API für "${username}"`);
      return await this.apiClient.createVerificationCode(username, customization);
    } else {
      // Standalone-Mode: In pending-verifications.json schreiben
      console.log(`[UserService] 🔴 Erstelle Code (Standalone) für "${username}"`);
      return this._createPendingVerification(username, customization);
    }
  }

  /**
   * Prüft ob User Charakter anpassen kann (Cooldown-Check)
   * @param {string} username
   * @returns {Promise<object>} { canPerform, remainingTime, remainingHours }
   */
  async canCustomizeCharacter(username) {
    try {
      const user = await this.getUser(username);
      const dayInMs = 24 * 60 * 60 * 1000;
      const lastCustomization = user.stats.lastCharacterCustomization || 0;
      const timeSinceCustomization = Date.now() - lastCustomization;
      const remainingTime = Math.max(0, dayInMs - timeSinceCustomization);

      return {
        canPerform: remainingTime === 0,
        remainingTime: remainingTime,
        remainingHours: Math.ceil(remainingTime / 1000 / 60 / 60)
      };
    } catch (err) {
      // User existiert nicht → kann anpassen
      return {
        canPerform: true,
        remainingTime: 0,
        remainingHours: 0
      };
    }
  }

  // ========== PRIVATE METHODS (STANDALONE-MODE) ==========

  /**
   * Liest User aus SQLite DB — gibt Default zurück wenn nicht gefunden
   * @private
   */
  _getUserFromFile(username) {
    const norm = username.toLowerCase();
    const db = this._getDb();
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(norm);
    if (!row) {
      // User noch nicht im Visualizer aktiv — leeres Profil
      return {
        platform: null,
        userId: null,
        character: null,
        customAvatar: { enabled: false, filename: null },
        stats: {
          ttsCount: 0, donationCount: 0, totalDonated: 0, subCount: 0,
          messageCount: 0, points: 0, level: 0, totalXP: 0,
          lastLevelUp: null, lastChatActivity: null, monthsSub: 0,
          streamsAttended: 0, roles: [], firstSeen: null, lastSeen: null
        }
      };
    }
    return this._rowToUser(row);
  }

  /**
   * Liest alle User aus SQLite DB (als Object, key = username)
   * @private
   */
  _getAllUsersFromFile() {
    const db = this._getDb();
    const rows = db.prepare('SELECT * FROM users').all();
    const out = {};
    for (const row of rows) {
      out[row.username] = this._rowToUser(row);
    }
    return out;
  }

  /**
   * Erstellt pending Verifikation (Standalone-Mode)
   * @private
   */
  _createPendingVerification(username, customization) {
    const normalizedUsername = username.toLowerCase();

    // Cooldown-Check
    try {
      const user = this._getUserFromFile(normalizedUsername);
      const dayInMs = 24 * 60 * 60 * 1000;
      const lastCustomization = user.stats.lastCharacterCustomization || 0;
      const timeSinceCustomization = Date.now() - lastCustomization;

      if (timeSinceCustomization < dayInMs) {
        const remainingTime = dayInMs - timeSinceCustomization;
        const remainingHours = Math.ceil(remainingTime / 1000 / 60 / 60);
        throw new Error(`Cooldown aktiv! Du kannst deinen Wolpertinger erst in ${remainingHours} Stunde(n) anpassen.`);
      }
    } catch (err) {
      // User existiert nicht → Neuer User, kein Cooldown
      if (!err.message.includes('nicht gefunden')) {
        throw err; // Cooldown-Error weiterwerfen
      }
    }

    // Assets validieren
    for (const [category, assetName] of Object.entries(customization)) {
      if (assetName === 'random') continue;

      if (!this.assetManager.validateAsset(category, assetName)) {
        throw new Error(`Asset "${assetName}" in Kategorie "${category}" nicht gefunden!`);
      }
    }

    // Code generieren
    const code = this._generateCode();
    const now = Date.now();
    const expiresAt = now + 604800000; // 7 Tage (1 Woche)

    // Pending Verifications laden (oder erstellen)
    let pending = {};
    if (fs.existsSync(this.config.paths.pendingVerifications)) {
      try {
        pending = JSON.parse(fs.readFileSync(this.config.paths.pendingVerifications, 'utf8'));
      } catch (err) {
        console.error('[UserService] ⚠️ Fehler beim Lesen von pending-verifications.json:', err);
        pending = {};
      }
    }

    // Neue Verifikation hinzufügen
    pending[code] = {
      code,
      username: normalizedUsername,
      customizationData: customization,
      createdAt: now,
      expiresAt: expiresAt,
      createdBy: 'discord-bot'
    };

    // In Datei schreiben
    try {
      const dir = path.dirname(this.config.paths.pendingVerifications);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.config.paths.pendingVerifications,
        JSON.stringify(pending, null, 2),
        'utf8'
      );

      console.log(`[UserService] ✅ Pending Verification erstellt: ${code} | User: ${normalizedUsername}`);

      return {
        success: true,
        code: code,
        expiresAt: expiresAt
      };
    } catch (err) {
      console.error('[UserService] ❌ Fehler beim Schreiben von pending-verifications.json:', err);
      throw new Error('Konnte Verifizierungs-Code nicht erstellen.');
    }
  }

  /**
   * Generiert 6-stelligen Code
   * @private
   */
  _generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // ========== CUSTOM AVATAR METHODS ==========

  /**
   * Prüft ob User Custom-Avatar hochladen kann (7-Tage-Cooldown)
   * @param {string} username
   * @returns {Promise<object>} { canPerform, remainingTime, remainingDays }
   */
  async canUploadCustomAvatar(username) {
    try {
      const cooldownMs = this.config.customAvatar.cooldownDays * 24 * 60 * 60 * 1000;
      // Cooldown wird bot-lokal geführt (Anti-Spam, unabhängig von Zappify).
      // Fallback: user.stats.lastCustomAvatarUpload (falls Zappify das je liefert).
      let lastUpload = this._readAvatarCooldown(username);
      if (!lastUpload) {
        try {
          const user = await this.getUser(username);
          lastUpload = user.stats?.lastCustomAvatarUpload || 0;
        } catch { /* User unbekannt -> kein Cooldown */ }
      }
      const timeSinceUpload = Date.now() - lastUpload;
      const remainingTime = Math.max(0, cooldownMs - timeSinceUpload);

      return {
        canPerform: remainingTime === 0,
        remainingTime: remainingTime,
        remainingDays: Math.ceil(remainingTime / 1000 / 60 / 60 / 24)
      };
    } catch (err) {
      // User existiert nicht → kann hochladen
      return {
        canPerform: true,
        remainingTime: 0,
        remainingDays: 0
      };
    }
  }

  /**
   * Erstellt Custom-Avatar Verification
   * @param {string} username
   * @param {string} discordUserId
   * @param {string} tempFilePath - Relativer Pfad zur temp-Datei
   * @returns {Promise<object>} { success, code, expiresAt }
   */
  async createCustomAvatarVerification(username, discordUserId, tempFilePath) {
    const normalizedUsername = username.toLowerCase();
    const code = this._generateCode();
    const now = Date.now();
    const expiresAt = now + 604800000; // 7 Tage

    // Pending Verifications laden
    let pending = {};
    if (fs.existsSync(this.config.paths.pendingVerifications)) {
      try {
        pending = JSON.parse(fs.readFileSync(this.config.paths.pendingVerifications, 'utf8'));
      } catch (err) {
        console.error('[UserService] Fehler beim Lesen von pending-verifications.json:', err);
        pending = {};
      }
    }

    // Neue Verifikation hinzufügen
    pending[code] = {
      code,
      username: normalizedUsername,
      type: 'custom-avatar',
      tempFilePath: tempFilePath,
      discordUserId: discordUserId,
      discordMessageId: null, // Wird später gesetzt
      createdAt: now,
      expiresAt: expiresAt,
      createdBy: 'discord-bot',
      status: 'pending'
    };

    // Speichern
    try {
      const dir = path.dirname(this.config.paths.pendingVerifications);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(
        this.config.paths.pendingVerifications,
        JSON.stringify(pending, null, 2),
        'utf8'
      );

      console.log(`[UserService] Custom-Avatar Verification erstellt: ${code} | User: ${normalizedUsername}`);

      return {
        success: true,
        code: code,
        expiresAt: expiresAt
      };
    } catch (err) {
      console.error('[UserService] Fehler beim Schreiben:', err);
      throw new Error('Konnte Verifizierungs-Code nicht erstellen.');
    }
  }

  /**
   * Aktualisiert die Discord-Message-ID für eine Verification
   * @param {string} code
   * @param {string} messageId
   */
  updateVerificationMessageId(code, messageId) {
    if (!fs.existsSync(this.config.paths.pendingVerifications)) {
      return;
    }

    try {
      const pending = JSON.parse(fs.readFileSync(this.config.paths.pendingVerifications, 'utf8'));
      if (pending[code]) {
        pending[code].discordMessageId = messageId;
        fs.writeFileSync(
          this.config.paths.pendingVerifications,
          JSON.stringify(pending, null, 2),
          'utf8'
        );
        console.log(`[UserService] Message-ID für ${code} aktualisiert: ${messageId}`);
      }
    } catch (err) {
      console.error('[UserService] Fehler beim Aktualisieren der Message-ID:', err);
    }
  }

  /**
   * Findet Custom-Avatar Verification anhand der Discord-Message-ID
   * @param {string} messageId
   * @returns {object|null}
   */
  getCustomAvatarByMessageId(messageId) {
    if (!fs.existsSync(this.config.paths.pendingVerifications)) {
      return null;
    }

    try {
      const pending = JSON.parse(fs.readFileSync(this.config.paths.pendingVerifications, 'utf8'));

      for (const [code, verification] of Object.entries(pending)) {
        if (verification.type === 'custom-avatar' && verification.discordMessageId === messageId) {
          return verification;
        }
      }

      return null;
    } catch (err) {
      console.error('[UserService] Fehler beim Suchen nach Message-ID:', err);
      return null;
    }
  }

  /**
   * Setzt Approval-Status für Custom-Avatar
   * @param {string} code
   * @param {boolean} approved
   * @returns {object} { success, verification }
   */
  setCustomAvatarApprovalStatus(code, approved) {
    if (!fs.existsSync(this.config.paths.pendingVerifications)) {
      return { success: false, error: 'Keine pending verifications gefunden' };
    }

    try {
      const pending = JSON.parse(fs.readFileSync(this.config.paths.pendingVerifications, 'utf8'));

      if (!pending[code]) {
        return { success: false, error: 'Code nicht gefunden' };
      }

      const verification = pending[code];
      verification.status = approved ? 'approved' : 'rejected';
      verification.processedAt = Date.now();

      // Bei Genehmigung: Cooldown setzen
      if (approved) {
        this._updateCustomAvatarCooldown(verification.username);
      }

      // Speichern
      fs.writeFileSync(
        this.config.paths.pendingVerifications,
        JSON.stringify(pending, null, 2),
        'utf8'
      );

      console.log(`[UserService] Custom-Avatar ${code} ${approved ? 'genehmigt' : 'abgelehnt'}`);

      return { success: true, verification };
    } catch (err) {
      console.error('[UserService] Fehler beim Setzen des Status:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Liest den bot-lokalen Custom-Avatar-Cooldown (epoch ms) für einen User.
   * @private
   * @param {string} username
   * @returns {number} epoch ms des letzten Uploads, 0 wenn keiner
   */
  _readAvatarCooldown(username) {
    try {
      const data = JSON.parse(fs.readFileSync(this.config.paths.avatarCooldowns, 'utf8'));
      return data[username.toLowerCase()] || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Setzt den Custom-Avatar-Cooldown bot-lokal (Anti-Spam).
   * Bewusst NICHT in users.db — der Bot schreibt die DB nie.
   * @private
   * @param {string} username
   */
  _updateCustomAvatarCooldown(username) {
    const norm = username.toLowerCase();
    const p = this.config.paths.avatarCooldowns;
    try {
      let data = {};
      try { data = JSON.parse(fs.readFileSync(p, 'utf8')) || {}; } catch { /* Neuanlage */ }
      data[norm] = Date.now();
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[UserService] Custom-Avatar-Cooldown für ${norm} gesetzt (bot-lokal)`);
    } catch (err) {
      console.error('[UserService] Fehler beim Setzen des Cooldowns:', err);
    }
  }

  /**
   * Gibt Modus-Statistiken zurück
   * @returns {object}
   */
  getStats() {
    return this.modeDetector.getStats();
  }

  /**
   * Gibt den ImageGenerator zurück
   * @returns {ImageGenerator}
   */
  getImageGenerator() {
    return this.imageGenerator;
  }

  /**
   * Gibt den AssetManager zurück
   * @returns {AssetManager}
   */
  getAssetManager() {
    return this.assetManager;
  }
}

module.exports = UserService;
