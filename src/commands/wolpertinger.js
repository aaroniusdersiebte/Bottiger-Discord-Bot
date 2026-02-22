/**
 * Wolpertinger Command - Charakter-Customization
 *
 * Subcommands:
 * - /wolpertinger customize - Charakter anpassen
 * - /wolpertinger upload - Custom-Avatar hochladen
 */

const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { validateImage } = require('../utils/ImageValidator');
const naturalSort = require('../utils/naturalSort');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wolpertinger')
    .setDescription('Wolpertinger-Charakter verwalten')
    .addSubcommand(subcommand =>
      subcommand
        .setName('customize')
        .setDescription('Passe deinen Wolpertinger-Charakter an')
        .addStringOption(option =>
          option
            .setName('username')
            .setDescription('Dein Twitch/YouTube Username')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('upload')
        .setDescription('Lade ein eigenes Wolpertinger-Bild hoch')
        .addStringOption(option =>
          option
            .setName('username')
            .setDescription('Dein Twitch/YouTube Username')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addAttachmentOption(option =>
          option
            .setName('bild')
            .setDescription('Dein Custom-Avatar (PNG/JPG/GIF/WEBP, max 5MB)')
            .setRequired(true)
        )
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'customize') {
      await handleCustomize(interaction, client);
    } else if (subcommand === 'upload') {
      await handleUpload(interaction, client);
    }
  },

  async autocomplete(interaction, client) {
    const focusedValue = interaction.options.getFocused();

    // Discord-Username als Standard-Vorschlag
    const suggestions = [interaction.user.username];

    // Versuche User aus users.json zu laden (Standalone-Mode)
    try {
      const fs = require('fs');
      const config = client.userService.config;

      if (fs.existsSync(config.paths.usersJson)) {
        const usersData = JSON.parse(fs.readFileSync(config.paths.usersJson, 'utf8'));
        const usernames = Object.keys(usersData);

        // Filter basierend auf Eingabe
        const filtered = usernames
          .filter(name => name.toLowerCase().includes(focusedValue.toLowerCase()))
          .slice(0, 24); // Max 25 Optionen (1 ist Discord-Username)

        // Hinzufügen zu Vorschlägen (ohne Duplikate)
        for (const username of filtered) {
          if (!suggestions.includes(username)) {
            suggestions.push(username);
          }
        }
      }
    } catch (err) {
      console.error('[Wolpertinger] Autocomplete-Fehler:', err);
      // Fortfahren mit nur Discord-Username
    }

    // Max 25 Vorschläge
    const results = suggestions.slice(0, 25).map(name => ({
      name: name,
      value: name
    }));

    await interaction.respond(results);
  }
};

/**
 * /wolpertinger customize
 */
async function handleCustomize(interaction, client) {
  const username = interaction.options.getString('username');

  // Defer reply (Customization dauert)
  await interaction.deferReply({ ephemeral: true });

  try {
    // Cooldown-Check
    const cooldownCheck = await client.userService.canCustomizeCharacter(username);
    if (!cooldownCheck.canPerform) {
      await interaction.editReply({
        content: `⏱️ **Cooldown aktiv!**\n\nDu kannst deinen Wolpertinger erst in **${cooldownCheck.remainingHours} Stunde(n)** wieder anpassen.\n\nLetztes Mal: <t:${Math.floor((Date.now() - cooldownCheck.remainingTime) / 1000)}:R>`,
        components: []
      });
      return;
    }

    // Assets abrufen (automatisch API oder File-Access)
    console.log(`[Wolpertinger] Lade Assets für ${username}...`);
    const assets = await client.userService.getAssets();

    // Customization-State
    const customizationState = {
      username: username,
      userId: interaction.user.id,
      selections: {
        hintergrund: null,
        koerper: null,
        kopf: null,
        augen: null,
        hut: null,
        rahmen: null
      },
      currentStep: 0
    };

    // Schritte definieren
    const steps = ['hintergrund', 'koerper', 'kopf', 'augen', 'hut', 'rahmen'];

    // Erste Auswahl: Hintergrund
    await showSelectionStep(interaction, customizationState, assets, steps);

  } catch (err) {
    console.error('[Wolpertinger] Fehler:', err);
    await interaction.editReply({
      content: `❌ Fehler: ${err.message}`,
      components: []
    });
  }
}

/**
 * Zeigt einen Auswahl-Schritt (Select-Menu) mit Preview
 */
