/**
 * BugFixService
 *
 * Verwaltet erledigte Bug-Fixes im Bugfix-Channel:
 * - Speichert die letzten 5 Fixes persistent
 * - Pflegt eine Übersichts-Nachricht im Channel
 */

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.resolve(__dirname, '../../config/bugfix-state.json');
const MAX_FIXES = 5;

class BugFixService {
  constructor(config) {
    this.channelId = config.bugfixChannel?.channelId;
    this.state = { summaryMessageId: null, fixes: [] };
  }

  loadState() {
    try {
      this.state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch {
      this.state = { summaryMessageId: null, fixes: [] };
    }
  }

  saveState() {
    fs.writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2), 'utf8');
  }

  /**
   * Fix zur Liste hinzufügen (neueste zuerst, max 5)
   */
  addFix(text) {
    this.loadState();
    const entry = {
      text: text.trim(),
      completedAt: Date.now()
    };
    this.state.fixes.unshift(entry);
    if (this.state.fixes.length > MAX_FIXES) {
      this.state.fixes = this.state.fixes.slice(0, MAX_FIXES);
    }
    this.saveState();
  }

  /**
   * Minimalistischen Summary-Text formatieren
   */
  formatSummary() {
    const fixes = this.state.fixes;
    if (fixes.length === 0) {
      return '```\nLetzte Fixes\n────────────────────────────\nNoch keine Fixes vorhanden.\n```';
    }

    const lines = fixes.map((f, i) => {
      const date = new Date(f.completedAt);
      const d = String(date.getDate()).padStart(2, '0');
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const dateStr = `${d}.${m}`;
      const label = `${i + 1}.`;
      // Text auf 55 Zeichen kürzen
      const text = f.text.length > 55 ? f.text.slice(0, 52) + '...' : f.text;
      return `${label.padEnd(3)} [${dateStr}]  ${text}`;
    });

    return `\`\`\`\nLetzte Fixes  ✓\n────────────────────────────────────────────────────────────\n${lines.join('\n')}\n\`\`\``;
  }

  /**
   * Übersichts-Nachricht erstellen oder aktualisieren
   */
  async updateSummaryMessage(channel) {
    this.loadState();
    const content = this.formatSummary();

    // Vorhandene Nachricht editieren
    if (this.state.summaryMessageId) {
      try {
        const existing = await channel.messages.fetch(this.state.summaryMessageId);
        await existing.edit(content);
        console.log('[BugFixService] Übersicht aktualisiert');
        return;
      } catch {
        // Nachricht nicht mehr vorhanden → neu erstellen
        this.state.summaryMessageId = null;
      }
    }

    // Neue Nachricht erstellen
    const msg = await channel.send(content);
    this.state.summaryMessageId = msg.id;
    this.saveState();
    console.log('[BugFixService] Übersicht erstellt');
  }
}

module.exports = BugFixService;
