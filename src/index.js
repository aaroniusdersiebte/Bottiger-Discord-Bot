/**
 * Discord Bot für Stream Visualizer
 *
 * Features:
 * - Wolpertinger Customization
 * - Stats & Punkte-Abfragen
 * - Leaderboards (zukünftig)
 * - Erweiterbar für weitere Commands
 */

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const ApiClient = require('./services/ApiClient');
const UserService = require('./services/UserService');
const LeaderboardService = require('./services/LeaderboardService');
const DocsService = require('./services/DocsService');
const ChangelogQueueProcessor = require('./services/ChangelogQueueProcessor');
const FeatureChannelService = require('./services/FeatureChannelService');
const DocStatePoller = require('./services/DocStatePoller');
const BingoService = require('./services/BingoService');
const BingoImageGenerator = require('./services/BingoImageGenerator');
const AssetSyncService = require('./services/AssetSyncService');
const MemeSyncService = require('./services/MemeSyncService');
const AccountLinkService = require('./services/AccountLinkService');
const SSPGameManager = require('./services/SSPGameManager');
const BadWordAlertPoller = require('./services/BadWordAlertPoller');
const BugFixService = require('./services/BugFixService');

// ========== BOT INITIALISIERUNG ==========

console.log('========================================');
console.log('   Stream Visualizer Discord Bot');
console.log('   Version 1.0.0');
console.log('========================================\n');

// Discord Client erstellen
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessageReactions,  // Für Live Vote-Sync
    GatewayIntentBits.GuildMessages,          // Für Message-Zugriff bei Reactions
    GatewayIntentBits.MessageContent          // Für Attachments (UserImage-Feature)
  ],
  partials: ['MESSAGE', 'REACTION']           // Für Reactions auf ältere Nachrichten
});

// Commands Collection
client.commands = new Collection();

// Config an Client hängen (für Commands)
client.config = config;

// API-Client initialisieren
client.apiClient = new ApiClient(config.api.url, config.api.key);

// UserService initialisieren (Dual-Mode)
client.userService = new UserService(client.apiClient, config);

// LeaderboardService initialisieren
client.leaderboardService = new LeaderboardService(client, config);

// DocsService initialisieren (Dokumentations-System)
client.docsService = new DocsService(config);

// ChangelogQueueProcessor initialisieren (Changelog-Posting)
client.changelogProcessor = new ChangelogQueueProcessor(client, config);

// DocStatePoller initialisieren (autonomer Docs-Watcher)
client.docStatePoller = new DocStatePoller(client, config);

// FeatureChannelService initialisieren (Feature-Dokumentation)
client.featureChannelService = new FeatureChannelService(client, config);


// BingoService initialisieren (Stream-Bingo)
client.bingoService = new BingoService(client.apiClient);
client.bingoImageGenerator = new BingoImageGenerator();

// AssetSyncService initialisieren (Forum-Asset-Sync)
client.assetSyncService = new AssetSyncService(client, config);

// MemeSyncService initialisieren (Meme-Channel-Sync)
client.memeSyncService = new MemeSyncService(client, config);

// AccountLinkService initialisieren (Discord↔Twitch Verknüpfung)
client.accountLinkService = new AccountLinkService(config);

// SSPGameManager initialisieren (Schere-Stein-Papier)
client.sspGameManager = new SSPGameManager(client, config, client.accountLinkService);

// BugFixService initialisieren
client.bugFixService = new BugFixService(config);
client.bugFixService.loadState();

// BadWordAlertPoller initialisieren (pollt Visual API auf blockierte Nachrichten)
const badWordAlertPoller = new BadWordAlertPoller(client, config);

// Reaction-Handler registrieren (für Live Vote-Sync)
const reactionHandler = require('./events/reactionHandler');
reactionHandler.register(client);

// ========== COMMAND LOADING ==========

