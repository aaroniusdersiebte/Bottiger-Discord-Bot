/**
 * Zentrale Bot-Konfiguration
 *
 * Lädt Environment-Variablen und stellt sie strukturiert bereit
 */

require('dotenv').config();

const path = require('path');

module.exports = {
  // Discord
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID, // Optional: Für guild-only commands (Testing)
  },

  // Stream Visualizer API (wenn Visualizer läuft)
  api: {
    url: process.env.API_URL || 'http://127.0.0.1:3000',
    key: process.env.API_KEY
  },

  // File-Pfade (für Standalone-Mode, wenn Visualizer aus)
  paths: {
    visualizer: process.env.VISUALIZER_PATH || 'C:\\Streaming\\Code\\visual',
    usersJson: process.env.USERS_JSON_PATH || 'C:\\Streaming\\Code\\visual\\config\\users.json',
    assets: process.env.ASSETS_PATH || 'C:\\Streaming\\Code\\visual\\assets\\tts-characters',
    pendingVerifications: process.env.PENDING_VERIFICATIONS_PATH || 'C:\\Streaming\\Code\\visual\\config\\pending-verifications.json',
    // Discord-spezifische Dateien (im discord-Projekt selbst)
    discordLinks: process.env.DISCORD_LINKS_PATH || path.resolve(__dirname, '../config/discord-links.json'),
    discordUsers: process.env.DISCORD_USERS_PATH || path.resolve(__dirname, '../config/discord-users.json'),
    pendingDiscordLinks: process.env.PENDING_DISCORD_LINKS_PATH || path.resolve(__dirname, '../config/pending-discord-links.json')
  },

  // SSP Battle-System
  ssp: {
    battleChannelId: process.env.BATTLE_CHANNEL_ID || null
  },

  // Bad Word Alert (pollt Visual API auf blockierte Nachrichten)
  badwordAlert: {
    channelId: process.env.BADWORD_CHANNEL_ID || null
  },

  // Bot-Settings
  bot: {
    logLevel: process.env.LOG_LEVEL || 'info', // 'debug', 'info', 'warn', 'error'
    leaderboardChannelId: process.env.LEADERBOARD_CHANNEL_ID,
    punkteChannelId: process.env.PUNKTE_CHANNEL_ID,
    leaderboardUpdateInterval: 300000, // 5 Minuten
    leaderboardExcludedUsers: process.env.LEADERBOARD_EXCLUDED_USERS
      ? process.env.LEADERBOARD_EXCLUDED_USERS.split(',').map(u => u.trim().toLowerCase())
      : []
  },

  // Dokumentations-Channels
  channels: {
    docs: process.env.DOCS_CHANNEL_ID,
    features: process.env.FEATURES_CHANNEL_ID,
    changelog: process.env.CHANGELOG_CHANNEL_ID
  },

  // Docs-Polling (autonomer Docs-Watcher)
  docs: {
    pollingInterval: parseInt(process.env.DOCS_POLLING_INTERVAL) || 30000 // 30 Sekunden
  },

  // Asset-Sync (Forum-Thread-Synchronisation)
  assetSync: {
    pollingInterval: parseInt(process.env.ASSET_SYNC_INTERVAL) || 300000, // 5 Minuten
    threadIds: {
      hintergrund: process.env.ASSET_THREAD_HINTERGRUND,
      koerper: process.env.ASSET_THREAD_KOERPER,
      kopf: process.env.ASSET_THREAD_KOPF,
      augen: process.env.ASSET_THREAD_AUGEN,
      hut: process.env.ASSET_THREAD_HUT,
      rahmen: process.env.ASSET_THREAD_RAHMEN,
    }
  },

  // Meme-Sync (Text-Channel-Synchronisation)
  memeSync: {
    pollingInterval: parseInt(process.env.MEME_SYNC_INTERVAL) || 300000, // 5 Minuten
    channelId: process.env.MEME_CHANNEL_ID,
    path: process.env.MEME_PATH || 'C:\\Streaming\\Code\\visual\\assets\\meme'
  },

  // Docs-Forum (Forum-Channel für Dokumentation)
  docsForum: {
    channelId: process.env.DOCS_FORUM_CHANNEL_ID,
    changelogThreadId: process.env.DOCS_CHANGELOG_THREAD_ID,
    overviewThreadId: process.env.DOCS_OVERVIEW_THREAD_ID
  },

  // Custom Avatar Upload (eigene Wolpertinger-Bilder)
  customAvatar: {
    channelId: process.env.CUSTOM_AVATAR_CHANNEL_ID,
    verifyPath: process.env.CUSTOM_AVATAR_VERIFY_PATH,
    maxFileSize: 5 * 1024 * 1024, // 5MB
    cooldownDays: 7,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  },

  // Bug-Fix Channel (✅ Reaction → löscht Nachricht, aktualisiert Übersicht)
  bugfixChannel: {
    channelId: process.env.BUGFIX_CHANNEL_ID || '1482361898291953684'
  },

  // UserImage-Feature (Bilder im Stream anzeigen)
  userImage: {
    enabled: process.env.USER_IMAGE_ENABLED !== 'false',
    // Channels in denen das Feature aktiv ist (Komma-getrennt)
    channels: process.env.USER_IMAGE_CHANNELS
      ? process.env.USER_IMAGE_CHANNELS.split(',').map(c => c.trim())
      : [],
    // Rolle die mit 📺 reagieren darf
    moderatorRole: process.env.USER_IMAGE_MOD_ROLE || 'Discord Master',
    // Emoji zum Triggern
    triggerEmoji: '📺',
    // Erlaubte Bild-Formate
    allowedFormats: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  }
};
