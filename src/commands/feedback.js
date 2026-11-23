/**
 * /feedback - Zuschauer melden Bugs oder reichen Ideen ein (Ticket-System).
 *
 * Ablauf: /feedback [screenshot] -> Auswahl „Bug melden“ / „Idee einreichen“ (nur für
 * den User sichtbar) -> Formular (Titel, Beschreibung, bei Bugs „Wann/wie?“) ->
 * POST /api/discord/ticket an Zappify (DiscordTicketsModule, visual-Repo).
 * Der Streamer bearbeitet die Tickets im Zappify-Tab „Tickets“; Rückmeldungen kommen
 * als PN über die AppEventQueue ('ticket.dm'). Rückfrage-PNs haben einen Antwort-Button
 * (customId ticket_reply:<id>), die Roadmap-Übersicht eine Voting-Auswahl (ticket_vote).
 *
 * Komponenten-Routing: index.js leitet customIds mit Präfix feedback_/ticket_ an
 * handleInteraction() weiter.
 */
const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const MAX_IMAGE = 8 * 1024 * 1024;
const PENDING_TTL_MS = 15 * 60 * 1000;
/** userId -> { imageUrl, at } (Screenshot zwischen Slash-Befehl und Formular) */
const pending = new Map();

function _prune() {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.at > PENDING_TTL_MS) pending.delete(k);
}

function _formatWait(sec) {
  const s = Math.max(1, Number(sec) || 1);
  return s >= 90 ? `${Math.ceil(s / 60)} Minuten` : `${s} Sekunden`;
}

/** Ablehnungsgrund von Zappify in einen freundlichen Satz übersetzen. */
function _reasonText(res) {
  switch (res && (res.reason || res.error)) {
    case 'banned': return '🚫 Du kannst gerade keine Tickets einreichen.';
    case 'too_many_open': return `⏳ Du hast schon ${res.max || 'mehrere'} offene Tickets. Sobald eins bearbeitet ist, kannst du wieder etwas einreichen.`;
    case 'cooldown': return `⏳ Kurz durchatmen: Du kannst in ${_formatWait(res.retryInSec)} wieder ein Ticket einreichen.`;
    case 'image_rejected': return '❌ Der Screenshot konnte nicht verarbeitet werden. Bitte als PNG/JPG erneut versuchen.';
    case 'title_too_short': return '❌ Der Titel ist zu kurz.';
    case 'text_too_short': return '❌ Bitte beschreib es etwas genauer.';
    case 'offline': return '😴 Der Streamer ist gerade nicht erreichbar (Zappify läuft nicht). Bitte später erneut versuchen.';
    default:
      if (res && res.status === 403) return '🔒 Das Ticket-System ist gerade ausgeschaltet.';
      return '❌ Das hat leider nicht geklappt. Bitte später erneut versuchen.';
  }
}

function _typeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('feedback_type:bug').setLabel('Bug melden').setEmoji('🐞').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('feedback_type:idea').setLabel('Idee einreichen').setEmoji('💡').setStyle(ButtonStyle.Primary),
  );
}

function _ticketModal(type) {
  const isBug = type === 'bug';
  const modal = new ModalBuilder()
    .setCustomId(`feedback_modal:${type}`)
    .setTitle(isBug ? '🐞 Bug melden' : '💡 Idee einreichen');
  const title = new TextInputBuilder()
    .setCustomId('title')
    .setLabel(isBug ? 'Was ist kaputt? (kurz)' : 'Deine Idee in einem Satz')
    .setStyle(TextInputStyle.Short)
    .setMinLength(3)
    .setMaxLength(100)
    .setPlaceholder(isBug ? 'z. B. Alert wird doppelt angezeigt' : 'z. B. Sound beim Raid')
    .setRequired(true);
  const text = new TextInputBuilder()
    .setCustomId('text')
    .setLabel(isBug ? 'Beschreibung' : 'Beschreib deine Idee')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(5)
    .setMaxLength(1500)
    .setPlaceholder(isBug ? 'Was hast du erwartet, was ist stattdessen passiert?' : 'Was soll passieren und warum wäre das cool?')
    .setRequired(true);
  const rows = [new ActionRowBuilder().addComponents(title), new ActionRowBuilder().addComponents(text)];
  if (isBug) {
    rows.push(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('steps')
      .setLabel('Wann / wie passiert es? (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(800)
      .setPlaceholder('z. B. immer nach einem Szenenwechsel')
      .setRequired(false)));
  }
  return modal.addComponents(...rows);
}

function _replyModal(ticketId) {
  return new ModalBuilder()
    .setCustomId(`ticket_reply_modal:${ticketId}`)
    .setTitle('Antwort an den Streamer')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId('text')
      .setLabel('Deine Antwort')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(true)));
}

const ID_RE = /^[a-f0-9]{16}$/;

async function _safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply({ ephemeral: true, ...payload });
  } catch (err) {
    if (err.code !== 10062) console.warn('[Feedback] Antwort fehlgeschlagen:', err.message);
  }
}

/**
 * Buttons, Formulare und Auswahl rund ums Ticket-System.
 * @returns {Promise<boolean>} true = behandelt
 */
