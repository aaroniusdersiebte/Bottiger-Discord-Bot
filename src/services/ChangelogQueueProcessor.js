/**
 * ChangelogQueueProcessor
 *
 * Pollt changelog-queue.json alle 10 Sekunden und postet Changelogs in Discord
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

class ChangelogQueueProcessor {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.queuePath = path.join(__dirname, '../../config/changelog-queue.json');
    this.interval = null;
    this.isProcessing = false;

    console.log('[ChangelogQueueProcessor] Initialisiert');
  }

  /**
   * Startet Polling (alle 10 Sekunden)
   */
  start() {
    if (this.interval) {
      console.log('[ChangelogQueueProcessor] ⚠️ Polling läuft bereits');
      return;
    }

    // Sofort einmal ausführen
    this.processQueue();

    // Dann alle 10 Sekunden
    this.interval = setInterval(() => {
      this.processQueue();
    }, 10000); // 10 Sekunden

    console.log('[ChangelogQueueProcessor] ✅ Polling gestartet (alle 10 Sekunden)');
  }

  /**
   * Stoppt Polling
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[ChangelogQueueProcessor] ⏹️ Polling gestoppt');
    }
  }

  /**
   * Verarbeitet Queue
   */
  async processQueue() {
    // Verhindere parallele Ausführung
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Queue-File laden
      if (!fs.existsSync(this.queuePath)) {
        console.log('[ChangelogQueueProcessor] ℹ️ Queue-File existiert nicht, erstelle leere Queue');
        this._saveQueue({ queue: [], lastUpdate: new Date().toISOString() });
        this.isProcessing = false;
        return;
      }

      const queueData = JSON.parse(fs.readFileSync(this.queuePath, 'utf8'));
      const pendingItems = queueData.queue.filter(item => item.status === 'pending');

      if (pendingItems.length === 0) {
        this.isProcessing = false;
        return;
      }

      console.log(`[ChangelogQueueProcessor] 🔄 Verarbeite ${pendingItems.length} Changelog(s)...`);

      // Verarbeite alle pending Items
      for (const item of pendingItems) {
        await this.processItem(item, queueData);
      }

      this.isProcessing = false;

    } catch (err) {
      console.error('[ChangelogQueueProcessor] ❌ Fehler beim Verarbeiten der Queue:', err);
      this.isProcessing = false;
    }
  }

  /**
   * Verarbeitet einzelnes Queue-Item
   */
  async processItem(item, queueData) {
    try {
      console.log(`[ChangelogQueueProcessor] 📝 Verarbeite Changelog: ${item.data.title}`);

      // Status auf "processing" setzen
      item.status = 'processing';
      this._saveQueue(queueData);

      // Changelog-Thread abrufen (Forum-Thread)
      const threadId = this.config.docsForum?.changelogThreadId || this.config.channels?.changelog;

      if (!threadId) {
        throw new Error('Changelog-Thread nicht konfiguriert (DOCS_CHANGELOG_THREAD_ID in .env fehlt)');
      }

      const channel = await this.client.channels.fetch(threadId);

      if (!channel || !channel.isTextBased()) {
        throw new Error(`Thread ${threadId} nicht gefunden oder kein Text-Channel`);
      }

      // Embed erstellen
      const embed = new EmbedBuilder()
        .setTitle(item.data.title)
        .setDescription(item.data.content)
        .setColor('#57F287') // Discord Green
        .setTimestamp()
        .setFooter({ text: 'Changelog' });

      // Bilder verarbeiten (falls vorhanden)
      const attachments = [];
      if (item.data.images && item.data.images.length > 0) {
        for (let i = 0; i < item.data.images.length; i++) {
          const image = item.data.images[i];

          // Base64 zu Buffer konvertieren
          const buffer = Buffer.from(image.data, 'base64');

          // AttachmentBuilder erstellen
          const attachment = new AttachmentBuilder(buffer, { name: image.filename });
          attachments.push(attachment);

          // Erstes Bild als Embed-Image setzen
          if (i === 0) {
            embed.setImage(`attachment://${image.filename}`);
          }
        }
      }

      // Message posten
      const message = await channel.send({
        embeds: [embed],
        files: attachments
      });

      // Status auf "completed" setzen
      item.status = 'completed';
      item.result = {
        messageId: message.id,
        messageUrl: message.url,
        error: null
      };

      this._saveQueue(queueData);

      console.log(`[ChangelogQueueProcessor] ✅ Changelog gepostet: ${message.url}`);

    } catch (err) {
      console.error(`[ChangelogQueueProcessor] ❌ Fehler beim Posten von Changelog "${item.data.title}":`, err);

      // Status auf "failed" setzen
      item.status = 'failed';
      item.result = {
        messageId: null,
        messageUrl: null,
        error: err.message
      };

      this._saveQueue(queueData);
    }
  }

  /**
   * Speichert Queue
   */
  _saveQueue(queueData) {
    try {
      const configDir = path.dirname(this.queuePath);

      // Config-Ordner erstellen falls nicht vorhanden
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      queueData.lastUpdate = new Date().toISOString();

      fs.writeFileSync(this.queuePath, JSON.stringify(queueData, null, 2), 'utf8');
    } catch (err) {
      console.error('[ChangelogQueueProcessor] ❌ Fehler beim Speichern der Queue:', err);
    }
  }
}

module.exports = ChangelogQueueProcessor;