async function showSelectionStep(interaction, state, assets, steps) {
  const currentCategory = steps[state.currentStep];
  const availableAssets = (assets[currentCategory] || []).slice().sort(naturalSort);

  if (availableAssets.length === 0) {
    await interaction.editReply({
      content: `❌ Keine Assets für Kategorie "${currentCategory}" verfügbar!`,
      components: []
    });
    return;
  }

  // Select-Menu erstellen (max 25 Optionen in Discord)
  const options = [
    { label: '🎲 Zufällig', value: 'random', description: `Zufälliger ${currentCategory}` }
  ];

  // Assets hinzufügen (max 24, da "Zufällig" schon 1 ist)
  const maxAssets = Math.min(availableAssets.length, 24);
  for (let i = 0; i < maxAssets; i++) {
    const asset = availableAssets[i];
    options.push({
      label: asset.replace('.png', '').replace('.jpg', ''),
      value: asset
    });
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`select_${currentCategory}_${state.userId}`)
        .setPlaceholder(`Wähle ${currentCategory}`)
        .addOptions(options)
    );

  // Fortschritt anzeigen
  let progress = `**Wolpertinger-Anpassung für ${state.username}**\n\nSchritt ${state.currentStep + 1}/6: Wähle **${currentCategory}**`;

  // Bisherige Auswahl anzeigen
  if (state.currentStep > 0) {
    progress += '\n\n**Bisherige Auswahl:**\n';
    const completedSteps = steps.slice(0, state.currentStep);
    for (const step of completedSteps) {
      const asset = state.selections[step];
      const displayName = asset === 'random' ? '🎲 Zufällig' : asset.replace('.png', '').replace('.jpg', '');
      progress += `• ${step}: ${displayName}\n`;
    }
  }

  // Preview generieren (wenn mindestens 1 Asset gewählt)
  let previewBuffer = null;
  if (state.currentStep > 0) {
    try {
      const imageGenerator = interaction.client.userService.getImageGenerator();
      const assetManager = interaction.client.userService.getAssetManager();

      console.log('[Wolpertinger] Generiere Preview...');
      previewBuffer = await imageGenerator.generatePreview(state.selections, assetManager);
    } catch (err) {
      console.error('[Wolpertinger] Preview-Generierung fehlgeschlagen:', err);
      // Fortfahren ohne Preview
    }
  }

  // Nachricht mit oder ohne Preview senden
  const replyOptions = {
    content: progress,
    components: [row],
    files: []
  };

  if (previewBuffer) {
    replyOptions.files.push({
      attachment: previewBuffer,
      name: 'preview.png'
    });
  }

  if (state.currentStep === 0) {
    // Erste Nachricht
    await interaction.editReply(replyOptions);
  } else {
    // Update bestehende Nachricht
    await interaction.editReply(replyOptions);
  }

  // Collector für Select-Menu
  const collector = interaction.channel.createMessageComponentCollector({
    filter: i => i.user.id === state.userId && i.customId.startsWith('select_'),
    time: 300000, // 5 Minuten
    max: 1 // Nur eine Auswahl
  });

  collector.on('collect', async i => {
    await i.deferUpdate();

    // Auswahl speichern
    state.selections[currentCategory] = i.values[0];
    state.currentStep++;

    // Nächster Schritt oder Bestätigung?
    if (state.currentStep < steps.length) {
      // Nächste Kategorie
      await showSelectionStep(interaction, state, assets, steps);
    } else {
      // Alle Kategorien fertig → Bestätigung
      await showConfirmation(interaction, state);
    }
  });

  collector.on('end', collected => {
    if (collected.size === 0) {
      interaction.editReply({
        content: '⏱️ Anpassung abgelaufen (Timeout nach 5 Minuten).',
        components: []
      }).catch(() => {});
    }
  });
}

/**
 * Zeigt Bestätigungs-Buttons mit finaler Preview
 */