async function handleInteraction(interaction, client) {
  const id = interaction.customId || '';
  const api = client.apiClient;

  // 1) Bug/Idee gewählt -> Formular öffnen (muss sofort passieren, kein API-Call davor)
  if (interaction.isButton() && id.startsWith('feedback_type:')) {
    const type = id.split(':')[1] === 'bug' ? 'bug' : 'idea';
    await interaction.showModal(_ticketModal(type));
    return true;
  }

  // 2) Formular abgeschickt -> Ticket an Zappify
  if (interaction.isModalSubmit() && id.startsWith('feedback_modal:')) {
    const type = id.split(':')[1] === 'bug' ? 'bug' : 'idea';
    await interaction.deferReply({ ephemeral: true });
    _prune();
    const shot = pending.get(interaction.user.id);
    const res = await api.submitTicket({
      type,
      title: interaction.fields.getTextInputValue('title'),
      text: interaction.fields.getTextInputValue('text'),
      steps: type === 'bug' ? (interaction.fields.getTextInputValue('steps') || '') : '',
      discordUserId: interaction.user.id,
      discordTag: interaction.user.globalName ? `${interaction.user.globalName} (@${interaction.user.username})` : interaction.user.username,
      imageUrl: shot ? shot.imageUrl : undefined,
    });
    if (!res.ok) {
      await _safeReply(interaction, { content: _reasonText(res) });
      return true;
    }
    pending.delete(interaction.user.id);
    console.log(`[Feedback] Ticket #${res.number} (${type}) von ${interaction.user.tag}`);
    await _safeReply(interaction, {
      content: `✅ **Danke! Ticket #${res.number} ist eingegangen.**\n`
        + 'Du bekommst eine PN, sobald es Neuigkeiten gibt (PNs vom Server erlauben).\n'
        + '-# Dein Discord-Name ist nur für den Streamer sichtbar, nicht in der öffentlichen Roadmap.',
    });
    return true;
  }

  // 3) Antwort-Button in einer Rückfrage-PN
  if (interaction.isButton() && id.startsWith('ticket_reply:')) {
    const ticketId = id.slice('ticket_reply:'.length);
    if (!ID_RE.test(ticketId)) return true;
    await interaction.showModal(_replyModal(ticketId));
    return true;
  }

  if (interaction.isModalSubmit() && id.startsWith('ticket_reply_modal:')) {
    const ticketId = id.slice('ticket_reply_modal:'.length);
    if (!ID_RE.test(ticketId)) return true;
    await interaction.deferReply({ ephemeral: true });
    const res = await api.replyTicket(ticketId, interaction.user.id, interaction.fields.getTextInputValue('text'));
    if (!res.ok) {
      const text = res.error === 'not_found' ? '❌ Dieses Ticket gibt es nicht mehr.' : _reasonText(res);
      await _safeReply(interaction, { content: text });
      return true;
    }
    await _safeReply(interaction, { content: `✅ Deine Antwort zu Ticket #${res.number} wurde übermittelt. Danke!` });
    return true;
  }

  // 4) Voting in der Roadmap-Übersicht
  if (interaction.isStringSelectMenu() && id === 'ticket_vote') {
    const ticketId = interaction.values[0];
    if (!ID_RE.test(ticketId || '')) return true;
    await interaction.deferReply({ ephemeral: true });
    const res = await api.voteTicket(ticketId, interaction.user.id);
    if (!res.ok) {
      const text = res.error === 'not_votable' || res.error === 'not_found'
        ? '❌ Für diese Idee kann gerade nicht abgestimmt werden.'
        : _reasonText(res);
      await _safeReply(interaction, { content: text });
      return true;
    }
    await _safeReply(interaction, {
      content: res.voted
        ? `👍 Deine Stimme für #${res.number} zählt! (${res.votes} insgesamt)`
        : `↩️ Stimme für #${res.number} zurückgenommen. (${res.votes} insgesamt)`,
    });
    return true;
  }

  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('Melde einen Bug oder reiche eine Idee ein')
    .addAttachmentOption((option) =>
      option
        .setName('screenshot')
        .setDescription('Optional: Screenshot (PNG/JPG, max 8 MB)')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const attachment = interaction.options.getAttachment('screenshot');
    if (attachment) {
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(attachment.contentType || '')) {
        await interaction.editReply({ content: '❌ Der Screenshot muss ein Bild sein (PNG/JPG).' });
        return;
      }
      if (attachment.size > MAX_IMAGE) {
        await interaction.editReply({ content: '❌ Der Screenshot ist zu groß (max 8 MB).' });
        return;
      }
    }

    const elig = await client.apiClient.ticketEligibility(interaction.user.id);
    if (!elig || !elig.ok) {
      await interaction.editReply({ content: _reasonText(elig) });
      return;
    }

    _prune();
    if (attachment) pending.set(interaction.user.id, { imageUrl: attachment.url, at: Date.now() });
    else pending.delete(interaction.user.id);

    await interaction.editReply({
      content: `**Was möchtest du einreichen?**${attachment ? '\n📎 Dein Screenshot wird mitgeschickt.' : ''}`,
      components: [_typeButtons()],
    });
  },

  handleInteraction,
};
