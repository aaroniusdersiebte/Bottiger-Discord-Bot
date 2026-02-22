/**
 * DocStatePoller
 *
 * Pollt docs/features/*.md alle 30 Sekunden auf Datei-Änderungen (SHA256-Hash-Vergleich).
 * Bei Änderung: Sync zu Discord + Changelog-Eintrag mit Jump-Link zur Doku-Message.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DocStatePoller {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.interval = null;
    this.isProcessing = false;

    // Pfade
    this.docsPath = path.join(__dirname, '../../docs/features');
    this.hashStatePath = path.join(__dirname, '../../config/docs-state.json');
    this.queuePath = path.join(__dirname, '../../config/changelog-queue.json');

    // Polling-Intervall (konfigurierbar, Default 30 Sekunden)
    this.pollingInterval = config.docs?.pollingInterval || 30000;

    console.log('[DocStatePoller] Initialisiert');
  }

  /**
   * Startet das Polling
   */
  start() {
    if (this.interval) {
      console.log('[DocStatePoller] ⚠️ Polling läuft bereits');
      return;
    }

    // Sofort einmal ausführen
    this.checkAndProcess();

    // Dann regelmäßig
    this.interval = setInterval(() => {
      this.checkAndProcess();
    }, this.pollingInterval);

    console.log(`[DocStatePoller] ✅ Polling gestartet (alle ${this.pollingInterval / 1000}s)`);
  }

  /**
   * Stoppt das Polling
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[DocStatePoller] ⏹️ Polling gestoppt');
    }
  }

  /**
   * Berechnet SHA256-Hash einer Datei
   */
  _hashFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Liest gespeicherte Hashes aus docs-state.json
   */
  _loadFileHashes() {
    try {
      if (!fs.existsSync(this.hashStatePath)) {
        return {};
      }
      const state = JSON.parse(fs.readFileSync(this.hashStatePath, 'utf8'));
      return state.fileHashes || {};
    } catch (err) {
      console.error('[DocStatePoller] ❌ Fehler beim Laden der Hashes:', err);
      return {};
    }
  }

  /**
   * Speichert Hashes in docs-state.json (merged mit bestehendem State)
   */
  _saveFileHashes(hashes) {
    try {
      const configDir = path.dirname(this.hashStatePath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      let state = {};
      if (fs.existsSync(this.hashStatePath)) {
        state = JSON.parse(fs.readFileSync(this.hashStatePath, 'utf8'));
      }

      state.fileHashes = hashes;
      state.lastHashCheck = new Date().toISOString();

      fs.writeFileSync(this.hashStatePath, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.error('[DocStatePoller] ❌ Fehler beim Speichern der Hashes:', err);
    }
  }

  /**
   * Berechnet aktuelle Hashes aller docs/features/*.md Dateien
   */
  _getCurrentHashes() {
    const hashes = {};

    if (!fs.existsSync(this.docsPath)) {
      return hashes;
    }

    const files = fs.readdirSync(this.docsPath).filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = path.join(this.docsPath, file);
      hashes[file] = this._hashFile(filePath);
    }

    return hashes;
  }

  /**
   * Prüft auf Änderungen und verarbeitet diese
   */
  async checkAndProcess() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const savedHashes = this._loadFileHashes();
      const currentHashes = this._getCurrentHashes();

      // Erststart-Schutz: Wenn keine Hashes gespeichert sind, nur speichern
      const isFirstRun = Object.keys(savedHashes).length === 0;

      if (isFirstRun) {
        console.log('[DocStatePoller] ℹ️ Erststart erkannt - speichere initiale Hashes (kein Sync)');
        this._saveFileHashes(currentHashes);
        return;
      }

      // Geänderte/neue Dateien finden
      const changedFiles = [];
      for (const [file, hash] of Object.entries(currentHashes)) {
        if (!savedHashes[file] || savedHashes[file] !== hash) {
          changedFiles.push(file);
        }
      }

      // Gelöschte Dateien finden (waren im alten Hash, nicht mehr im neuen)
      const deletedFiles = Object.keys(savedHashes).filter(f => !currentHashes[f]);

      if (changedFiles.length === 0 && deletedFiles.length === 0) {
        return;
      }

      if (changedFiles.length > 0) {
        console.log(`[DocStatePoller] 🔄 ${changedFiles.length} Datei(en) geändert: ${changedFiles.join(', ')}`);
      }
      if (deletedFiles.length > 0) {
        console.log(`[DocStatePoller] 🗑️ ${deletedFiles.length} Datei(en) gelöscht: ${deletedFiles.join(', ')}`);
      }

      // 1. Docs syncen (partial mit changed + deleted)
      const syncResult = await this.client.docsService.syncToChannel(this.client, {
        changed: changedFiles,
        deleted: deletedFiles
      });
      console.log(`[DocStatePoller] ✅ Sync abgeschlossen (${syncResult.success} aktualisiert, ${syncResult.deleted || 0} gelöscht)`);

      // 2. Changelog-Einträge für geänderte Dateien schreiben
      for (const file of changedFiles) {
        const isNew = !savedHashes[file];
        await this._writeChangelog(file, isNew);
      }

      // 3. Hashes aktualisieren
      this._saveFileHashes(currentHashes);

    } catch (err) {
      console.error('[DocStatePoller] ❌ Fehler beim Polling:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Schreibt einen Changelog-Eintrag in changelog-queue.json
   */
  async _writeChangelog(filename, isNew) {
    try {
      const featureKey = filename.replace('.md', '');

      // Frontmatter-Titel laden
      const title = this._getFeatureTitle(filename);

      // Jump-Link zur Doku-Message bauen
      const jumpLink = this._buildJumpLink(featureKey);

      // Changelog-Content
      const action = isNew ? 'Neue Doku' : 'Doku aktualisiert';
      let content = `**${action}:** ${title}`;
      if (jumpLink) {
        content += `\n\n[Zur Dokumentation](${jumpLink})`;
      }

      // In Queue schreiben
      let queueData = { queue: [], lastUpdate: new Date().toISOString() };

      if (fs.existsSync(this.queuePath)) {
        queueData = JSON.parse(fs.readFileSync(this.queuePath, 'utf8'));
      }

      // Duplikat-Check: Kein weiterer Eintrag wenn bereits innerhalb 6h ein Eintrag für dieses Feature existiert
      const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
      const recentEntry = queueData.queue.find(entry =>
        entry.source === 'doc-state-poller' &&
        entry.featureKey === featureKey &&
        new Date(entry.createdAt).getTime() > sixHoursAgo
      );

      if (recentEntry) {
        console.log(`[DocStatePoller] ⏭️ Changelog übersprungen (bereits vor ${Math.round((Date.now() - new Date(recentEntry.createdAt).getTime()) / 60000)} Min geloggt): ${title}`);
        return;
      }

      const changelogEntry = {
        id: Date.now().toString(),
        status: 'pending',
        featureKey: featureKey,
        data: {
          title: `📄 ${action}: ${title}`,
          content: content
        },
        createdAt: new Date().toISOString(),
        source: 'doc-state-poller'
      };

      queueData.queue.push(changelogEntry);
      fs.writeFileSync(this.queuePath, JSON.stringify(queueData, null, 2), 'utf8');

      console.log(`[DocStatePoller] 📝 Changelog geschrieben: ${changelogEntry.data.title}`);

    } catch (err) {
      console.error(`[DocStatePoller] ❌ Fehler beim Changelog für ${filename}:`, err);
    }
  }

  /**
   * Liest den Titel aus dem Frontmatter einer Feature-Datei
   */
  _getFeatureTitle(filename) {
    try {
      const filePath = path.join(this.docsPath, filename);
      const content = fs.readFileSync(filePath, 'utf8');

      // Frontmatter parsen (zwischen ---)
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const titleMatch = match[1].match(/title:\s*(.+)/);
        if (titleMatch) {
          return titleMatch[1].replace(/^["']|["']$/g, '').trim();
        }
      }

      // Fallback: Filename ohne Endung
      return filename.replace('.md', '');
    } catch (err) {
      return filename.replace('.md', '');
    }
  }

  /**
   * Baut Jump-Link zur Doku-Message aus dem DocsService State
   */
  _buildJumpLink(featureKey) {
    try {
      const docsService = this.client.docsService;
      if (!docsService || !docsService.state) return null;

      const { threadMessages, threadIds } = docsService.state;

      // Suche in allen Threads nach der Message
      for (const [threadId, messages] of Object.entries(threadMessages)) {
        if (messages[featureKey]) {
          const messageId = messages[featureKey];
          const guild = this.client.guilds.cache.first();
          if (guild) {
            return `https://discord.com/channels/${guild.id}/${threadId}/${messageId}`;
          }
        }
      }

      return null;
    } catch (err) {
      console.error(`[DocStatePoller] ⚠️ Jump-Link konnte nicht erstellt werden für ${featureKey}:`, err.message);
      return null;
    }
  }
}

module.exports = DocStatePoller;
