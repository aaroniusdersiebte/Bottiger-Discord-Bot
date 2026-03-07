/**
 * AlertServer - Lokaler HTTP-Server für interne Benachrichtigungen vom Visual-Projekt
 *
 * Empfängt POST /badword-alert und schickt Discord-Embed in konfigurierten Channel.
 * Läuft nur auf 127.0.0.1 (nicht nach außen erreichbar).
 */

const http = require('http');
const { EmbedBuilder } = require('discord.js');

class AlertServer {
  constructor(client, config) {
    this.client = client;
    this.port = config.badwordAlert.port;
    this.channelId = config.badwordAlert.channelId;
    this.server = null;
  }

  start() {
    if (!this.channelId) {
      console.warn('[AlertServer] ⚠️ BADWORD_CHANNEL_ID nicht gesetzt — AlertServer deaktiviert');
      return;
    }

    this.server = http.createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/badword-alert') {
        res.writeHead(404);
        res.end();
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          this._sendAlert(data).catch(err =>
            console.error('[AlertServer] ❌ Fehler beim Senden:', err.message)
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Ungültiges JSON' }));
        }
      });
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      console.log(`[AlertServer] ✅ Lauscht auf 127.0.0.1:${this.port}`);
    });

    this.server.on('error', err => {
      console.error('[AlertServer] ❌ Server-Fehler:', err.message);
    });
  }

  async _sendAlert(data) {
    const channel = await this.client.channels.fetch(this.channelId);
    if (!channel) {
      console.warn('[AlertServer] ⚠️ Channel nicht gefunden:', this.channelId);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🚫 Bad Word gefunden')
      .setColor(0xFF375F)
      .addFields(
        { name: 'Modul', value: data.type || 'unbekannt', inline: true },
        { name: 'User', value: data.username || 'unbekannt', inline: true },
        { name: 'Platform', value: data.platform || 'unbekannt', inline: true },
        { name: 'Gefundene Wörter', value: data.reason || '?', inline: false },
        { name: 'Text', value: String(data.text || '').slice(0, 100), inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
    console.log(`[AlertServer] 📨 Alert gesendet: ${data.username} | ${data.type}`);
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('[AlertServer] Gestoppt');
    }
  }
}

module.exports = AlertServer;
