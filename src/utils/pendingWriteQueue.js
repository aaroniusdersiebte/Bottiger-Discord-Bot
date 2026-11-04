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
 *
 * Zappify benennt die Datei vor dem Abarbeiten um (pending-writes.draining-*.json)
 * und dedupliziert über die Eintrags-ID — die ID muss daher eindeutig bleiben.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 5000;

class PendingWriteQueue {
  constructor(filePath) {
    this.filePath = filePath;
  }

  _read() {
    let text;
    try {
      text = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      return { version: 1, entries: [] }; // Datei fehlt -> Neuanlage
    }
    try {
      const raw = JSON.parse(text);
      if (raw && Array.isArray(raw.entries)) return raw;
    } catch { /* kaputt -> unten sichern */ }
    // Kaputte Datei NICHT überschreiben (sonst gehen Buchungen verloren), sondern sichern
    const backup = path.join(path.dirname(this.filePath), `pending-writes.corrupt-${Date.now()}.json`);
    try {
      fs.renameSync(this.filePath, backup);
      console.warn(`[PendingWriteQueue] Queue unlesbar — gesichert als ${path.basename(backup)}`);
    } catch { /* bleibt liegen */ }
    return { version: 1, entries: [] };
  }

  _write(data) {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Atomar (tmp + rename): Zappify liest nie eine halb geschriebene Datei
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  /**
   * Hängt eine Schreiboperation an.
   * @param {string} type
   * @param {object} payload
   */
  enqueue(type, payload) {
    const data = this._read();
    data.entries.push({
      id: `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
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