async function showConfirmation(interaction, state) {
  // Zusammenfassung erstellen
  let summary = `**Deine Auswahl:**\n`;
  for (const [category, asset] of Object.entries(state.selections)) {
    const displayAsset = asset === 'random' ? '🎲 Zufällig' : asset.replace('.png', '').replace('.jpg', '');
    summary += `• ${category}: ${displayAsset}\n`;
  }

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_${state.userId}`)
        .setLabel('✅ Bestätigen')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cancel_${state.userId}`)
        .setLabel('❌ Abbrechen')
        .setStyle(ButtonStyle.Danger)
    );

  // Finale Preview generieren (mit zufälligem Mund)
  let previewBuffer = null;
  try {
    const imageGenerator = interaction.client.userService.getImageGenerator();
    const assetManager = interaction.client.userService.getAssetManager();

    // Zufälligen Mund hinzufügen
    const mundAssets = assetManager.assetCache.get('mund') || [];
    if (mundAssets.length > 0) {
      state.selections.mund = mundAssets[Math.floor(Math.random() * mundAssets.length)];
      console.log('[Wolpertinger] Zufälliger Mund gewählt:', state.selections.mund);
    }

    console.log('[Wolpertinger] Generiere finale Preview...');
    previewBuffer = await imageGenerator.generateCharacter(state.selections, assetManager);
  } catch (err) {
    console.error('[Wolpertinger] Finale Preview-Generierung fehlgeschlagen:', err);
    // Fortfahren ohne Preview
  }

  const replyOptions = {
    content: `**Wolpertinger-Anpassung für ${state.username}**\n\n${summary}\nBist du zufrieden mit dieser Auswahl?`,
    components: [row],
    files: []
  };

  if (previewBuffer) {
    replyOptions.files.push({
      attachment: previewBuffer,
      name: 'final-preview.png'
    });
  }

  await interaction.editReply(replyOptions);

  // Collector für Buttons
  const collector = interaction.channel.createMessageComponentCollector({
    filter: i => i.user.id === state.userId && (i.customId === `confirm_${state.userId}` || i.customId === `cancel_${state.userId}`),
    time: 60000, // 1 Minute
    max: 1
  });

  collector.on('collect', async i => {
    await i.deferUpdate();

    if (i.customId === `confirm_${state.userId}`) {
      // Bestätigung → Code generieren
      await generateVerificationCode(interaction, state);
    } else {
      // Abbruch
      await interaction.editReply({
        content: '❌ Anpassung abgebrochen.',
        components: []
      });
    }
  });

  collector.on('end', collected => {
    if (collected.size === 0) {
      interaction.editReply({
        content: '⏱️ Bestätigung abgelaufen (Timeout).',
        components: []
      }).catch(() => {});
    }
  });
}

/**
 * Generiert Verifizierungs-Code
 */
async function generateVerificationCode(interaction, state) {
  try {
    // Code erstellen (automatisch API oder Standalone)
    console.log(`[Wolpertinger] Erstelle Code für ${state.username}...`);
    const result = await interaction.client.userService.createVerificationCode(
      state.username,
      state.selections
    );

    const expiryDate = new Date(result.expiresAt);
    const expiryTime = Math.floor(expiryDate.getTime() / 1000); // Unix-Timestamp

    await interaction.editReply({
      content: `**✅ Anpassung gespeichert!**\n\n` +
               `**Verifizierungs-Code:** \`${result.code}\`\n\n` +
               `Schreibe im **Twitch/YouTube Chat**:\n` +
               `\`!verify ${result.code}\`\n\n` +
               `⏰ Code läuft ab: <t:${expiryTime}:R>`,
      components: []
    });

    console.log(`[Wolpertinger] ✅ Code erstellt: ${result.code} | User: ${state.username}`);

  } catch (err) {
    console.error('[Wolpertinger] Code-Generierung fehlgeschlagen:', err);
    await interaction.editReply({
      content: `❌ Fehler beim Erstellen des Codes: ${err.message}`,
      components: []
    });
  }
}

/**
 * /wolpertinger upload
 */
