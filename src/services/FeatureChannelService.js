/**
 * FeatureChannelService
 *
 * Synct Features aus features.json in Discord #features Channel
 * - Jedes Feature = Eine Message (Embed)
 * - Overview-Message mit Jump-Links (gruppiert nach Tags)
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class FeatureChannelService {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.featuresPath = path.join(__dirname, '../../config/features.json');
    this.statePath = path.join(__dirname, '../../config/feature-channel-state.json');

    // State (Message-IDs)
    this.state = {
      overviewMessageId: null,
      featureMessages: {}, // featureId -> messageId
      lastUpdate: null
    };

    console.log('[FeatureChannelService] Initialisiert');
  }

  /**
   * Initialisiert Service (lädt State)
   */
  async init() {
    try {
      // State-File laden falls vorhanden
      if (fs.existsSync(this.statePath)) {
        const stateData = fs.readFileSync(this.statePath, 'utf8');
        this.state = JSON.parse(stateData);
        console.log(`[FeatureChannelService] ✅ State geladen (${Object.keys(this.state.featureMessages).length} Features)`);
      } else {
        console.log('[FeatureChannelService] ℹ️ Kein State-File gefunden, starte mit leerem State');
      }

      console.log('[FeatureChannelService] ✅ Initialisierung abgeschlossen');
    } catch (err) {
      console.error('[FeatureChannelService] ❌ Fehler bei Initialisierung:', err);
      throw err;
    }
  }

  /**
   * Synct alle Features zu Discord
   * @returns {Object} { success, synced, errors }
   */
  async syncChannel() {
    try {
      console.log('[FeatureChannelService] 🔄 Starte Channel-Sync...');

      // Features laden
      if (!fs.existsSync(this.featuresPath)) {
        console.log('[FeatureChannelService] ℹ️ features.json existiert nicht, erstelle leere Features');
        this._saveFeatures({ features: {}, lastUpdate: new Date().toISOString() });
      }

      const featuresData = JSON.parse(fs.readFileSync(this.featuresPath, 'utf8'));
      const features = Object.values(featuresData.features || {});

      if (features.length === 0) {
        console.log('[FeatureChannelService] ℹ️ Keine Features zum Syncen');
        return { success: true, synced: 0, errors: 0 };
      }

      // Channel abrufen
      const channelId = this.config.channels.features;

      if (!channelId) {
        throw new Error('Features-Channel nicht konfiguriert (FEATURES_CHANNEL_ID in .env fehlt)');
      }

      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        throw new Error(`Channel ${channelId} nicht gefunden oder kein Text-Channel`);
      }

      let synced = 0;
      let errors = 0;

      // Jedes Feature syncen
      for (const feature of features) {
        try {
          await this._syncFeature(feature, channel);
          synced++;
        } catch (err) {
          console.error(`[FeatureChannelService] ❌ Fehler beim Syncen von Feature "${feature.title}":`, err);
          errors++;
        }
      }

      // Overview-Message erstellen/updaten
      await this._updateOverviewMessage(features, channel);

      this._saveState();

      console.log(`[FeatureChannelService] ✅ Channel-Sync abgeschlossen: ${synced} Features synced, ${errors} Fehler`);

      return { success: true, synced, errors };
    } catch (err) {
      console.error('[FeatureChannelService] ❌ Fehler beim Channel-Sync:', err);
      throw err;
    }
  }

  /**
   * Synct einzelnes Feature zu Discord
   */
  async _syncFeature(feature, channel) {
    // Embed erstellen
    const embed = new EmbedBuilder()
      .setTitle(`📄 ${feature.title}`)
      .setColor('#5865F2') // Discord Blurple
      .setTimestamp(new Date(feature.updatedAt || feature.createdAt));

    // Tags hinzufügen
    if (feature.tags && feature.tags.length > 0) {
      embed.addFields({
        name: 'Tags',
        value: feature.tags.map(t => `\`${t}\``).join(', '),
        inline: false
      });
    }

    // Sync-Paare hinzufügen
    if (feature.syncPairs && feature.syncPairs.length > 0) {
      embed.addFields({
        name: 'Sync-Paare',
        value: feature.syncPairs.map(s => `\`${s}\``).join(', '),
        inline: false
      });
    }

    // Markdown-Datei-Link
    embed.addFields({
      name: 'Dokumentation',
      value: `\`docs/features/${feature.filename}\``,
      inline: false
    });

    // Prüfen: Gibt es bereits eine Message für dieses Feature?
    const existingMessageId = this.state.featureMessages[feature.id];

    if (existingMessageId) {
      // Versuchen, existierende Message zu updaten
      try {
        const message = await channel.messages.fetch(existingMessageId);
        await message.edit({ embeds: [embed] });
        console.log(`[FeatureChannelService] ✅ Feature aktualisiert: ${feature.title}`);
        return;
      } catch (err) {
        // Message nicht gefunden, neue erstellen
        console.warn(`[FeatureChannelService] Feature-Message nicht gefunden, erstelle neue: ${feature.title}`);
      }
    }

    // Neue Message erstellen
    const message = await channel.send({ embeds: [embed] });
    this.state.featureMessages[feature.id] = message.id;

    // Discord-Message-ID in features.json speichern
    const featuresData = JSON.parse(fs.readFileSync(this.featuresPath, 'utf8'));
    if (featuresData.features[feature.id]) {
      featuresData.features[feature.id].discordMessageId = message.id;
      this._saveFeatures(featuresData);
    }

    console.log(`[FeatureChannelService] ✅ Feature gepostet: ${feature.title}`);
  }

  /**
   * Erstellt/Updated Overview-Message mit Jump-Links
   */
  async _updateOverviewMessage(features, channel) {
    // Features nach Tags gruppieren
    const featuresByTag = {};

    for (const feature of features) {
      if (!feature.tags || feature.tags.length === 0) {
        // Features ohne Tags
        if (!featuresByTag['Ohne Kategorie']) {
          featuresByTag['Ohne Kategorie'] = [];
        }
        featuresByTag['Ohne Kategorie'].push(feature);
      } else {
        // Für jedes Tag hinzufügen
        for (const tag of feature.tags) {
          if (!featuresByTag[tag]) {
            featuresByTag[tag] = [];
          }
          featuresByTag[tag].push(feature);
        }
      }
    }

    // Embed erstellen
    const embed = new EmbedBuilder()
      .setTitle('📚 Stream-Features Übersicht')
      .setDescription('Alle dokumentierten Features, gruppiert nach Kategorien')
      .setColor('#FFD700') // Gold
      .setTimestamp();

    // Für jede Kategorie
    const tags = Object.keys(featuresByTag).sort();

    for (const tag of tags) {
      const tagFeatures = featuresByTag[tag];

      let value = '';
      for (const feature of tagFeatures) {
        const messageId = this.state.featureMessages[feature.id];
        if (messageId) {
          const messageUrl = `https://discord.com/channels/${channel.guild.id}/${channel.id}/${messageId}`;
          value += `• [${feature.title}](${messageUrl})\n`;
        } else {
          value += `• ${feature.title} _(nicht gesynct)_\n`;
        }
      }

      embed.addFields({
        name: `${this._getTagEmoji(tag)} ${tag} (${tagFeatures.length})`,
        value: value || 'Keine Features',
        inline: false
      });
    }

    // Prüfen: Gibt es bereits eine Overview-Message?
    if (this.state.overviewMessageId) {
      try {
        const message = await channel.messages.fetch(this.state.overviewMessageId);
        await message.edit({ embeds: [embed] });
        console.log('[FeatureChannelService] ✅ Overview-Message aktualisiert');
        return;
      } catch (err) {
        console.warn('[FeatureChannelService] Overview-Message nicht gefunden, erstelle neue');
        this.state.overviewMessageId = null;
      }
    }

    // Neue Overview-Message erstellen und pinnen
    const message = await channel.send({ embeds: [embed] });
    await message.pin();
    this.state.overviewMessageId = message.id;
    console.log('[FeatureChannelService] ✅ Overview-Message erstellt und gepinnt');
  }

  /**
   * Gibt passendes Emoji für Tag zurück
   */
  _getTagEmoji(tag) {
    const tagEmojis = {
      'Discord Bot': '🤖',
      'Stream Overlay': '🎨',
      'Punkte System': '⭐',
      'Streaming Sounds': '🔊',
      'TTS': '🗣️',
      'Ohne Kategorie': '📁'
    };

    return tagEmojis[tag] || '📄';
  }

  /**
   * Speichert State in JSON-File
   */
  _saveState() {
    try {
      const configDir = path.dirname(this.statePath);

      // Config-Ordner erstellen falls nicht vorhanden
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      this.state.lastUpdate = new Date().toISOString();

      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
      console.log('[FeatureChannelService] 💾 State gespeichert');
    } catch (err) {
      console.error('[FeatureChannelService] ❌ Fehler beim Speichern von State:', err);
    }
  }

  /**
   * Speichert Features in JSON-File
   */
  _saveFeatures(featuresData) {
    try {
      const configDir = path.dirname(this.featuresPath);

      // Config-Ordner erstellen falls nicht vorhanden
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      featuresData.lastUpdate = new Date().toISOString();

      fs.writeFileSync(this.featuresPath, JSON.stringify(featuresData, null, 2), 'utf8');
    } catch (err) {
      console.error('[FeatureChannelService] ❌ Fehler beim Speichern von Features:', err);
    }
  }

  /**
   * Gibt Statistiken zurück
   */
  getStats() {
    return {
      syncedFeatures: Object.keys(this.state.featureMessages).length,
      hasOverview: !!this.state.overviewMessageId,
      lastUpdate: this.state.lastUpdate
    };
  }
}

module.exports = FeatureChannelService;