console.log('[Bot] Lade Commands...');

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  // Prüfen: Command hat data & execute?
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[Bot] ✅ Command geladen: /${command.data.name}`);
  } else {
    console.warn(`[Bot] ⚠️ Command ${file} fehlt 'data' oder 'execute'`);
  }
}

console.log(`[Bot] ${client.commands.size} Commands geladen\n`);

// ========== EVENT HANDLERS ==========

// Bot bereit
client.once('ready', async () => {
  console.log(`[Bot] ✅ Eingeloggt als ${client.user.tag}`);
  console.log(`[Bot] Bot-ID: ${client.user.id}`);
  console.log(`[Bot] Auf ${client.guilds.cache.size} Server(n)\n`);

  // UserService initialisieren
  console.log('[Bot] Initialisiere UserService...');
  await client.userService.init();

  // Modus anzeigen
  const stats = client.userService.getStats();
  if (stats.currentMode === 'api') {
    console.log('[Bot] 🟢 Modus: API-Mode (Visualizer läuft)');
  } else if (stats.currentMode === 'standalone') {
    console.log('[Bot] 🔴 Modus: Standalone-Mode (Visualizer aus)');
  }

  // Leaderboard-Service starten
  if (config.bot.leaderboardChannelId && config.bot.punkteChannelId) {
    console.log('[Bot] Initialisiere Leaderboard-Service...');
    await client.leaderboardService.start();
    console.log('[Bot] ✅ Leaderboard-Service gestartet');
  } else {
    console.warn('[Bot] ⚠️ Leaderboard-Channels nicht konfiguriert, Service deaktiviert');
  }

  // DocsService initialisieren
  console.log('[Bot] Initialisiere DocsService...');
  await client.docsService.init();
  const docsStats = client.docsService.getStats();
  console.log(`[Bot] ✅ DocsService bereit (${docsStats.syncedFeatures} Features synced)`);

  // ChangelogQueueProcessor starten
  console.log('[Bot] Starte ChangelogQueueProcessor...');
  client.changelogProcessor.start();

  // DocStatePoller starten (autonomer Docs-Watcher)
  console.log('[Bot] Starte DocStatePoller...');
  client.docStatePoller.start();

  // FeatureChannelService initialisieren und Channel syncen
  console.log('[Bot] Initialisiere FeatureChannelService...');
  await client.featureChannelService.init();
  const featureStats = client.featureChannelService.getStats();
  console.log(`[Bot] ✅ FeatureChannelService bereit (${featureStats.syncedFeatures} Features synced)`);

  // Features zu Discord syncen
  if (config.channels.features) {
    console.log('[Bot] Synce Features zu Discord...');
    const syncResult = await client.featureChannelService.syncChannel();
    console.log(`[Bot] ✅ Features gesynct: ${syncResult.synced}/${syncResult.synced + syncResult.errors}`);
  } else {
    console.warn('[Bot] ⚠️ Features-Channel nicht konfiguriert, Service deaktiviert');
  }

  // BingoService Polling starten
  console.log('[Bot] Starte BingoService Polling...');
  client.bingoService.startPolling(client);
  console.log('[Bot] ✅ BingoService Polling gestartet');

  // AssetSync Polling starten
  console.log('[Bot] Starte AssetSync Polling...');
  client.assetSyncService.start();

  // MemeSync Polling starten
  console.log('[Bot] Starte MemeSync Polling...');
  client.memeSyncService.start();

  // BadWordAlertPoller starten
  badWordAlertPoller.start();

  console.log('\n[Bot] 🚀 Bot läuft und ist bereit!\n');
});

// Interaction Handler
client.on('interactionCreate', async interaction => {
  // SSP Button & Select-Menu Interactions
  if ((interaction.isButton() || interaction.isStringSelectMenu()) &&
      interaction.customId.startsWith('ssp_')) {
    await handleSSPInteraction(interaction, client);
    return;
  }

  // Bingo Select-Menu Interactions
  if (interaction.isStringSelectMenu() && interaction.customId === 'bingo_mark_event') {
    await handleBingoSelectMenu(interaction, client);
    return;
  }

  // Autocomplete-Interactions
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      return;
    }

    try {
      await command.autocomplete(interaction, client);
    } catch (error) {
      console.error(`[Bot] ❌ Fehler beim Autocomplete von /${interaction.commandName}:`, error);
    }
    return;
  }

  // Slash-Command Interactions
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`[Bot] ❌ Unbekannter Command: /${interaction.commandName}`);
    return;
  }

  try {
    console.log(`[Bot] 📨 Command ausgeführt: /${interaction.commandName} | User: ${interaction.user.tag}`);
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`[Bot] ❌ Fehler beim Ausführen von /${interaction.commandName}:`, error);

    const errorMessage = 'Es ist ein Fehler aufgetreten beim Ausführen dieses Commands!';

    try {
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

// Fehler-Handler
client.on('error', error => {
  console.error('[Bot] ❌ Discord Client Fehler:', error);
});

process.on('unhandledRejection', error => {
  console.error('[Bot] ❌ Unhandled Promise Rejection:', error);
});

// ========== BOT STARTEN ==========

// Graceful Shutdown
process.on('SIGINT', async () => {
  console.log('\n[Bot] Shutdown eingeleitet...');
  if (client.leaderboardService) {
    await client.leaderboardService.stop();
  }
  if (client.changelogProcessor) {
    client.changelogProcessor.stop();
  }
  if (client.docStatePoller) {
    client.docStatePoller.stop();
  }
  if (client.assetSyncService) {
    client.assetSyncService.stop();
  }
  if (client.memeSyncService) {
    client.memeSyncService.stop();
  }
  badWordAlertPoller.stop();
  await client.destroy();
  console.log('[Bot] ✅ Bot gestoppt');
  process.exit(0);
});

// ========== BINGO SELECT-MENU HANDLER ==========

async function handleBingoSelectMenu(interaction, client) {
  try {
    await interaction.deferUpdate();

    const eventId = interaction.values[0];

    // Gespeicherten Twitch/YouTube Username holen
    const userData = client.bingoService.userMessages.get(interaction.user.id);
    if (!userData) {
      await interaction.followUp({
        content: '❌ Keine aktive Bingo-Karte gefunden. Starte mit `/bingo start`.',
        ephemeral: true
      });
      return;
    }
    const username = userData.username;

    // Event markieren
    const result = await client.bingoService.markEvent(username, eventId);

    if (!result.success) {
      await interaction.followUp({
        content: `❌ ${result.error || 'Event konnte nicht markiert werden'}`,
        ephemeral: true
      });
      return;
    }

    if (result.verified) {
      await interaction.followUp({
        content: `✅ Event wurde bestaetigt! Deine Karte wird aktualisiert.`,
        ephemeral: true
      });

      // Bild direkt aktualisieren (nicht auf Polling warten)
      try {
        const status = await client.bingoService.getStatus();
        if (status && status.verifiedEvents) {
          const verifiedEvents = new Set(status.verifiedEvents);
          await client.bingoService.updateUserCard(client, interaction.user.id, userData, verifiedEvents);
        }
      } catch (updateErr) {
        console.error('[Bot] Bingo Karten-Update Fehler:', updateErr.message);
      }
    } else {
      await interaction.followUp({
        content: `⏳ Event gemeldet! Warte auf Bestaetigung vom Streamer...`,
        ephemeral: true
      });
    }

  } catch (err) {
    console.error('[Bot] Bingo Select-Menu Fehler:', err);
    try {
      await interaction.followUp({
        content: '❌ Ein Fehler ist aufgetreten.',
        ephemeral: true
      });
    } catch (e) {
      // Ignore
    }
  }
}

// ========== SSP INTERACTION HANDLER ==========

async function handleSSPInteraction(interaction, client) {
  const gm = client.sspGameManager;
  const id = interaction.customId;

  try {
    // Waffenwahl Challenger: ssp_wc_${gameId}
    if (interaction.isStringSelectMenu() && id.startsWith('ssp_wc_')) {
      const gameId = id.slice('ssp_wc_'.length);
      return await gm.handleChallengerWeapon(interaction, gameId, interaction.values[0]);
    }

    // Punkte-Einsatz: ssp_pts_${gameId}
    if (interaction.isStringSelectMenu() && id.startsWith('ssp_pts_')) {
      const gameId = id.slice('ssp_pts_'.length);
      return await gm.handlePointsSelect(interaction, gameId, interaction.values[0]);
    }

    // Waffenwahl Akzeptierender: ssp_wd_${gameId} — VOR ssp_confirm prüfen da kein Konflikt, aber Konsistenz
    if (interaction.isStringSelectMenu() && id.startsWith('ssp_wd_')) {
      const gameId = id.slice('ssp_wd_'.length);
      return await gm.handleChallengedWeapon(interaction, gameId, interaction.values[0]);
    }

    // Confirm (Challenge posten): ssp_confirm_${gameId}
    if (interaction.isButton() && id.startsWith('ssp_confirm_')) {
      const gameId = id.slice('ssp_confirm_'.length);
      return await gm.handleConfirm(interaction, gameId);
    }

    // Accept (offene Challenge annehmen): ssp_accept_${gameId}
    if (interaction.isButton() && id.startsWith('ssp_accept_')) {
      const gameId = id.slice('ssp_accept_'.length);
      return await gm.handleAccept(interaction, gameId);
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

// Token-Validierung
if (!config.discord.token) {
  console.error('[Bot] ❌ DISCORD_TOKEN fehlt in .env!');
  console.error('[Bot] ❌ Bitte erstelle eine .env Datei basierend auf .env.example');
  process.exit(1);
}

if (!config.api.key) {
  console.warn('[Bot] ⚠️ API_KEY fehlt in .env!');
  console.warn('[Bot] ⚠️ API-Requests werden möglicherweise fehlschlagen.');
}

// Bot einloggen
client.login(config.discord.token).catch(err => {
  console.error('[Bot] ❌ Login fehlgeschlagen:', err.message);
  console.error('[Bot] ❌ Ist dein DISCORD_TOKEN korrekt?');
  process.exit(1);
});
