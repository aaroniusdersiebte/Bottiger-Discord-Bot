/**
 * fanartForward - leitet Bilder aus den konfigurierten Fanart-Channels
 * automatisch an Zappify zur App-seitigen Freigabe weiter (Modus 'app'/'both').
 *
 * Ersetzt in diesen Modi die 📺-Mod-Reaktion (reactionHandler). Im Modus 'emoji'
 * ist dieser Handler inaktiv - dort reagiert weiterhin ein Mod im Discord.
 */

const { Events } = require('discord.js');
const config = require('../config');

const ALLOWED_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const RATE_MS = 60 * 1000;
const _lastByAuthor = new Map();

function findImage(message) {
  return message.attachments.find((att) => {
    const ct = att.contentType || '';
    if (ct.startsWith('image/') && !/svg/i.test(ct)) return true;
    const name = (att.name || att.url || '').toLowerCase();
    return ALLOWED_EXT.some((ext) => name.endsWith(ext));
  });
}

module.exports = {
  register(client) {
    client.on(Events.MessageCreate, async (message) => {
      try {
        const mode = config.imageReview?.mode || 'app';
        if (mode !== 'app' && mode !== 'both') return;
        if (message.author?.bot) return;

        const channels = config.userImage?.channels || [];
        if (channels.length === 0 || !channels.includes(message.channel.id)) return;

        const attachment = findImage(message);
        if (!attachment) return;

        const last = _lastByAuthor.get(message.author.id) || 0;
        if (Date.now() - last < RATE_MS) {
          try { await message.react('⏳'); } catch { /* noop */ }
          return;
        }
        _lastByAuthor.set(message.author.id, Date.now());

        try { await message.react('🕓'); } catch { /* noop */ }

        try {
          await client.apiClient.submitPendingImage({
            type: 'user-image',
            imageUrl: attachment.url,
            discordUserId: message.author.id,
            discordTag: message.author.tag,
            username: message.author.username,
          });
          console.log(`[fanartForward] Bild von ${message.author.tag} an Zappify eingereicht`);
        } catch (apiErr) {
          console.warn('[fanartForward] Einreichung fehlgeschlagen:', apiErr.message);
          try { await message.reactions.cache.get('🕓')?.users.remove(client.user.id); } catch { /* noop */ }
        }
      } catch (err) {
        console.error('[fanartForward] Fehler:', err);
      }
    });

    console.log('[fanartForward] ✅ aktiv (Modus app/both)');
  },
};
