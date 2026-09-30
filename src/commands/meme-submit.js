/**
 * /meme-submit - Community reicht ein Bild fuers Zappify-Meme-Overlay ein.
 *
 * Laeuft immer ueber die App-seitige Freigabe (Kontrollzentrum -> Discord-Bot ->
 * Bild-Freigaben), unabhaengig vom imageReview.mode-Umschalter (der betrifft nur
 * Custom-Avatar/Fanart). Nach Freigabe landet das Bild direkt im MemeModule
 * (!meme <name> im Stream-Chat). Siehe DiscordImageReviewService (visual-Repo).
 */
const { SlashCommandBuilder } = require('discord.js');
const { validateImage } = require('../utils/ImageValidator');
const downloadImage = require('../utils/downloadImage');

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme-submit')
    .setDescription('Reiche ein Bild fuer das Meme-Overlay ein')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Gewuenschter !meme-Name (nur Buchstaben/Zahlen)')
        .setRequired(true)
    )
    .addAttachmentOption((option) =>
      option
        .setName('bild')
        .setDescription('Dein Meme-Bild (PNG/JPG/GIF/WEBP, max 5MB)')
        .setRequired(true)
    ),

  async execute(interaction, client) {
    const restrictChannel = client.config.memeSubmit?.channelId;
    if (restrictChannel && interaction.channelId !== restrictChannel) {
      await interaction.reply({
        content: `❌ Bitte \`/meme-submit\` im dafür vorgesehenen Channel <#${restrictChannel}> nutzen.`,
        ephemeral: true,
      });
      return;
    }

    const name = interaction.options.getString('name');
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
      console.error('[MemeSubmit] Download-Fehler:', err);
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
        type: 'meme',
        imageUrl: attachment.url,
        discordUserId: interaction.user.id,
        discordTag: interaction.user.tag,
        command: name,
      });
    } catch (err) {
      await interaction.editReply({ content: `❌ ${err.message}` });
      return;
    }

    await interaction.editReply({
      content: `✅ Meme **!${name}** eingereicht! Ein Mod prüft es im Kontrollzentrum, du bekommst eine DM sobald entschieden wurde.`,
    });
    console.log(`[MemeSubmit] Einreichung von ${interaction.user.tag}: ${name}`);
  },
};
