/**
 * Zentrale Bot-Konfiguration.
 *
 * Quellen (in dieser Reihenfolge, erste gewinnt):
 *  1. process.env  (Zappify uebergibt Token + Kern-Settings via spawn-env)
 *  2. config/bot-settings.json  (nicht-Secret-Einstellungen, vom Zappify-Assistenten gepflegt)
 *  3. .env  (nur manueller / Playground-Betrieb)
 *  4. Defaults
 *
 * Fehlt eine .env, ist das kein Fehler - dotenv meldet das still.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// --- config/bot-settings.json (nicht-Secret, optional) ---
let botSettings = {};
try {
  const p = process.env.BOT_SETTINGS_PATH || path.resolve(__dirname, '../config/bot-settings.json');
  if (fs.existsSync(p)) botSettings = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
} catch (err) {
  console.warn('[config] bot-settings.json nicht lesbar:', err.message);
}

/** env > bot-settings.json > default */
const pick = (envKey, settingsKey, def = undefined) => {
  if (process.env[envKey] !== undefined && process.env[envKey] !== '') return process.env[envKey];
  if (settingsKey && botSettings[settingsKey] !== undefined && botSettings[settingsKey] !== '') return botSettings[settingsKey];
  return def;
};

const profile = process.env.ZAPPIFY_BOT_PROFILE === 'customer' ? 'customer' : 'playground';

module.exports = {
  profile,

  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID || undefined,
  },

  api: {
    url: process.env.API_URL || 'http://127.0.0.1:3000',
    key: process.env.API_KEY,
  },

  // File-Pfade. Im Kunden-Modus wird die DB nicht direkt gelesen (alles ueber API),
  // die Aaronius-Defaults greifen dann nie.
  paths: {
    visualizer: pick('VISUALIZER_PATH', 'visualizerPath', ''),
    usersDb: pick('USERS_DB_PATH', 'usersDbPath', ''),
    assets: pick('ASSETS_PATH', 'assetsPath', ''),
    pendingVerifications: pick('PENDING_VERIFICATIONS_PATH', null,
      path.resolve(__dirname, '../config/pending-verifications.json')),
    discordLinks: process.env.DISCORD_LINKS_PATH || path.resolve(__dirname, '../config/discord-links.json'),
    discordUsers: process.env.DISCORD_USERS_PATH || path.resolve(__dirname, '../config/discord-users.json'),
    pendingDiscordLinks: process.env.PENDING_DISCORD_LINKS_PATH || path.resolve(__dirname, '../config/pending-discord-links.json'),
    pendingWrites: process.env.PENDING_WRITES_PATH || path.resolve(__dirname, '../config/pending-writes.json'),
    avatarCooldowns: process.env.AVATAR_COOLDOWNS_PATH || path.resolve(__dirname, '../config/avatar-cooldowns.json'),
    // Leaderboard-State liegt im Kunden-Modus im Bot-Ordner (nicht im visual-Repo)
    leaderboardState: process.env.LEADERBOARD_STATE_PATH || path.resolve(__dirname, '../config/leaderboard-state.json'),
    // Rueckkanal: Zappify schreibt hier Freigabe-/Ablehn-Ereignisse der Bild-Freigabe,
    // der Bot stellt sie dem Nutzer per DM zu (AppEventQueueService).
    pendingBotNotifications: process.env.PENDING_BOT_NOTIFICATIONS_PATH
      || path.resolve(__dirname, '../config/pending-bot-notifications.json'),
  },

  // Bild-Freigabe-Modus (Zappify uebergibt ZAPPIFY_IMAGE_REVIEW_MODE beim spawn):
  //  app   = Bot reicht eingereichte Bilder an die Zappify-API, Freigabe im Zappify-Tab
  //  emoji = alter Flow, ein Mod reagiert im Discord mit ✅/❌ bzw. 📺
  //  both  = beides (fuer Fanart voll, Custom-Avatare laufen in app/both stets ueber die App)
  imageReview: {
    mode: (() => {
      const m = process.env.ZAPPIFY_IMAGE_REVIEW_MODE;
      return ['app', 'emoji', 'both'].includes(m) ? m : 'app';
    })(),
  },

  ssp: {
    battleChannelId: pick('BATTLE_CHANNEL_ID', 'battleChannelId', null),
  },

  badwordAlert: {
    channelId: process.env.BADWORD_CHANNEL_ID || null,
  },

  bot: {
    logLevel: process.env.LOG_LEVEL || 'info',
    leaderboardChannelId: pick('LEADERBOARD_CHANNEL_ID', 'leaderboardChannelId'),
    punkteChannelId: pick('PUNKTE_CHANNEL_ID', 'punkteChannelId'),
    leaderboardUpdateInterval: 300000,
    leaderboardExcludedUsers: (() => {
      const raw = pick('LEADERBOARD_EXCLUDED_USERS', 'leaderboardExcludedUsers', '');
      return raw ? String(raw).split(',').map((u) => u.trim().toLowerCase()).filter(Boolean) : [];
    })(),
  },

  // Feature-Toggles (Zappify setzt sie anhand aktiver Module)
  features: {
    ssp: pick('FEATURE_SSP', 'featureSsp', 'true') !== 'false',
    bingo: pick('FEATURE_BINGO', 'featureBingo', 'true') !== 'false',
  },

  channels: {
    docs: process.env.DOCS_CHANNEL_ID,
    features: process.env.FEATURES_CHANNEL_ID,
    changelog: process.env.CHANGELOG_CHANNEL_ID,
  },

  docs: {
    pollingInterval: parseInt(process.env.DOCS_POLLING_INTERVAL, 10) || 30000,
  },

  assetSync: {
    pollingInterval: parseInt(process.env.ASSET_SYNC_INTERVAL, 10) || 300000,
    threadIds: {
      hintergrund: process.env.ASSET_THREAD_HINTERGRUND,
      koerper: process.env.ASSET_THREAD_KOERPER,
      kopf: process.env.ASSET_THREAD_KOPF,
      augen: process.env.ASSET_THREAD_AUGEN,
      hut: process.env.ASSET_THREAD_HUT,
      rahmen: process.env.ASSET_THREAD_RAHMEN,
    },
  },

  memeSync: {
    pollingInterval: parseInt(process.env.MEME_SYNC_INTERVAL, 10) || 300000,
    channelId: process.env.MEME_CHANNEL_ID,
    path: process.env.MEME_PATH || '',
  },

  docsForum: {
    channelId: process.env.DOCS_FORUM_CHANNEL_ID,
    changelogThreadId: process.env.DOCS_CHANGELOG_THREAD_ID,
    overviewThreadId: process.env.DOCS_OVERVIEW_THREAD_ID,
  },

  customAvatar: {
    channelId: pick('CUSTOM_AVATAR_CHANNEL_ID', 'customAvatarChannelId'),
    verifyPath: process.env.CUSTOM_AVATAR_VERIFY_PATH,
    maxFileSize: 5 * 1024 * 1024,
    cooldownDays: 7,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  },

  bugfixChannel: {
    channelId: process.env.BUGFIX_CHANNEL_ID || null,
  },

  userImage: {
    enabled: pick('USER_IMAGE_ENABLED', 'userImageEnabled', 'false') !== 'false',
    channels: (() => {
      const raw = pick('USER_IMAGE_CHANNELS', 'userImageChannels', '');
      return raw ? String(raw).split(',').map((c) => c.trim()).filter(Boolean) : [];
    })(),
    moderatorRole: pick('USER_IMAGE_MOD_ROLE', 'userImageModRole', 'Discord Master'),
    triggerEmoji: '📺',
    allowedFormats: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  },
};
