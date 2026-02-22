/**
 * /feedback Command
 *
 * Bug-Reports und Feature-Requests mit 3-stufigem Flow:
 * 1. Tag-Auswahl (Multi-Select aus 5 Tags)
 * 2. Typ-Auswahl (Bug/Request)
 * 3. Modal (Titel + Beschreibung)
 *
 * Subcommands:
 * - status: Updated Status (Admin-only)
 * - overview: Dashboard mit Stats (Admin-only)
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

// Feste Tags
const TAGS = [
  { label: 'Discord Bot', emoji: '🤖', value: 'Discord Bot' },
  { label: 'Stream Overlay', emoji: '🎨', value: 'Stream Overlay' },
  { label: 'Punkte System', emoji: '⭐', value: 'Punkte System' },
  { label: 'Streaming Sounds', emoji: '🔊', value: 'Streaming Sounds' },
  { label: 'TTS', emoji: '🗣️', value: 'TTS' }
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('Bug-Report oder Feature-Request erstellen')
    .addSubcommand(subcommand =>
      subcommand
        .setName('erstellen')
        .setDescription('Bug-Report oder Feature-Request erstellen')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Ändert den Status eines Feedbacks (Admin-only)')
        .addStringOption(option =>
          option
            .setName('thread-id')
            .setDescription('Thread-ID oder Thread-URL')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('status')
            .setDescription('Neuer Status')
            .setRequired(true)
            .addChoices(
              { name: '🔴 Offen', value: 'open' },
              { name: '🟡 In Arbeit', value: 'in_progress' },
              { name: '🟢 Behoben', value: 'resolved' },
              { name: '⚫ Wird nicht behoben', value: 'wont_fix' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('overview')
        .setDescription('Zeigt Dashboard mit allen Feedbacks (Admin-only)')
    ),

  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'erstellen') {
        await handleSubmit(interaction, client);
      } else if (subcommand === 'status') {
        await handleStatus(interaction, client);
      } else if (subcommand === 'overview') {
        await handleOverview(interaction, client);
      }
    } catch (err) {
      console.error('[FeedbackCommand] Fehler:', err);

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
 * Handler für /feedback (3-stufiger Flow)
 */
