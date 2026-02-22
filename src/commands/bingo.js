/**
 * Bingo Command - Stream-Bingo via Discord
 *
 * Subcommands:
 * - /bingo start - Bingo-Karte anfordern
 * - /bingo win <username> <platform> - Gewinn melden
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bingo')
    .setDescription('Stream-Bingo spielen')
    .addSubcommand(subcommand =>
      subcommand
        .setName('start')
        .setDescription('Fordere deine Bingo-Karte an')
        .addStringOption(option =>
          option
            .setName('username')
            .setDescription('Dein Twitch/YouTube Username')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('platform')
            .setDescription('Deine Streaming-Platform')
            .setRequired(true)
            .addChoices(
              { name: 'Twitch', value: 'twitch' },
              { name: 'YouTube', value: 'youtube' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('win')
        .setDescription('Melde deinen Bingo-Gewinn')
        .addStringOption(option =>
          option
            .setName('username')
            .setDescription('Dein Twitch/YouTube Username')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('platform')
            .setDescription('Deine Streaming-Platform')
            .setRequired(true)
            .addChoices(
              { name: 'Twitch', value: 'twitch' },
              { name: 'YouTube', value: 'youtube' }
            )
        )
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
      await handleStart(interaction, client);
    } else if (subcommand === 'win') {
      await handleWin(interaction, client);
    }
  }
};

/**
 * /bingo start - Bingo-Karte anfordern
 */
async function handleStart(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Pruefen ob Bingo-Service verfuegbar
    if (!client.bingoService) {
      await interaction.editReply({
        content: '❌ Bingo-Service nicht verfuegbar. Bitte spaeter versuchen.',
        ephemeral: true
      });
      return;
    }

    // Status pruefen
    const status = await client.bingoService.getStatus();

    if (!status || !status.active) {
      await interaction.editReply({
        content: '❌ Aktuell laeuft keine Bingo-Runde. Warte auf den Stream-Start!',
        ephemeral: true
      });
      return;
    }

    // Karte generieren mit Twitch/YouTube Username
    const username = interaction.options.getString('username');
    const platform = interaction.options.getString('platform');
    const cardResult = await client.bingoService.generateCard(username, platform);

    if (!cardResult.success) {
      // User hat bereits eine Karte
      const existingCard = await client.bingoService.getUserCard(username);
      if (existingCard) {
        await sendCardMessage(interaction, existingCard, client, username);
        return;
      }

      await interaction.editReply({
        content: `❌ Fehler: ${cardResult.error || 'Karte konnte nicht erstellt werden'}`,
        ephemeral: true
      });
      return;
    }

    // Karte senden
    await sendCardMessage(interaction, cardResult, client, username);

  } catch (err) {
    console.error('[Bingo Command] Start-Fehler:', err);
    await interaction.editReply({
      content: '❌ Ein Fehler ist aufgetreten. Ist der Stream Visualizer aktiv?',
      ephemeral: true
    });
  }
}

/**
 * Sendet die Bingo-Karte als DM
 */
async function sendCardMessage(interaction, cardData, client, username) {
  try {
    // Bild generieren
    const imageBuffer = await client.bingoImageGenerator.generate(
      cardData.card,
      [], // markedEvents
      []  // verifiedEvents
    );

    // Embed erstellen
    const embed = new EmbedBuilder()
      .setColor(0x34c759)
      .setTitle('🎯 Deine Bingo-Karte')
      .setDescription(`Spieler: **${username}**\nWaehle Events aus dem Menue wenn sie im Stream passieren!`)
      .setImage('attachment://bingo-card.png')
      .setFooter({ text: `Karten-ID: ${cardData.cardId}` })
      .setTimestamp();

    // Select-Menu fuer Events erstellen
    const selectMenu = createEventSelectMenu(cardData.card);

    // An User senden (DM)
    try {
      const dmChannel = await interaction.user.createDM();

      const message = await dmChannel.send({
        embeds: [embed],
        files: [{ attachment: imageBuffer, name: 'bingo-card.png' }],
        components: selectMenu ? [selectMenu] : []
      });

      // Message-ID speichern fuer Updates (Twitch/YouTube Username)
      await client.bingoService.registerUserMessage(
        interaction.user.id,
        message.id,
        dmChannel.id,
        cardData.cardId,
        username
      );

      // Polling starten falls noch nicht aktiv
      client.bingoService.startPolling(client);

      await interaction.editReply({
        content: '✅ Deine Bingo-Karte wurde dir per DM gesendet!',
        ephemeral: true
      });

    } catch (dmError) {
      // DMs blockiert
      await interaction.editReply({
        content: '❌ Konnte keine DM senden. Bitte aktiviere DMs von Server-Mitgliedern!',
        ephemeral: true
      });
    }

  } catch (err) {
    console.error('[Bingo Command] Karten-Sende-Fehler:', err);
    await interaction.editReply({
      content: '❌ Fehler beim Erstellen der Karte.',
      ephemeral: true
    });
  }
}

/**
 * Erstellt Select-Menu fuer Event-Auswahl
 */
function createEventSelectMenu(card) {
  if (!card || !Array.isArray(card)) return null;

  // Alle Events aus der Karte extrahieren
  const events = [];
  card.forEach((row, rowIndex) => {
    row.forEach((event, colIndex) => {
      events.push({
        id: event.id,
        text: event.text,
        position: `${rowIndex + 1}-${colIndex + 1}`
      });
    });
  });

  // Max 25 Optionen im Select-Menu
  const options = events.slice(0, 25).map(event => ({
    label: truncateText(event.text, 100),
    description: `Position: ${event.position}`,
    value: event.id
  }));

  if (options.length === 0) return null;

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('bingo_mark_event')
    .setPlaceholder('Event ist passiert? Hier auswaehlen...')
    .addOptions(options);

  return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * /bingo win - Gewinn melden
 */
async function handleWin(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const username = interaction.options.getString('username');
    const platform = interaction.options.getString('platform');

    if (!client.bingoService) {
      await interaction.editReply({
        content: '❌ Bingo-Service nicht verfuegbar.',
        ephemeral: true
      });
      return;
    }

    // Status pruefen
    const status = await client.bingoService.getStatus();

    if (!status || !status.active) {
      await interaction.editReply({
        content: '❌ Aktuell laeuft keine Bingo-Runde.',
        ephemeral: true
      });
      return;
    }

    // Gewinn melden
    const result = await client.bingoService.reportWin(username, platform);

    if (!result.success) {
      await interaction.editReply({
        content: `❌ ${result.error || 'Gewinn konnte nicht gemeldet werden'}`,
        ephemeral: true
      });
      return;
    }

    // Erfolg
    const points = result.points || 0;
    await interaction.editReply({
      content: `🎉 **BINGO!** Du hast Platz **${result.position}** erreicht und erhaeltst **+${points} Punkte**!`,
      ephemeral: true
    });

  } catch (err) {
    console.error('[Bingo Command] Win-Fehler:', err);
    await interaction.editReply({
      content: '❌ Ein Fehler ist aufgetreten.',
      ephemeral: true
    });
  }
}

/**
 * Hilfsfunktion: Text kuerzen
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