async function handleUpload(interaction, client) {
  const username = interaction.options.getString('username');
  const attachment = interaction.options.getAttachment('bild');
  const config = client.config;

  // Channel konfiguriert?
  if (!config.customAvatar?.channelId) {
    await interaction.reply({
      content: '❌ Custom-Avatar-Feature ist nicht konfiguriert.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // 1. Cooldown-Check
    console.log(`[Wolpertinger] Upload: Cooldown-Check für ${username}...`);
    const cooldownCheck = await client.userService.canUploadCustomAvatar(username);
    if (!cooldownCheck.canPerform) {
      await interaction.editReply({
        content: `⏱️ **Cooldown aktiv!**\n\nDu kannst erst in **${cooldownCheck.remainingDays} Tag(en)** wieder einen Custom-Avatar hochladen.`
      });
      return;
    }

    // 2. Größen-Check
    const maxSize = config.customAvatar.maxFileSize;
    if (attachment.size > maxSize) {
      const maxMB = (maxSize / 1024 / 1024).toFixed(1);
      const actualMB = (attachment.size / 1024 / 1024).toFixed(1);
      await interaction.editReply({
        content: `❌ **Datei zu groß!**\n\nDeine Datei: ${actualMB}MB\nMaximal erlaubt: ${maxMB}MB`
      });
      return;
    }

    // 3. Bild herunterladen und validieren
    console.log(`[Wolpertinger] Upload: Lade Bild von ${attachment.url}...`);
    let imageBuffer;
    try {
      imageBuffer = await downloadImage(attachment.url);
    } catch (downloadErr) {
      console.error('[Wolpertinger] Download-Fehler:', downloadErr);
      await interaction.editReply({
        content: '❌ Konnte das Bild nicht herunterladen. Bitte versuche es erneut.'
      });
      return;
    }

    // 4. Magic-Byte-Validierung
    const validation = validateImage(imageBuffer, maxSize);
    if (!validation.valid) {
      await interaction.editReply({
        content: `❌ **Ungültiges Bild!**\n\n${validation.error}\n\nErlaubte Formate: PNG, JPG, GIF, WEBP`
      });
      return;
    }

    console.log(`[Wolpertinger] Upload: Bild validiert als ${validation.format}`);

    // 5. Verification erstellen
    const result = await client.userService.createCustomAvatarVerification(
      username,
      interaction.user.id,
      null // tempFilePath wird nach dem Speichern aktualisiert
    );

    // 6. Bild in verify-Ordner speichern
    const verifyPath = config.customAvatar.verifyPath || path.join(config.paths.visualizer, 'verify');
    const fileName = `${result.code}_${username.toLowerCase()}${validation.extension}`;
    const filePath = path.join(verifyPath, fileName);

    // Ordner erstellen falls nicht vorhanden
    if (!fs.existsSync(verifyPath)) {
      fs.mkdirSync(verifyPath, { recursive: true });
      console.log(`[Wolpertinger] Upload: Ordner erstellt: ${verifyPath}`);
    }

    fs.writeFileSync(filePath, imageBuffer);
    console.log(`[Wolpertinger] Upload: Bild gespeichert: ${filePath}`);

    // 7. Embed erstellen und in Channel senden
    const channel = await client.channels.fetch(config.customAvatar.channelId);
    if (!channel) {
      await interaction.editReply({
        content: '❌ Custom-Avatar-Channel nicht gefunden. Bitte Admin kontaktieren.'
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🎨 Custom-Avatar Anfrage')
      .setColor(0x9B59B6)
      .addFields(
        { name: 'Username', value: username.toLowerCase(), inline: true },
        { name: 'Discord', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Code', value: `\`${result.code}\``, inline: true },
        { name: 'Format', value: validation.format.toUpperCase(), inline: true },
        { name: 'Größe', value: `${(attachment.size / 1024).toFixed(1)} KB`, inline: true },
        { name: 'Datei', value: fileName, inline: true }
      )
      .setImage(attachment.url)
      .setFooter({ text: 'Reagiere mit ✅ (genehmigen) oder ❌ (ablehnen)' })
      .setTimestamp();

    const channelMessage = await channel.send({ embeds: [embed] });

    // 8. Message-ID speichern für Reaction-Tracking
    client.userService.updateVerificationMessageId(result.code, channelMessage.id);

    // 9. Code an User zurückgeben
    const expiryTime = Math.floor(result.expiresAt / 1000);
    await interaction.editReply({
      content: `**🎨 Custom-Avatar eingereicht!**\n\n` +
               `**Verifizierungs-Code:** \`${result.code}\`\n\n` +
               `Schreibe im **Twitch/YouTube Chat**:\n` +
               `\`!verify ${result.code}\`\n\n` +
               `⏰ Code läuft ab: <t:${expiryTime}:R>\n\n` +
               `📋 Dein Bild wird geprüft. Du erhältst eine Nachricht sobald es genehmigt oder abgelehnt wurde.`
    });

    console.log(`[Wolpertinger] ✅ Custom-Avatar Upload erfolgreich: ${result.code} | User: ${username}`);

  } catch (err) {
    console.error('[Wolpertinger] Upload-Fehler:', err);
    await interaction.editReply({
      content: `❌ Fehler: ${err.message}`
    });
  }
}

/**
 * Lädt ein Bild von einer URL herunter
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      // Redirect folgen
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(response.headers.location).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}
