/**
 * BingoService - Kommunikation mit Stream Visualizer Bingo-API
 *
 * Features:
 * - Bingo-Status abrufen
 * - Karten generieren
 * - Events markieren
 * - Gewinne melden
 * - User-Messages tracken fuer Updates
 */

class BingoService {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.pollInterval = null;
    this.pollIntervalMs = 5000; // 5 Sekunden

    // User-Message-Tracking fuer Updates
    // userId -> { messageId, channelId, cardId, lastVerifiedEvents }
    this.userMessages = new Map();

    // Callback fuer Updates
    this.onStatusChange = null;
  }

  /**
   * Startet das Polling
   */
  startPolling(client) {
    if (this.pollInterval) return;

    console.log('[BingoService] Starte Polling (alle 5 Sekunden)');

    this.pollInterval = setInterval(async () => {
      try {
        await this.pollStatus(client);
      } catch (err) {
        console.error('[BingoService] Polling-Fehler:', err.message);
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stoppt das Polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[BingoService] Polling gestoppt');
    }
  }

  /**
   * Pollt den Bingo-Status
   */
  async pollStatus(client) {
    // Wenn keine User registriert sind, nicht pollen
    if (this.userMessages.size === 0) {
      return;
    }

    const status = await this.getStatus();

    if (!status || !status.active) {
      // Keine aktive Runde - Messages clearen und Polling pausieren
      if (this.userMessages.size > 0) {
        console.log('[BingoService] Runde beendet - User-Tracking gecleared');
        this.userMessages.clear();
      }
      return;
    }

    // Pruefen ob neue Events verifiziert wurden
    const verifiedEvents = new Set(status.verifiedEvents || []);

    // User-Karten updaten wenn noetig
    for (const [userId, userData] of this.userMessages) {
      const lastVerified = userData.lastVerifiedEvents || [];
      const newVerified = [...verifiedEvents].filter(e => !lastVerified.includes(e));

      if (newVerified.length > 0) {
        // Es gibt neue verifizierte Events - Karte updaten
        console.log(`[BingoService] Neue verifizierte Events fuer ${userId}:`, newVerified);
        await this.updateUserCard(client, userId, userData, verifiedEvents);
        userData.lastVerifiedEvents = [...verifiedEvents];
      }
    }

    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  /**
   * Updated die Bingo-Karte eines Users
   */
  async updateUserCard(client, userId, userData, verifiedEvents) {
    try {
      const user = await client.users.fetch(userId);
      const dmChannel = await user.createDM();
      const message = await dmChannel.messages.fetch(userData.messageId);

      if (!message) {
        console.log(`[BingoService] Message ${userData.messageId} nicht gefunden`);
        return;
      }

      // Karte vom API holen
      const cardData = await this.getUserCard(userData.username);
      if (!cardData) {
        console.log(`[BingoService] Keine Karte fuer ${userData.username}`);
        return;
      }

      // Nur Events anzeigen die der User markiert UND verifiziert sind
      const userMarkedEvents = cardData.markedEvents || [];
      const confirmedEvents = userMarkedEvents.filter(e => verifiedEvents.has(e));

      // Neues Bild generieren
      const imageBuffer = await client.bingoImageGenerator.generate(
        cardData.card,
        userMarkedEvents,
        confirmedEvents
      );

      // Neuen Embed erstellen mit Referenz zum neuen Bild
      const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

      const attachment = new AttachmentBuilder(imageBuffer, { name: 'bingo-card.png' });

      const newEmbed = new EmbedBuilder()
        .setColor(0x34c759)
        .setTitle('🎯 Deine Bingo-Karte')
        .setDescription('Waehle Events aus dem Menue wenn sie im Stream passieren!')
        .setImage('attachment://bingo-card.png')
        .setFooter({ text: `Karten-ID: ${userData.cardId}` })
        .setTimestamp();

      // Message editieren mit neuem Embed und Attachment
      await message.edit({
        embeds: [newEmbed],
        files: [attachment]
      });

      console.log(`[BingoService] Karte fuer ${userId} aktualisiert`);

    } catch (err) {
      console.error(`[BingoService] Update-Fehler fuer ${userId}:`, err.message);
    }
  }

  /**
   * Registriert eine User-Message fuer Updates
   */
  async registerUserMessage(userId, messageId, channelId, cardId, username) {
    this.userMessages.set(userId, {
      messageId,
      channelId,
      cardId,
      username,
      lastVerifiedEvents: []
    });
    console.log(`[BingoService] User ${userId} registriert`);
  }

  /**
   * Bingo-Status abrufen
   */
  async getStatus() {
    try {
      const response = await this.apiClient.get('/api/bingo/status');
      return response.data;
    } catch (err) {
      if (err.response?.status === 503) {
        return null; // BingoModule nicht verfuegbar
      }
      throw err;
    }
  }

  /**
   * Bingo-Karte generieren
   */
  async generateCard(username, platform = 'discord') {
    try {
      const response = await this.apiClient.post('/api/bingo/card', {
        username,
        platform
      });
      return response.data;
    } catch (err) {
      if (err.response?.data?.error) {
        return { success: false, error: err.response.data.error };
      }
      throw err;
    }
  }

  /**
   * User-Karte abrufen
   */
  async getUserCard(username) {
    try {
      const response = await this.apiClient.get(`/api/bingo/user-card/${username}`);
      return response.data;
    } catch (err) {
      if (err.response?.status === 404) {
        return null; // Keine Karte fuer User
      }
      throw err;
    }
  }

  /**
   * Event als passiert markieren
   */
  async markEvent(username, eventId) {
    try {
      const response = await this.apiClient.post('/api/bingo/mark', {
        username,
        eventId
      });
      return response.data;
    } catch (err) {
      if (err.response?.data?.error) {
        return { success: false, error: err.response.data.error };
      }
      throw err;
    }
  }

  /**
   * Gewinn melden
   */
  async reportWin(username, platform) {
    try {
      const response = await this.apiClient.post('/api/bingo/win', {
        username,
        platform
      });
      return response.data;
    } catch (err) {
      if (err.response?.data?.error) {
        return { success: false, error: err.response.data.error };
      }
      throw err;
    }
  }
}

module.exports = BingoService;
