/**
 * Discord Bot für Stream Visualizer / Zappify
 *
 * Zwei Profile (src/botProfile.js, env ZAPPIFY_BOT_PROFILE):
 * - playground: voller Funktionsumfang inkl. Aaronius-eigener Doku-/Sync-Services
 * - customer:   schlank - nur die zuschauer-relevanten Features, kein direkter
 *               users.db-Zugriff, keine Aaronius-Channel-Services
 *
 * Aufruf mit `--deploy` registriert nur die Slash-Commands und beendet sich.
 */

// --deploy: nur Slash-Commands registrieren, dann raus (von Zappify getriggert)
if (process.argv.includes('--deploy')) {
  require('./deploy-commands').run()
    .then((n) => { console.log(`[Deploy] Fertig (${n} Commands).`); process.exit(0); })
    .catch((err) => { console.error('[Deploy] Fehlgeschlagen:', err.message); process.exit(1); });
  return;
}

const { Client, GatewayIntentBits, Collection, Partials, ActivityType } = require('discord.js');
const config = require('./config');
const commandRegistry = require('./commands/_registry');
const botProfile = require('./botProfile');
const ApiClient = require('./services/ApiClient');
const UserService = require('./services/UserService');
const LeaderboardService = require('./services/LeaderboardService');
const BingoService = require('./services/BingoService');
const BingoImageGenerator = require('./services/BingoImageGenerator');
const AccountLinkService = require('./services/AccountLinkService');
const SSPGameManager = require('./services/SSPGameManager');

// ========== BOT INITIALISIERUNG ==========

console.log('========================================');
console.log('   Zappify Discord Bot');
console.log(`   Version 1.0.0  |  Profil: ${botProfile.PROFILE}`);
console.log('========================================\n');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessageReactions,  // Für Live Vote-Sync
    GatewayIntentBits.GuildMessages,          // Für Message-Zugriff bei Reactions
    GatewayIntentBits.MessageContent          // Für Attachments (UserImage-Feature)
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
client.config = config;

// API-Client + Kern-Services (beide Profile)
client.apiClient = new ApiClient(config.api.url, config.api.key);
client.userService = new UserService(client.apiClient, config);
client.leaderboardService = new LeaderboardService(client, config);
client.bingoService = new BingoService(client.apiClient);
client.bingoImageGenerator = new BingoImageGenerator(client.apiClient);
client.accountLinkService = new AccountLinkService(config, client.apiClient);
client.sspGameManager = new SSPGameManager(client, config, client.accountLinkService);

// Aaronius-eigene Services nur im Playground-Profil (lesen visual-Repo-Dateien,
// syncen private Doku-/Feature-/Meme-Channels - beim Kunden toter Code / Fehler-Spam)
let badWordAlertPoller = null;
if (botProfile.isPlayground) {
  const DocsService = require('./services/DocsService');
  const ChangelogQueueProcessor = require('./services/ChangelogQueueProcessor');
  const FeatureChannelService = require('./services/FeatureChannelService');
  const DocStatePoller = require('./services/DocStatePoller');
  const AssetSyncService = require('./services/AssetSyncService');
  const MemeSyncService = require('./services/MemeSyncService');
  const BadWordAlertPoller = require('./services/BadWordAlertPoller');
  const BugFixService = require('./services/BugFixService');

  client.docsService = new DocsService(config);
  client.changelogProcessor = new ChangelogQueueProcessor(client, config);
  client.docStatePoller = new DocStatePoller(client, config);
  client.featureChannelService = new FeatureChannelService(client, config);
  client.assetSyncService = new AssetSyncService(client, config);
  client.memeSyncService = new MemeSyncService(client, config);
  client.bugFixService = new BugFixService(config);
  client.bugFixService.loadState();
  badWordAlertPoller = new BadWordAlertPoller(client, config);
}

// Reaction-Handler (Live Vote-Sync + User-Image + Custom-Avatar) - beide Profile
const reactionHandler = require('./events/reactionHandler');
reactionHandler.register(client);

// ========== COMMAND LOADING ==========

// Im Kunden-Profil sind /docs + /sync-assets reine Aaronius-Produkt-Infra
const CUSTOMER_EXCLUDED_COMMANDS = new Set(['docs.js', 'sync-assets.js']);