async function handleSubmit(interaction, client) {
  // Schritt 1: Tag-Select-Menu (Multi-Select)
  const tagSelect = new StringSelectMenuBuilder()
    .setCustomId(`feedback_tags_${interaction.user.id}`)
    .setPlaceholder('Wähle eine oder mehrere Kategorien')
    .setMinValues(1)
    .setMaxValues(TAGS.length)
    .addOptions(
      TAGS.map(tag =>
        new StringSelectMenuOptionBuilder()
          .setLabel(tag.label)
          .setEmoji(tag.emoji)
          .setValue(tag.value)
      )
    );

  const tagRow = new ActionRowBuilder().addComponents(tagSelect);

  await interaction.reply({
    content: '**Feedback erstellen**\n\n**Schritt 1/3:** Wähle die Kategorien, die zu deinem Feedback passen:',
    components: [tagRow],
    ephemeral: true
  });

  // Schritt 2: Warte auf Tag-Auswahl
  try {
    const tagFilter = i => i.user.id === interaction.user.id && i.customId === `feedback_tags_${interaction.user.id}`;
    const tagInteraction = await interaction.channel.awaitMessageComponent({
      filter: tagFilter,
      time: 60000 // 1 Minute
    });

    const selectedTags = tagInteraction.values;

    // Schritt 2: Typ-Select-Menu (Bug/Request)
    const typeSelect = new StringSelectMenuBuilder()
      .setCustomId(`feedback_type_${interaction.user.id}`)
      .setPlaceholder('Wähle den Typ')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Bug Report')
          .setEmoji('🐛')
          .setValue('bug')
          .setDescription('Ein Fehler oder Problem melden'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Feature Request')
          .setEmoji('✨')
          .setValue('request')
          .setDescription('Eine neue Funktion vorschlagen')
      );

    const typeRow = new ActionRowBuilder().addComponents(typeSelect);

    await tagInteraction.update({
      content: `**Feedback erstellen**\n\n**Kategorien:** ${selectedTags.map(t => `\`${t}\``).join(', ')}\n\n**Schritt 2/3:** Wähle den Typ:`,
      components: [typeRow]
    });

    // Schritt 3: Warte auf Typ-Auswahl
    const typeFilter = i => i.user.id === interaction.user.id && i.customId === `feedback_type_${interaction.user.id}`;
    const typeInteraction = await interaction.channel.awaitMessageComponent({
      filter: typeFilter,
      time: 60000 // 1 Minute
    });

    const feedbackType = typeInteraction.values[0]; // 'bug' oder 'request'

    // Schritt 4: Modal öffnen
    await showFeedbackModal(typeInteraction, feedbackType, selectedTags, client);

  } catch (err) {
    // Timeout
    if (err.message?.includes('time')) {
      await interaction.editReply({
        content: '❌ Zeit abgelaufen. Bitte versuche es erneut mit `/feedback`.',
        components: []
      });
    } else {
      console.error('[FeedbackCommand] Fehler beim Select-Menu:', err);
    }
  }
}

/**
 * Zeigt Modal für Titel + Beschreibung
 */
async function showFeedbackModal(interaction, type, tags, client) {
  const modal = new ModalBuilder()
    .setCustomId(`feedback_modal_${type}_${interaction.user.id}_${Date.now()}`)
    .setTitle(type === 'bug' ? '🐛 Bug-Report' : '✨ Feature-Request');

  const titleInput = new TextInputBuilder()
    .setCustomId('title')
    .setLabel('Titel')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Kurze Beschreibung')
    .setRequired(true)
    .setMaxLength(100);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('description')
    .setLabel('Beschreibung')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      type === 'bug'
        ? 'Was ist das Problem? Wie kann man es reproduzieren?'
        : 'Was soll das Feature tun? Warum brauchst du es?'
    )
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descriptionInput)
  );

  await interaction.showModal(modal);

  // Modal-Submit abwarten
  try {
    const submitted = await interaction.awaitModalSubmit({
      filter: i => i.customId.startsWith('feedback_modal_') && i.user.id === interaction.user.id,
      time: 300000 // 5 Minuten
    });

    const title = submitted.fields.getTextInputValue('title');
    const description = submitted.fields.getTextInputValue('description');

    await submitted.deferReply({ ephemeral: true });

    // FeedbackService aufrufen (mit Tags!)
    const result = await client.feedbackService.createFeedback({
      type: type,
      title: title,
      description: description,
      author: submitted.user,
      tags: tags // Tags aus Select-Menu übergeben
    });

    await submitted.editReply({
      content: `✅ **Feedback erstellt!**\n\n${type === 'bug' ? '🐛' : '✨'} **${title}**\n**Kategorien:** ${tags.map(t => `\`${t}\``).join(', ')}\n\nDein Feedback wurde erfolgreich eingereicht. Andere User können jetzt voten.\n\n🔗 [Zum Thread](${result.threadUrl})`
    });

    console.log(`[FeedbackCommand] Feedback erstellt: ${result.threadId} (${type}, Tags: ${tags.join(', ')}) von ${submitted.user.tag}`);

  } catch (err) {
    if (err.message?.includes('time')) {
      console.log('[FeedbackCommand] Modal-Timeout (User hat nicht rechtzeitig geantwortet)');
    } else {
      console.error('[FeedbackCommand] Modal-Fehler:', err);
    }
  }
}

/**
 * Handler für /feedback status
 */
async function handleStatus(interaction, client) {
  // Permission-Check: Nur Admins
  if (!interaction.member.permissions.has('Administrator')) {
    await interaction.reply({
      content: '❌ **Keine Berechtigung**\n\nDieser Command ist nur für Admins verfügbar.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const threadIdInput = interaction.options.getString('thread-id');
  const newStatus = interaction.options.getString('status');

  // Thread-ID aus URL extrahieren falls nötig
  let threadId = threadIdInput;
  const urlMatch = threadIdInput.match(/\/channels\/\d+\/(\d+)/);
  if (urlMatch) {
    threadId = urlMatch[1];
  }

  try {
    // Status updaten
    await client.feedbackService.updateStatus(threadId, newStatus);

    const statusEmoji = client.config.feedback.statusEmojis[newStatus];
    const statusLabel = client.config.feedback.statusLabels[newStatus];

    await interaction.editReply({
      content: `✅ **Status geändert**\n\n${statusEmoji} **${statusLabel}**\n\n🔗 [Zum Thread](https://discord.com/channels/${interaction.guildId}/${threadId})`
    });

    console.log(`[FeedbackCommand] Status geändert: ${threadId} → ${newStatus} (von ${interaction.user.tag})`);

  } catch (err) {
    console.error('[FeedbackCommand] Status-Update-Fehler:', err);
    await interaction.editReply({
      content: `❌ **Fehler beim Status-Update**\n\n\`\`\`\n${err.message}\n\`\`\``
    });
  }
}

