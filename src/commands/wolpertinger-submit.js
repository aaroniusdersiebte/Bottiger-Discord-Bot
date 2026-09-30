/**
 * /wolpertinger-submit - Community reicht ein eigenes Wolpertinger-Teil ein
 * (Hintergrund/Koerper/Kopf/Augen/Hut/Rahmen).
 *
 * Laeuft immer ueber die App-seitige Freigabe (Kontrollzentrum -> Discord-Bot ->
 * Bild-Freigaben). Nach Freigabe landet die Datei im Kategorie-Ordner der
 * lokalen Installation und wird als neue Unterversion im Wolpertinger-Studio
 * waehlbar. Siehe DiscordImageReviewService (visual-Repo).
 */
const { SlashCommandBuilder } = require('discord.js');
const { validateImage } = require('../utils/ImageValidator');
const downloadImage = require('../utils/downloadImage');

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const CATEGORIES = [
  { name: 'Hintergrund', value: 'hintergrund' },
  { name: 'Körper', value: 'koerper' },
  { name: 'Kopf', value: 'kopf' },
  { name: 'Augen', value: 'augen' },
  { name: 'Hut', value: 'hut' },
  { name: 'Rahmen', value: 'rahmen' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wolpertinger-submit')
    .setDescription('Reiche ein eigenes Wolpertinger-Teil ein')
    .addStringOption((option) =>
      option
        .setName('kategorie')
        .setDescription('Welcher Teil des Wolpertingers?')
        .setRequired(true)
        .addChoices(...CATEGORIES)
    )
    .addAttachmentOption((option) =>
      option
        .setName('bild')
        .setDescription('Dein Teil, am besten transparentes PNG (max 5MB)')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const restrictChannel = client.config.wolpertingerSubmit?.channelId;
    if (restrictChannel && interaction.channelId !== restrictChannel) {
      await interaction.reply({
        content: `❌ Bitte \`/wolpertinger-submit\` im dafür vorgesehenen Channel <#${restrictChannel}> nutzen.`,
        ephemeral: true,
      });
      return;
    }

    const category = interaction.options.getString('kategorie');
    const attachment = interaction.options.getAttachment('bild');

    if (attachment.size > MAX_SIZE) {
      await interaction.reply({
        content: `❌ Datei zu groß (${(attachment.size / 1024 / 1024).toFixed(1)}MB, max ${(MAX_SIZE / 1024 / 1024).toFixed(0)}MB).`,
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let buffer;
    try {
      buffer = await downloadImage(attachment.url);
    } catch (err) {
      console.error('[WolpertingerSubmit] Download-Fehler:', err);
      await interaction.editReply({ content: '❌ Konnte das Bild nicht herunterladen. Bitte erneut versuchen.' });
      return;
    }

    const validation = validateImage(buffer, MAX_SIZE);
    if (!validation.valid) {
      await interaction.editReply({ content: `❌ Ungültiges Bild: ${validation.error}` });
      return;
    }

    try {
      await client.apiClient.submitPendingImage({
        type: 'wolpertinger-asset',
        imageUrl: attachment.url,
        discordUserId: interaction.user.id,
        discordTag: interaction.user.tag,
        category,
      });
    } catch (err) {
      await interaction.editReply({ content: `❌ ${err.message}` });
      return;
    }

    const label = CATEGORIES.find((c) => c.value === category)?.name || category;
    await interaction.editReply({
      content: `✅ Dein Wolpertinger-Teil (${label}) wurde eingereicht! Ein Mod prüft es im Kontrollzentrum.`,
    });
    console.log(`[WolpertingerSubmit] Einreichung von ${interaction.user.tag}: ${category}`);
  },
};
