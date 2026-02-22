/**
 * /changelog Command
 *
 * Postet Changelog-Einträge in #changelog Channel
 * - Simple Text-Posts mit Timestamp
 * - Keine Service-Schicht nötig
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Verwaltung des Changelogs')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Fügt einen Changelog-Eintrag hinzu')
        .addStringOption(option =>
          option
            .setName('text')
            .setDescription('Changelog-Text (unterstützt Markdown)')
            .setRequired(true)
            .setMaxLength(1500)
        )
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'add') {
        await handleAdd(interaction, client);
      }
    } catch (err) {
      console.error('[ChangelogCommand] Fehler:', err);

      const errorMessage = `❌ Ein Fehler ist aufgetreten: ${err.message}`;

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: errorMessage });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }
};

/**
 * Handler für /changelog add
 */
async function handleAdd(interaction, client) {
  await interaction.deferReply({ ephemeral: true });

  const text = interaction.options.getString('text');
  const channelId = client.config.channels.changelog;

  if (!channelId) {
    await interaction.editReply({
      content: `❌ **Changelog-Channel nicht konfiguriert**\n\nSetze \`CHANGELOG_CHANNEL_ID\` in der \`.env\` Datei.`
    });
    return;
  }

  try {
    // Channel abrufen
    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${channelId} nicht gefunden oder kein Text-Channel`);
    }

    // Timestamp generieren
    const now = new Date();
    const dateString = now.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timeString = now.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });

    // Changelog-Nachricht erstellen
    const message = `## 📅 ${dateString} - ${timeString} Uhr\n\n${text}\n\n---\nGepostet von: ${interaction.user}`;

    // Nachricht senden
    await channel.send({ content: message });

    // Bestätigung
    await interaction.editReply({
      content: `✅ **Changelog-Eintrag gepostet**\n\n📍 Channel: ${channel}\n📅 ${dateString} - ${timeString} Uhr`
    });

    console.log(`[ChangelogCommand] Eintrag gepostet von ${interaction.user.tag} in ${channel.name}`);

  } catch (err) {
    console.error('[ChangelogCommand] Fehler beim Posten:', err);
    await interaction.editReply({
      content: `❌ **Fehler beim Posten**\n\n\`\`\`\n${err.message}\n\`\`\``
    });
  }
}