/**
 * Handler für /feedback overview
 */
async function handleOverview(interaction, client) {
  // Permission-Check: Nur Admins
  if (!interaction.member.permissions.has('Administrator')) {
    await interaction.reply({
      content: '❌ **Keine Berechtigung**\n\nDieser Command ist nur für Admins verfügbar.',
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Dashboard-Stats generieren
    const stats = await client.feedbackService.getDashboardStats();

    // Dashboard-Nachricht erstellen
    let message = `📊 **Feedback-Übersicht**\n\n`;

    // Gesamt-Statistiken
    message += `**📈 Gesamt:**\n`;
    message += `- 🐛 Bugs: ${stats.total.bugs}\n`;
    message += `- ✨ Feature-Requests: ${stats.total.requests}\n`;
    message += `- 📁 Total: ${stats.total.bugs + stats.total.requests}\n\n`;

    // Bugs nach Status
    message += `**🐛 Bugs:**\n`;
    message += `- 🔴 Offen: ${stats.bugsByStatus.open}\n`;
    message += `- 🟡 In Arbeit: ${stats.bugsByStatus.in_progress}\n`;
    message += `- 🟢 Behoben: ${stats.bugsByStatus.resolved}\n`;
    message += `- ⚫ Wird nicht behoben: ${stats.bugsByStatus.wont_fix}\n\n`;

    // Requests nach Status
    message += `**✨ Feature-Requests:**\n`;
    message += `- 🔴 Offen: ${stats.requestsByStatus.open}\n`;
    message += `- 🟡 In Arbeit: ${stats.requestsByStatus.in_progress}\n`;
    message += `- 🟢 Umgesetzt: ${stats.requestsByStatus.resolved}\n`;
    message += `- ⚫ Wird nicht umgesetzt: ${stats.requestsByStatus.wont_fix}\n\n`;

    // Top Bugs
    if (stats.topBugs.length > 0) {
      message += `**🔥 Top 5 Bugs (nach Votes):**\n`;
      stats.topBugs.forEach((bug, index) => {
        const statusEmoji = client.config.feedback.statusEmojis[bug.status];
        message += `${index + 1}. ${statusEmoji} [${bug.title}](https://discord.com/channels/${interaction.guildId}/${bug.threadId}) (👍 ${bug.votes})\n`;
      });
      message += '\n';
    }

    // Top Requests
    if (stats.topRequests.length > 0) {
      message += `**⭐ Top 5 Feature-Requests (nach Votes):**\n`;
      stats.topRequests.forEach((request, index) => {
        const statusEmoji = client.config.feedback.statusEmojis[request.status];
        message += `${index + 1}. ${statusEmoji} [${request.title}](https://discord.com/channels/${interaction.guildId}/${request.threadId}) (👍 ${request.votes})\n`;
      });
      message += '\n';
    }

    // Nach Kategorie
    message += `**📁 Nach Kategorie:**\n`;
    const categories = Object.keys(stats.byCategory);
    if (categories.length > 0) {
      categories.forEach(cat => {
        const { bugs, requests } = stats.byCategory[cat];
        message += `- **${cat}:** 🐛 ${bugs} | ✨ ${requests}\n`;
      });
    } else {
      message += `- Keine Feedbacks vorhanden\n`;
    }

    // Message kürzen falls zu lang (max 2000 chars)
    if (message.length > 1950) {
      message = message.substring(0, 1947) + '...';
    }

    await interaction.editReply({ content: message });

    console.log(`[FeedbackCommand] Overview angezeigt von ${interaction.user.tag}`);

  } catch (err) {
    console.error('[FeedbackCommand] Overview-Fehler:', err);
    await interaction.editReply({
      content: `❌ **Fehler beim Laden des Dashboards**\n\n\`\`\`\n${err.message}\n\`\`\``
    });
  }
}
