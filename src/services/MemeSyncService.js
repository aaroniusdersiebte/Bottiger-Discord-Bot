/**
 * MemeSyncService - Synchronisiert Meme-Assets mit Discord Text-Channel
 *
 * Features:
 * - Hash-basiertes Polling (alle 5 Min) erkennt Änderungen im Meme-Ordner
 * - Postet neue Memes, löscht Nachrichten für entfernte Memes
 * - Erste User-Nachricht im Channel bleibt erhalten
 * - Changelog-Eintrag bei neuen Memes
 * - Natural Sort für korrekte Reihenfolge
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const naturalSort = require('../utils/naturalSort');

const SEPARATOR = '──────────────────────────────────────────────────────────';

class MemeSyncService {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.interval = null;
    this.isProcessing = false;
    this.statePath = path.join(__dirname, '../../config/meme-sync-state.json');
    this.queuePath = path.join(__dirname, '../../config/changelog-queue.json');
    this.pollingInterval = config.memeSync?.pollingInterval || 300000; // 5 Min
    this.channelId = config.memeSync?.channelId;
    this.memePath = config.memeSync?.path;

    console.log('[MemeSync] Initialisiert');
  }

  // ========== POLLING ==========

  start() {
    if (!this.channelId || !this.memePath) {
      console.log('[MemeSync] ⚠️ Nicht konfiguriert (channelId oder path fehlt)');
      return;
    }

    if (this.interval) {
      console.log('[MemeSync] ⚠️ Polling läuft bereits');
      return;
    }

    // Sofort einmal prüfen
    this.checkAndSync();

    this.interval = setInterval(() => {
      this.checkAndSync();
    }, this.pollingInterval);

    console.log(`[MemeSync] ✅ Polling gestartet (alle ${this.pollingInterval / 1000}s)`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[MemeSync] ⏹️ Polling gestoppt');
    }
  }

  /**
   * Hash-basierte Prüfung: Nur syncen wenn sich Dateien geändert haben
   */
  async checkAndSync() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      if (!this.channelId || !this.memePath) return;

      if (!fs.existsSync(this.memePath)) {
        console.log(`[MemeSync] ⚠️ Meme-Ordner nicht gefunden: ${this.memePath}`);
        return;
      }

      const savedState = this._loadState();
      const savedHash = savedState.hash || '';
      const currentHash = this._hashDirectory(this.memePath);

      if (savedHash === currentHash) return;

      console.log('[MemeSync] 🔄 Änderungen erkannt');

      const result = await this.syncMemes();
      if (result.error) {
        console.error(`[MemeSync] ${result.error}`);
        return;
      }

      console.log(`[MemeSync] +${result.added} / -${result.removed}`);

      // Changelog-Eintrag schreiben
      if (result.added > 0) {
        this._writeChangelog(result.newMemes);
      }

      // State speichern
      this._saveState({ hash: currentHash });

    } catch (err) {
      console.error('[MemeSync] ❌ Polling-Fehler:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  // ========== SYNC ==========

  /**
   * Synchronisiert Memes mit dem Channel
   */
  async syncMemes() {
    // 1. Filesystem-Memes laden (natural sort)
    const files = fs.readdirSync(this.memePath)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .sort(naturalSort);

    const fileNames = new Map();
    for (const f of files) {
      fileNames.set(path.parse(f).name, f);
    }

    // 2. Channel-Messages laden
    const channel = await this.client.channels.fetch(this.channelId);
    if (!channel) {
      return { error: `Channel nicht gefunden: ${this.channelId}` };
    }

    const messages = await this.fetchAllMessages(channel);

    // 3. Erste User-Nachricht finden (nicht vom Bot)
    const firstUserMessage = this._findFirstUserMessage(messages);

    // 4. Gepostete Memes erkennen (name -> messages)
    const postedMemes = new Map();
    for (const msg of messages) {
      // Erste User-Nachricht überspringen
      if (firstUserMessage && msg.id === firstUserMessage.id) continue;
      // Nur Bot-Nachrichten betrachten
      if (msg.author.id !== this.client.user.id) continue;

      const name = this.extractMemeName(msg);
      if (!name) continue;

      if (!postedMemes.has(name)) {
        postedMemes.set(name, []);
      }
      postedMemes.get(name).push(msg);
    }

    // 5. Neue Memes finden (im Filesystem, nicht gepostet)
    const newMemes = [];
    for (const [name, filename] of fileNames) {
      if (!postedMemes.has(name)) {
        newMemes.push(filename);
      }
    }

    // 6. Gelöschte Memes finden (gepostet, nicht im Filesystem)
    const deletedMessages = [];
    const removedNames = [];
    for (const [name, msgs] of postedMemes) {
      if (!fileNames.has(name)) {
        deletedMessages.push(...msgs);
        removedNames.push(name);
      }
    }

    // 7. Neue Memes posten (natural sort Reihenfolge)
    for (const filename of newMemes) {
      const name = path.parse(filename).name;
      const filePath = path.join(this.memePath, filename);

      await channel.send({
        content: `${SEPARATOR}\n${name}`,
        files: [{ attachment: filePath, name: filename }]
      });
    }

    // 8. Gelöschte Memes entfernen
    let deletedCount = 0;
    for (const msg of deletedMessages) {
      try {
        await msg.delete();
        deletedCount++;
      } catch (err) {
        console.error(`[MemeSync] Nachricht ${msg.id} konnte nicht gelöscht werden:`, err.message);
      }
    }

    return {
      total: files.length,
      posted: postedMemes.size,
      added: newMemes.length,
      removed: deletedCount,
      newMemes: newMemes.map(f => path.parse(f).name),
      removedMemes: removedNames
    };
  }

  // ========== HELPERS ==========

  /**
   * Findet die erste Nachricht die nicht vom Bot ist
   */
  _findFirstUserMessage(messages) {
    // Messages sind nach Zeit sortiert (neueste zuerst), also umkehren
    const sorted = [...messages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    return sorted.find(msg => msg.author.id !== this.client.user.id) || null;
  }

  /**
   * Extrahiert Meme-Name aus einer Nachricht
   */
  extractMemeName(msg) {
    if (!msg.content) return null;

    const hasImage = msg.attachments.some(a =>
      a.contentType?.startsWith('image/') ||
      /\.(png|jpg|jpeg|gif|webp)$/i.test(a.name || '')
    );
    if (!hasImage) return null;

    // Alle nicht-leeren Zeilen durchgehen, erste Nicht-Separator-Zeile ist der Name
    const lines = msg.content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines) {
      if (/^[-─═]+$/.test(line)) continue;
      return line;
    }

    return null;
  }

  /**
   * Lädt alle Nachrichten aus einem Channel (paginiert)
   */
  async fetchAllMessages(channel) {
    const allMessages = [];
    let lastId = null;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;

      allMessages.push(...messages.values());
      lastId = messages.last().id;

      if (messages.size < 100) break;
    }

    return allMessages;
  }

  // ========== STATE & HASHING ==========

  /**
   * Berechnet Hash des Meme-Ordners (basierend auf Dateinamen-Liste)
   */
  _hashDirectory(dirPath) {
    const files = fs.readdirSync(dirPath)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .sort();
    return crypto.createHash('sha256').update(files.join(',')).digest('hex');
  }

  _loadState() {
    try {
      if (!fs.existsSync(this.statePath)) return {};
      return JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
    } catch (err) {
      console.error('[MemeSync] State laden fehlgeschlagen:', err.message);
      return {};
    }
  }

  _saveState(state) {
    try {
      const configDir = path.dirname(this.statePath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      state.lastCheck = new Date().toISOString();
      fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.error('[MemeSync] State speichern fehlgeschlagen:', err.message);
    }
  }

  // ========== CHANGELOG ==========

  /**
   * Schreibt Changelog-Eintrag für neue Memes in die Queue
   */
  _writeChangelog(newMemeNames) {
    try {
      const channelLink = `https://discord.com/channels/${this.client.guilds.cache.first()?.id}/${this.channelId}`;

      const memeList = newMemeNames.join(', ');
      let content = `Neue Memes: **${memeList}**`;
      content += `\n\n[Zum Channel](${channelLink})`;

      let queueData = { queue: [], lastUpdate: new Date().toISOString() };
      if (fs.existsSync(this.queuePath)) {
        queueData = JSON.parse(fs.readFileSync(this.queuePath, 'utf8'));
      }

      queueData.queue.push({
        id: Date.now().toString(),
        status: 'pending',
        data: {
          title: '😂 Neue Memes',
          content: content
        },
        createdAt: new Date().toISOString(),
        source: 'meme-sync'
      });

      fs.writeFileSync(this.queuePath, JSON.stringify(queueData, null, 2), 'utf8');
      console.log(`[MemeSync] 📝 Changelog: ${newMemeNames.length} neue Memes`);

    } catch (err) {
      console.error(`[MemeSync] Changelog-Fehler:`, err.message);
    }
  }
}

module.exports = MemeSyncService;
