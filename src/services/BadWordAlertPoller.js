/**
 * BadWordAlertPoller - Pollt Visual API auf blockierte Nachrichten
 *
 * Gleicher Ansatz wie BingoService: GET /api/badword-alerts alle 5s,
 * schickt Discord-Embed für jeden Alert in den konfigurierten Channel.
 */

const axios = require('axios');
const { EmbedBuilder } = require('discord.js');

class BadWordAlertPoller {
  constructor(client, config) {
    this.client = client;
    this.apiUrl = config.api.url;
    this.apiKey = config.api.key;
    this.channelId = config.badwordAlert.channelId;
    this.interval = null;
  }

  start() {
    if (!this.channelId) {
      console.warn('[BadWordAlertPoller] ⚠️ BADWORD_CHANNEL_ID nicht gesetzt — deaktiviert');
      return;
    }

    this.interval = setInterval(() => this._poll(), 5000);
    console.log('[BadWordAlertPoller] ✅ Polling gestartet (alle 5s)');
  }

  async _poll() {
    try {
      const res = await axios.get(`${this.apiUrl}/api/badword-alerts`, {
        headers: { 'x-api-key': this.apiKey },
        timeout: 3000
      });

      const alerts = res.data?.alerts || [];
      for (const alert of alerts) {
        await this._sendAlert(alert);
      }
    } catch {
      // Visualizer offline oder nicht erreichbar — still ignorieren
    }
  }

  async _sendAlert(data) {
    try {
      const channel = await this.client.channels.fetch(this.channelId);
      if (!channel) return;

      const platformEmoji = { twitch: '🟣', youtube: '🔴' }[String(data.platform).toLowerCase()] || '⚪';
      const moduleEmoji = { chat: '💬', tts: '🔊', meme: '🖼️', chaos: '🌀' }[data.type] || '📦';

      const embed = new EmbedBuilder()
        .setColor(0xFF375F)
        .setAuthor({ name: `${data.username}`, iconURL: 'https://cdn.discordapp.com/emojis/1234567890.png' })
        .setTitle('🚫 Blockierter Inhalt')
        .setDescription(`\`\`\`${String(data.text || '?')}\`\`\``)
        .addFields(
          { name: `${moduleEmoji} Modul`, value: data.type || '?', inline: true },
          { name: `${platformEmoji} Platform`, value: data.platform || 'unbekannt', inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          { name: '🔍 Gefundene Wörter', value: `\`${data.reason || '?'}\``, inline: false }
        )
        .setFooter({ text: `User: ${data.username}` })
        .setTimestamp(new Date(data.timestamp));

      await channel.send({ embeds: [embed] });
      console.log(`[BadWordAlertPoller] 📨 Alert gesendet: ${data.username} | ${data.type}`);
    } catch (err) {
      console.error('[BadWordAlertPoller] ❌ Fehler beim Senden:', err.message);
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log('[BadWordAlertPoller] Gestoppt');
    }
  }
}

module.exports = BadWordAlertPoller;
