/**
 * LeaderboardService - Verwaltung der Discord Leaderboards
 *
 * Features:
 * - Automatisches Update alle 5 Minuten
 * - Nachrichten-Leaderboard (messageCount)
 * - Punkte-Leaderboard (points)
 * - Top 3 hervorgehoben mit Medaillen
 * - Progress-Balken Visualisierung
 */

const { generateProgressBar } = require('../utils/ProgressBar');
const fs = require('fs');
const path = require('path');

class LeaderboardService {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.updateInterval = null;
    this.messageIds = {
      leaderboard: null, // Message-ID für Nachrichten-Leaderboard
      punkte: null       // Message-ID für Punkte-Leaderboard
    };
    this.statePath = path.join(this.config.paths.visualizer, 'config', 'leaderboard-state.json');
  }

  /**
   * Startet automatisches Leaderboard-Update
   */
  async start() {
    console.log('[Leaderboard] Starte Service...');

    // Message-IDs aus State-Datei laden
    this._loadMessageIds();

    // Initiales Update
    await this.updateLeaderboards();

    // Update-Loop alle 5 Minuten
    this.updateInterval = setInterval(async () => {
      await this.updateLeaderboards();
    }, this.config.bot.leaderboardUpdateInterval);

    console.log('[Leaderboard] ✅ Service läuft (Update alle 5 Minuten)');
  }

  /**
   * Stoppt automatisches Update
   */
  async stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('[Leaderboard] Service gestoppt');
    }
  }

  /**
   * Aktualisiert beide Leaderboards
   */
  async updateLeaderboards() {
    try {
      const mode = await this.client.userService.modeDetector.getCurrentMode();

      if (mode !== 'api') {
        console.log('[Leaderboard] 🔴 Visualizer aus, Skip Update');
        return;
      }

      console.log('[Leaderboard] 🔄 Aktualisiere Leaderboards...');

      // Nachrichten-Leaderboard
      const messageUsers = await this._fetchAndSortUsers('messageCount');
      if (messageUsers) {
        const messageContent = this._generateMessage('messages', messageUsers);
        this.messageIds.leaderboard = await this._postOrUpdateMessage(
          this.config.bot.leaderboardChannelId,
          this.messageIds.leaderboard,
          messageContent
        );
      }

      // Punkte-Leaderboard
      const pointUsers = await this._fetchAndSortUsers('points');
      if (pointUsers) {
        const pointContent = this._generateMessage('points', pointUsers);
        this.messageIds.punkte = await this._postOrUpdateMessage(
          this.config.bot.punkteChannelId,
          this.messageIds.punkte,
          pointContent
        );
      }

      console.log('[Leaderboard] ✅ Update abgeschlossen');

    } catch (err) {
      console.error('[Leaderboard] ❌ Update-Fehler:', err);
    }
  }

  /**
   * Lädt User und sortiert nach Metrik
   * @param {string} sortBy - 'messageCount' oder 'points'
   * @returns {Array} Sortierte User mit { username, platform, value }
   */
  async _fetchAndSortUsers(sortBy) {
    try {
      const allUsers = await this.client.userService.getAllUsers();
      const excludedUsers = this.config.bot.leaderboardExcludedUsers || [];

      // In Array umwandeln, filtern und sortieren
      const userArray = Object.entries(allUsers)
        .filter(([username]) => !excludedUsers.includes(username.toLowerCase()))
        .map(([username, data]) => ({
          username,
          platform: data.platform || 'twitch',
          value: data.stats?.[sortBy] || 0
        }));

      // Sortieren (höchster Wert zuerst)
      userArray.sort((a, b) => b.value - a.value);

      // Top 15 zurückgeben
      return userArray.slice(0, 15);
    } catch (err) {
      console.error(`[Leaderboard] ❌ Fehler beim Laden der User (${sortBy}):`, err);
      return null;
    }
  }

  /**
   * Generiert Nachricht für Leaderboard
   * @param {string} type - 'messages' oder 'points'
   * @param {Array} sortedUsers - Sortierte User-Liste
   * @returns {string}
   */
  _generateMessage(type, sortedUsers) {
    const config = {
      messages: {
        title: '🏆 Die Besten Schreiberlinge 🏆',
        fieldName: 'Nachrichten'
      },
      points: {
        title: '💰 Die Reichsten 💰',
        fieldName: 'Punkte'
      }
    };

    const { title, fieldName } = config[type];
    let message = `# ${title}\n`;

    if (!sortedUsers || sortedUsers.length === 0) {
      message += '\nKeine User-Daten verfügbar.';
      return message;
    }

    const maxValue = sortedUsers[0].value;
    const medals = ['🥇', '🥈', '🥉'];

    // Top 3 mit großen Headings
    sortedUsers.slice(0, 3).forEach((user, index) => {
      const platformIcon = user.platform === 'youtube' ? '❤️' : '💜';
      const progressBar = generateProgressBar(user.value, maxValue, 10);

      message += `## ${medals[index]} ${progressBar} | ${user.value.toLocaleString('de-DE')} | ${platformIcon} ${user.username}\n`;
    });

    // Rest (Platz 4-15) kompakt
    const rest = sortedUsers.slice(3);
    if (rest.length > 0) {
      rest.forEach((user, index) => {
        const rank = index + 4;
        const platformIcon = user.platform === 'youtube' ? '❤️' : '💜';
        const progressBar = generateProgressBar(user.value, maxValue, 10);
        message += `${rank}. ${progressBar} | ${user.value.toLocaleString('de-DE')} | ${platformIcon} ${user.username}\n`;
      });
    }

    // Timestamp
    const timestamp = new Date().toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    message += `\n*Zuletzt aktualisiert: ${timestamp}*`;

    return message;
  }

  /**
   * Postet neue Nachricht oder editiert bestehende
   * @param {string} channelId - Discord Channel-ID
   * @param {string|null} messageId - Bestehende Message-ID (null = neue Message)
   * @param {string} content - Nachrichteninhalt
   * @returns {string|null} Message-ID
   */
  async _postOrUpdateMessage(channelId, messageId, content) {
    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        console.error(`[Leaderboard] ❌ Channel ${channelId} nicht gefunden oder kein Text-Channel`);
        return null;
      }

      // Versuche gespeicherte Message-ID zu nutzen
      if (messageId) {
        try {
          const message = await channel.messages.fetch(messageId);
          await message.edit({ content: content });
          console.log(`[Leaderboard] ✅ Message ${messageId} editiert`);
          this._saveMessageIds();
          return messageId;
        } catch (err) {
          console.warn(`[Leaderboard] ⚠️ Konnte Message ${messageId} nicht editieren`);
        }
      }

      // Fallback: Suche letzte Nachricht vom Bot im Channel
      try {
        const messages = await channel.messages.fetch({ limit: 20 });
        const botMessage = messages.find(msg => msg.author.id === this.client.user.id);

        if (botMessage) {
          await botMessage.edit({ content: content });
          console.log(`[Leaderboard] ✅ Gefundene Bot-Message ${botMessage.id} editiert`);
          this._saveMessageIds();
          return botMessage.id;
        }
      } catch (err) {
        console.warn(`[Leaderboard] ⚠️ Konnte keine alte Bot-Message finden`);
      }

      // Letzte Option: Neue Nachricht posten
      const message = await channel.send({ content: content });
      console.log(`[Leaderboard] ✅ Neue Message gepostet: ${message.id}`);
      this._saveMessageIds();
      return message.id;

    } catch (err) {
      console.error(`[Leaderboard] ❌ Fehler beim Message-Management:`, err);
      return null;
    }
  }

  /**
   * Lädt Message-IDs aus State-Datei
   * @private
   */
  _loadMessageIds() {
    try {
      if (fs.existsSync(this.statePath)) {
        const state = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
        this.messageIds = state.messageIds || this.messageIds;
        console.log('[Leaderboard] Message-IDs geladen:', this.messageIds);
      }
    } catch (err) {
      console.warn('[Leaderboard] ⚠️ Konnte Message-IDs nicht laden:', err.message);
    }
  }

  /**
   * Speichert Message-IDs in State-Datei
   * @private
   */
  _saveMessageIds() {
    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const state = {
        messageIds: this.messageIds,
        lastUpdate: new Date().toISOString()
      };

      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8');
      console.log('[Leaderboard] Message-IDs gespeichert');
    } catch (err) {
      console.warn('[Leaderboard] ⚠️ Konnte Message-IDs nicht speichern:', err.message);
    }
  }
}

module.exports = LeaderboardService;