console.log('[Bot] Lade Commands...');
for (const { file, command } of commandRegistry) {
  if (botProfile.isCustomer && CUSTOMER_EXCLUDED_COMMANDS.has(file)) continue;
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[Bot] ✅ Command geladen: /${command.data.name}`);
  } else {
    console.warn(`[Bot] ⚠️ Command ${file} fehlt 'data' oder 'execute'`);
  }
}
console.log(`[Bot] ${client.commands.size} Commands geladen\n`);

// ========== BOT-PRESENCE ==========

const PRESENCE_MESSAGES = [
  { text: 'mit Wolpertingern', type: ActivityType.Playing },
  { text: 'Schere-Stein-Papier gegen sich selbst', type: ActivityType.Playing },
  { text: 'auf den nächsten !verify Code', type: ActivityType.Watching },
  { text: 'TTS-Nachrichten beim Ausdenken zu', type: ActivityType.Listening },
  { text: 'Bingo-Karten aus', type: ActivityType.Watching },
  { text: 'die Leaderboard-Punkte zusammen', type: ActivityType.Playing },
  { text: 'euren Wolpertinger beim Wachsen zu', type: ActivityType.Watching },
];

function setRandomPresence() {
  const choice = PRESENCE_MESSAGES[Math.floor(Math.random() * PRESENCE_MESSAGES.length)];
  client.user.setActivity(choice.text, { type: choice.type });
}

// ========== EVENT HANDLERS ==========

client.once('ready', async () => {
  console.log(`[Bot] ✅ Eingeloggt als ${client.user.tag}`);
  console.log(`[Bot] Bot-ID: ${client.user.id}`);
  console.log(`[Bot] Auf ${client.guilds.cache.size} Server(n)\n`);

  console.log('[Bot] Initialisiere UserService...');
  await client.userService.init();

  const stats = client.userService.getStats();
  if (stats.currentMode === 'api') {
    console.log('[Bot] 🟢 Modus: API-Mode (Zappify läuft)');
  } else if (stats.currentMode === 'standalone') {
    console.log('[Bot] 🔴 Modus: Standalone-Mode (Zappify aus)');
  }

  // Leaderboard-Service (beide Profile - braucht nur die Channel-IDs)
  if (config.bot.leaderboardChannelId && config.bot.punkteChannelId) {
    console.log('[Bot] Initialisiere Leaderboard-Service...');
    await client.leaderboardService.start();
    console.log('[Bot] ✅ Leaderboard-Service gestartet');
  } else {
    console.warn('[Bot] ⚠️ Leaderboard-Channels nicht konfiguriert, Service deaktiviert');
  }

  // BingoService Polling (beide Profile)
  console.log('[Bot] Starte BingoService Polling...');
  client.bingoService.startPolling(client);

  // ---- Aaronius-eigene Services (nur Playground) ----
  if (client.docsService) {
    console.log('[Bot] Initialisiere DocsService...');
    await client.docsService.init();
    console.log(`[Bot] ✅ DocsService bereit (${client.docsService.getStats().syncedFeatures} Features)`);
  }
  if (client.changelogProcessor) client.changelogProcessor.start();
  if (client.docStatePoller) client.docStatePoller.start();
  if (client.featureChannelService) {
    await client.featureChannelService.init();
    if (config.channels.features) {
      const syncResult = await client.featureChannelService.syncChannel();
      console.log(`[Bot] ✅ Features gesynct: ${syncResult.synced}/${syncResult.synced + syncResult.errors}`);
    }
  }
  if (client.assetSyncService) client.assetSyncService.start();
  if (client.memeSyncService) client.memeSyncService.start();
  if (badWordAlertPoller) badWordAlertPoller.start();

  setRandomPresence();
  setInterval(setRandomPresence, 15 * 60 * 1000);

  console.log('\n[Bot] 🚀 Bot läuft und ist bereit!\n');
});

// Interaction Handler
client.on('interactionCreate', async (interaction) => {
  if ((interaction.isButton() || interaction.isStringSelectMenu()) &&
      interaction.customId.startsWith('ssp_')) {
    return handleSSPInteraction(interaction, client);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'bingo_mark_event') {
    return handleBingoSelectMenu(interaction, client);
  }

  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;
    try {
      await command.autocomplete(interaction, client);
    } catch (error) {
      console.error(`[Bot] ❌ Fehler beim Autocomplete von /${interaction.commandName}:`, error);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`[Bot] ❌ Unbekannter Command: /${interaction.commandName}`);
    return;
  }

  try {
    console.log(`[Bot] 📨 Command: /${interaction.commandName} | User: ${interaction.user.tag}`);
    await command.execute(interaction, client);
  } catch (error) {
    if (error.code === 10062) {
      console.warn(`[Bot] ⚠️ Stale Interaction /${interaction.commandName} ignoriert (10062)`);
      return;
    }
    console.error(`[Bot] ❌ Fehler bei /${interaction.commandName}:`, error);
    try {
      const errorMessage = 'Es ist ein Fehler aufgetreten beim Ausführen dieses Commands!';
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (err) {
      console.error('[Bot] ❌ Konnte Fehlermeldung nicht senden:', err);
    }
  }
});

client.on('error', (error) => console.error('[Bot] ❌ Discord Client Fehler:', error));
process.on('unhandledRejection', (error) => console.error('[Bot] ❌ Unhandled Promise Rejection:', error));

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('\n[Bot] Shutdown eingeleitet...');
  try { if (client.leaderboardService) await client.leaderboardService.stop(); } catch { /* noop */ }
  try { client.changelogProcessor?.stop(); } catch { /* noop */ }
  try { client.docStatePoller?.stop(); } catch { /* noop */ }
  try { client.assetSyncService?.stop(); } catch { /* noop */ }
  try { client.memeSyncService?.stop(); } catch { /* noop */ }
  try { badWordAlertPoller?.stop(); } catch { /* noop */ }
  await client.destroy();
  console.log('[Bot] ✅ Bot gestoppt');
  process.exit(0);
});

// ========== BINGO SELECT-MENU HANDLER ==========

async function handleBingoSelectMenu(interaction, client) {
  try {
    await interaction.deferUpdate();
    const eventId = interaction.values[0];

    const userData = client.bingoService.userMessages.get(interaction.user.id);
    if (!userData) {
      await interaction.followUp({
        content: '❌ Keine aktive Bingo-Karte gefunden. Starte mit `/bingo start`.',
        ephemeral: true
      });
      return;
    }
    const username = userData.username;
    const result = await client.bingoService.markEvent(username, eventId);

    if (!result.success) {
      await interaction.followUp({ content: `❌ ${result.error || 'Event konnte nicht markiert werden'}`, ephemeral: true });
      return;
    }

    if (result.verified) {
      await interaction.followUp({ content: `✅ Event wurde bestaetigt! Deine Karte wird aktualisiert.`, ephemeral: true });
      try {
        const status = await client.bingoService.getStatus();
        if (status && status.verifiedEvents) {
          await client.bingoService.updateUserCard(client, interaction.user.id, userData, new Set(status.verifiedEvents));
        }
      } catch (updateErr) {
        console.error('[Bot] Bingo Karten-Update Fehler:', updateErr.message);
      }
    } else {
      await interaction.followUp({ content: `⏳ Event gemeldet! Warte auf Bestaetigung vom Streamer...`, ephemeral: true });
    }
  } catch (err) {
    console.error('[Bot] Bingo Select-Menu Fehler:', err);
    try { await interaction.followUp({ content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true }); } catch { /* ignore */ }
  }
}

// ========== SSP INTERACTION HANDLER ==========

async function handleSSPInteraction(interaction, client) {
  const gm = client.sspGameManager;
  const id = interaction.customId;

  try {
    if (interaction.isStringSelectMenu() && id.startsWith('ssp_wc_')) {
      return await gm.handleChallengerWeapon(interaction, id.slice('ssp_wc_'.length), interaction.values[0]);
    }
    if (interaction.isStringSelectMenu() && id.startsWith('ssp_pts_')) {
      return await gm.handlePointsSelect(interaction, id.slice('ssp_pts_'.length), interaction.values[0]);
    }
    if (interaction.isStringSelectMenu() && id.startsWith('ssp_wd_')) {
      return await gm.handleChallengedWeapon(interaction, id.slice('ssp_wd_'.length), interaction.values[0]);
    }
    if (interaction.isButton() && id.startsWith('ssp_confirm_')) {
      return await gm.handleConfirm(interaction, id.slice('ssp_confirm_'.length));
    }
    if (interaction.isButton() && id.startsWith('ssp_accept_')) {
      return await gm.handleAccept(interaction, id.slice('ssp_accept_'.length));
    }
  } catch (err) {
    console.error('[SSP] Interaction-Fehler:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Ein Fehler ist aufgetreten.', ephemeral: true });
      }
    } catch { /* ignore */ }
  }
}

// ========== BOT STARTEN ==========

if (!config.discord.token) {
  console.error('[Bot] ❌ DISCORD_TOKEN fehlt!');
  console.error('[Bot] ❌ Im Kunden-Setup wird der Token von Zappify verwaltet (Discord-Bot-Assistent).');
  console.error('[Bot] ❌ Für den manuellen Betrieb: .env aus .env.example anlegen.');
  process.exit(1);
}

client.login(config.discord.token).catch((err) => {
  console.error('[Bot] ❌ Login fehlgeschlagen:', err.message);
  console.error('[Bot] ❌ Ist der DISCORD_TOKEN korrekt?');
  process.exit(1);
});
