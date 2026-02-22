/**
 * AssetSyncService - Synchronisiert Filesystem-Assets mit Discord Forum-Threads
 *
 * Features:
 * - Hash-basiertes Polling (alle 5 Min) erkennt Änderungen im Asset-Ordner
 * - Postet neue Assets, löscht Nachrichten für entfernte Assets
 * - Changelog-Eintrag bei neuen Assets
 * - Natural Sort für korrekte Reihenfolge (augen2 < augen13)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const naturalSort = require('../utils/naturalSort');

const SEPARATOR = '──────────────────────────────────────────────────────────';

class AssetSyncService {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.interval = null;
    this.isProcessing = false;
    this.categories = ['hintergrund', 'koerper', 'kopf', 'augen', 'hut', 'rahmen'];
    this.statePath = path.join(__dirname, '../../config/asset-sync-state.json');
    this.queuePath = path.join(__dirname, '../../config/changelog-queue.json');
    this.pollingInterval = config.assetSync?.pollingInterval || 300000;

    console.log('[AssetSync] Initialisiert');
  }

  getThreadIds() {
    return this.config.assetSync?.threadIds || {};
  }

  // ========== POLLING ==========

  start() {
    if (this.interval) {
      console.log('[AssetSync] ⚠️ Polling läuft bereits');
      return;
    }

    // Sofort einmal prüfen
    this.checkAndSync();

    this.interval = setInterval(() => {
      this.checkAndSync();
    }, this.pollingInterval);

    console.log(`[AssetSync] ✅ Polling gestartet (alle ${this.pollingInterval / 1000}s)`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[AssetSync] ⏹️ Polling gestoppt');
    }
  }

  /**
   * Hash-basierte Prüfung: Nur syncen wenn sich Dateien geändert haben
   */
  async checkAndSync() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const threadIds = this.getThreadIds();
      const hasConfiguredThreads = Object.values(threadIds).some(id => id);
      if (!hasConfiguredThreads) return;

      const savedState = this._loadState();
      const savedHashes = savedState.categoryHashes || {};
      const currentHashes = {};

      // Hashes für alle Kategorien berechnen
      for (const category of this.categories) {
        if (!threadIds[category]) continue;
        const categoryPath = path.join(this.config.paths.assets, category);
        if (fs.existsSync(categoryPath)) {
          currentHashes[category] = this._hashDirectory(categoryPath);
        }
      }

      // Geänderte Kategorien finden
      const changedCategories = [];
      for (const [category, hash] of Object.entries(currentHashes)) {
        if (savedHashes[category] !== hash) {
          changedCategories.push(category);
        }
      }

      if (changedCategories.length === 0) return;

      console.log(`[AssetSync] 🔄 Änderungen in: ${changedCategories.join(', ')}`);

      // Nur geänderte Kategorien syncen
      for (const category of changedCategories) {
        try {
          const result = await this.syncCategory(category, threadIds[category]);
          if (result.error) {
            console.error(`[AssetSync] ${category}: ${result.error}`);
            continue;
          }

          console.log(`[AssetSync] ${category}: +${result.added} / -${result.removed}`);

          // Changelog-Eintrag schreiben
          if (result.added > 0 || result.removed > 0) {
            this._writeChangelog(category, result.newAssets, result.removedAssets, threadIds[category]);
          }
        } catch (err) {
          console.error(`[AssetSync] Fehler bei ${category}:`, err.message);
        }
      }

      // State speichern
      this._saveState({ categoryHashes: currentHashes });

    } catch (err) {
      console.error('[AssetSync] ❌ Polling-Fehler:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  // ========== SYNC ==========

  /**
   * Manueller Sync aller konfigurierten Kategorien
   */
  async syncAll(filterCategory = null) {
    const threadIds = this.getThreadIds();
    const results = {};

    for (const category of this.categories) {
      if (filterCategory && category !== filterCategory) continue;

      const threadId = threadIds[category];
      if (!threadId) continue;

      try {
        console.log(`[AssetSync] Sync: ${category}...`);
        const result = await this.syncCategory(category, threadId);
        results[category] = result;
        console.log(`[AssetSync] ${category}: +${result.added} / -${result.removed}`);

        if (result.added > 0 || result.removed > 0) {
          this._writeChangelog(category, result.newAssets, result.removedAssets, threadId);
        }
      } catch (err) {
        console.error(`[AssetSync] Fehler bei ${category}:`, err.message);
        results[category] = { error: err.message };
      }
    }

    // Hashes aktualisieren nach manuellem Sync
    this._updateHashes();

    return results;
  }

  /**
   * Synchronisiert eine einzelne Kategorie
   */
  async syncCategory(category, threadId) {
    const assetsPath = path.join(this.config.paths.assets, category);

    // 1. Filesystem-Assets laden (natural sort)
    if (!fs.existsSync(assetsPath)) {
      return { error: `Ordner nicht gefunden: ${assetsPath}` };
    }

    const files = fs.readdirSync(assetsPath)
      .filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
      .sort(naturalSort);

    const fileNames = new Map();
    for (const f of files) {
      fileNames.set(path.parse(f).name, f);
    }

    // 2. Thread-Messages laden
    const thread = await this.client.channels.fetch(threadId);
    if (!thread) {
      return { error: `Thread nicht gefunden: ${threadId}` };
    }

    const messages = await this.fetchAllMessages(thread);

    // 3. Gepostete Assets erkennen (name -> messages)
    const postedAssets = new Map();
    for (const msg of messages) {
      const name = this.extractAssetName(msg);
      if (!name) continue;

      if (!postedAssets.has(name)) {
        postedAssets.set(name, []);
      }
      postedAssets.get(name).push(msg);
    }

    // 4. Neue Assets finden (im Filesystem, nicht gepostet)
    const newAssets = [];
    for (const [name, filename] of fileNames) {
      if (!postedAssets.has(name)) {
        newAssets.push(filename);
      }
    }

    // 5. Gelöschte Assets finden (gepostet, nicht im Filesystem)
    const deletedMessages = [];
    const removedNames = [];
    for (const [name, msgs] of postedAssets) {
      if (!fileNames.has(name)) {
        // Starter-Message nicht löschen (würde Thread löschen)
        const deletable = msgs.filter(m => m.id !== thread.id);
        deletedMessages.push(...deletable);
        if (deletable.length > 0) removedNames.push(name);
      }
    }

    // 6. Neue Assets posten (natural sort Reihenfolge)
    for (const filename of newAssets) {
      const name = path.parse(filename).name;
      const filePath = path.join(assetsPath, filename);

      await thread.send({
        content: `${SEPARATOR}\n${name}`,
        files: [{ attachment: filePath, name: filename }]
      });
    }

    // 7. Gelöschte Assets entfernen
    let deletedCount = 0;
    for (const msg of deletedMessages) {
      try {
        await msg.delete();
        deletedCount++;
      } catch (err) {
        console.error(`[AssetSync] Nachricht ${msg.id} konnte nicht gelöscht werden:`, err.message);
      }
    }

    return {
      total: files.length,
      posted: postedAssets.size,
      added: newAssets.length,
      removed: deletedCount,
      newAssets: newAssets.map(f => path.parse(f).name),
      removedAssets: removedNames
    };
  }

  // ========== HELPERS ==========

  /**
   * Extrahiert Asset-Name aus einer Nachricht.
   * Erkennt beide Formate:
   * - Neues Format: "separator\nname" (Separator oben)
   * - Altes/manuelles Format: "name" oder "name\nseparator"
   */
  extractAssetName(msg) {
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
   * Berechnet Hash eines Kategorie-Ordners (basierend auf Dateinamen-Liste)
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
      console.error('[AssetSync] State laden fehlgeschlagen:', err.message);
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
      console.error('[AssetSync] State speichern fehlgeschlagen:', err.message);
    }
  }

  /**
   * Aktualisiert Hashes nach manuellem Sync
   */
  _updateHashes() {
    const threadIds = this.getThreadIds();
    const hashes = {};

    for (const category of this.categories) {
      if (!threadIds[category]) continue;
      const categoryPath = path.join(this.config.paths.assets, category);
      if (fs.existsSync(categoryPath)) {
        hashes[category] = this._hashDirectory(categoryPath);
      }
    }

    this._saveState({ categoryHashes: hashes });
  }

  // ========== CHANGELOG ==========

  /**
   * Schreibt Changelog-Eintrag für neue Assets in die Queue
   */
  _writeChangelog(category, newAssetNames = [], removedAssetNames = [], threadId) {
    try {
      const guild = this.client.guilds.cache.first();
      const threadLink = guild ? `https://discord.com/channels/${guild.id}/${threadId}` : null;

      let content = '';
      if (newAssetNames.length > 0) {
        content += `➕ Neu: **${newAssetNames.join(', ')}**`;
      }
      if (removedAssetNames.length > 0) {
        if (content) content += '\n';
        content += `➖ Entfernt: **${removedAssetNames.join(', ')}**`;
      }
      if (threadLink) {
        content += `\n\n[Zum Thread](${threadLink})`;
      }

      let queueData = { queue: [], lastUpdate: new Date().toISOString() };
      if (fs.existsSync(this.queuePath)) {
        queueData = JSON.parse(fs.readFileSync(this.queuePath, 'utf8'));
      }

      queueData.queue.push({
        id: Date.now().toString(),
        status: 'pending',
        data: {
          title: `🖼️ ${category}-Assets geändert`,
          content: content
        },
        createdAt: new Date().toISOString(),
        source: 'asset-sync'
      });

      fs.writeFileSync(this.queuePath, JSON.stringify(queueData, null, 2), 'utf8');
      console.log(`[AssetSync] 📝 Changelog: +${newAssetNames.length} / -${removedAssetNames.length} ${category}-Assets`);

    } catch (err) {
      console.error(`[AssetSync] Changelog-Fehler:`, err.message);
    }
  }
}

module.exports = AssetSyncService;
