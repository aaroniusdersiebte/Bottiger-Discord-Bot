/**
 * PendingWriteQueue - puffert schreibende DB-Operationen, wenn Zappify aus ist.
 *
 * Der Bot liest die users.db IMMER nur read-only (WAL-safe). Alles Schreibende
 * (Punkte aus SSP-Wetten etc.) wird hier eingereiht und von Zappifys
 * DiscordSyncService beim Start + periodisch abgearbeitet und geleert.
 *
 * Format: { version: 1, entries: [ { id, type, payload, createdAt } ] }
 * Bekannte Typen:
 *   - 'points.add'  { username, delta }   -> race-sicher (Delta statt Absolutwert)
 *   - 'points.set'  { username, points }
 */

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 5000;

class PendingWriteQueue {
  constructor(filePath) {
    this.filePath = filePath;
  }

  _read() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (raw && Array.isArray(raw.entries)) return raw;
    } catch {
      /* Datei fehlt oder ist kaputt -> Neuanlage */
    }
    return { version: 1, entries: [] };
  }

  _write(data) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  /**
   * Hängt eine Schreiboperation an.
   * @param {string} type
   * @param {object} payload
   */
  enqueue(type, payload) {
    const data = this._read();
    data.entries.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      createdAt: new Date().toISOString()
    });
    // Hard-Cap gegen Endlos-Wachstum / Missbrauch
    if (data.entries.length > MAX_ENTRIES) {
      data.entries = data.entries.slice(-MAX_ENTRIES);
    }
    this._write(data);
    console.warn(
      `[PendingWriteQueue] ${type} eingereiht (Zappify offline) — wird beim nächsten Start übernommen`
    );
  }

  size() {
    return this._read().entries.length;
  }
}

module.exports = PendingWriteQueue;
