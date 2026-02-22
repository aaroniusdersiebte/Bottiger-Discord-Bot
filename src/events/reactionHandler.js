/**
 * Reaction-Event-Handler
 *
 * Funktionen:
 * 1. 📺 Emoji für UserImage-Feature (Bilder im Stream anzeigen)
 * 2. Custom-Avatar Approval (✅/❌)
 */

const { Events } = require('discord.js');
const config = require('../config');

module.exports = {
  /**
   * Registriert Event-Listener
   */
  register(client) {
    // Reaction hinzugefügt
    client.on(Events.MessageReactionAdd, async (reaction, user) => {
      // Bot-Reactions ignorieren
      if (user.bot) return;

      // Partial-Reactions fetchen (falls nötig)
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (err) {
          console.error('[ReactionHandler] Fehler beim Fetchen von Partial-Reaction:', err);
          return;
        }
      }

      const emoji = reaction.emoji.name;

      // 1. UserImage-Feature (📺)
      if (emoji === config.userImage?.triggerEmoji) {
        await handleUserImageReaction(reaction, user, client);
      }

      // 2. Custom-Avatar Approval (✅/❌)
      if ((emoji === '✅' || emoji === '❌') && config.customAvatar?.channelId) {
        await handleCustomAvatarReaction(reaction, user, emoji === '✅', client);
      }
    });

    console.log('[ReactionHandler] ✅ Event-Listener registriert');
  }
};

/**
 * Handler für UserImage-Reactions (📺)
 * Sendet Bilder an den Stream Visualizer wenn ein Mod reagiert
 */
async function handleUserImageReaction(reaction, user, client) {
  try {
    const userImageConfig = config.userImage;

    // Feature aktiviert?
    if (!userImageConfig?.enabled) {
      return;
    }

    let message = reaction.message;

    // Message fetchen falls partial (sonst fehlen Attachments!)
    if (message.partial) {
      try {
        message = await message.fetch();
        console.log('[ReactionHandler] Message war partial, wurde gefetcht');
      } catch (fetchErr) {
        console.error('[ReactionHandler] Konnte Message nicht fetchen:', fetchErr);
        return;
      }
    }

    const channelId = message.channel.id;

    // Korrekter Channel?
    if (userImageConfig.channels.length > 0 && !userImageConfig.channels.includes(channelId)) {
      // Channel nicht konfiguriert, still ignorieren
      return;
    }

    // Hat Message bereits eine ✅ Reaction (bereits verarbeitet)?
    const existingCheck = message.reactions.cache.find(r => r.emoji.name === '✅' && r.me);
    if (existingCheck) {
      console.log('[ReactionHandler] Bild bereits verarbeitet (✅ vorhanden)');
      return;
    }

    // Hat Message ein Bild?
    // Prüfe contentType ODER Dateiendung (Discord liefert contentType nicht immer)
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

    const attachment = message.attachments.find(att => {
      // Methode 1: contentType prüfen
      const contentType = att.contentType || '';
      if (contentType.startsWith('image/')) {
        return true;
      }

      // Methode 2: Dateiendung prüfen (Fallback)
      const filename = (att.name || att.url || '').toLowerCase();
      return allowedExtensions.some(ext => filename.endsWith(ext));
    });

    if (!attachment) {
      console.log('[ReactionHandler] Nachricht enthält kein gültiges Bild');
      console.log(`[ReactionHandler] Anzahl Attachments: ${message.attachments.size}`);
      message.attachments.forEach(a => {
        console.log(`[ReactionHandler] - ${a.name} | contentType: ${a.contentType} | url: ${a.url?.substring(0, 80)}`);
      });
      return;
    }

    console.log(`[ReactionHandler] Bild gefunden: ${attachment.name} (${attachment.contentType || 'kein contentType'})`)

    // Moderator-Rolle prüfen
    let member;
    try {
      member = await message.guild.members.fetch(user.id);
    } catch (fetchErr) {
      console.error('[ReactionHandler] Konnte Member nicht fetchen:', fetchErr);
      return;
    }

    const hasModRole = member.roles.cache.some(
      role => role.name === userImageConfig.moderatorRole
    );

    if (!hasModRole) {
      console.log(`[ReactionHandler] User ${user.tag} hat nicht die Rolle "${userImageConfig.moderatorRole}"`);
      return;
    }

    // API verfügbar?
    if (!client.apiClient) {
      console.warn('[ReactionHandler] ApiClient nicht verfügbar');
      return;
    }

    // Bild an Visualizer senden
    const username = message.author.username;
    const imageUrl = attachment.url;

    console.log(`[ReactionHandler] 📺 Sende Bild von ${username} an Visualizer...`);
    console.log(`[ReactionHandler] Bild-URL: ${imageUrl}`);

    try {
      await client.apiClient.sendUserImage(imageUrl, username);
      console.log(`[ReactionHandler] ✅ Bild erfolgreich zur Queue hinzugefügt`);

      // Bestätigung im Channel (✅ Reaction)
      await message.react('✅');

    } catch (apiErr) {
      console.error(`[ReactionHandler] ❌ API-Fehler:`, apiErr.message);

      // Fehler-Reaktion
      try {
        await message.react('❌');
      } catch (reactErr) {
        console.error('[ReactionHandler] Konnte Fehler-Reaction nicht hinzufügen:', reactErr);
      }
    }

  } catch (err) {
    console.error('[ReactionHandler] Fehler bei UserImage-Reaction:', err);
  }
}

/**
 * Handler für Custom-Avatar Approval (✅/❌)
 */
async function handleCustomAvatarReaction(reaction, user, approved, client) {
  try {
    const customAvatarConfig = config.customAvatar;

    // Korrekter Channel?
    if (reaction.message.channel.id !== customAvatarConfig.channelId) {
      return;
    }

    let message = reaction.message;

    // Message fetchen falls partial
    if (message.partial) {
      try {
        message = await message.fetch();
      } catch (fetchErr) {
        console.error('[ReactionHandler] Konnte Message nicht fetchen:', fetchErr);
        return;
      }
    }

    // Nur Bot-Nachrichten verarbeiten
    if (message.author.id !== client.user.id) {
      return;
    }

    // Bereits verarbeitet? (Prüfe ob andere Approval-Reaction vom Bot existiert)
    const existingApproval = message.reactions.cache.find(r =>
      (r.emoji.name === '✅' || r.emoji.name === '❌') && r.me
    );
    if (existingApproval) {
      console.log('[ReactionHandler] Custom-Avatar bereits verarbeitet');
      return;
    }

    // Verification anhand der Message-ID finden
    const verification = client.userService.getCustomAvatarByMessageId(message.id);
    if (!verification) {
      console.log('[ReactionHandler] Keine Verification für Message gefunden');
      return;
    }

    // Status bereits gesetzt?
    if (verification.status !== 'pending') {
      console.log(`[ReactionHandler] Verification ${verification.code} bereits verarbeitet: ${verification.status}`);
      return;
    }

    console.log(`[ReactionHandler] Custom-Avatar ${verification.code}: ${approved ? 'Genehmigt' : 'Abgelehnt'} von ${user.tag}`);

    // Status setzen
    const result = client.userService.setCustomAvatarApprovalStatus(verification.code, approved);
    if (!result.success) {
      console.error('[ReactionHandler] Fehler beim Setzen des Status:', result.error);
      return;
    }

    // Bot-Bestätigung hinzufügen
    await message.react(approved ? '✅' : '❌');

    // DM an User senden
    try {
      const discordUser = await client.users.fetch(verification.discordUserId);

      if (approved) {
        await discordUser.send(
          `**✅ Dein Custom-Avatar wurde genehmigt!**\n\n` +
          `Username: **${verification.username}**\n` +
          `Code: \`${verification.code}\`\n\n` +
          `Dein Avatar wird demnächst freigeschaltet. Falls du noch nicht verifiziert hast, ` +
          `schreibe \`!verify ${verification.code}\` im Twitch/YouTube Chat.`
        );
      } else {
        await discordUser.send(
          `**❌ Dein Custom-Avatar wurde leider abgelehnt.**\n\n` +
          `Username: **${verification.username}**\n\n` +
          `Mögliche Gründe:\n` +
          `• Bild entspricht nicht den Richtlinien\n` +
          `• Qualität nicht ausreichend\n` +
          `• Urheberrechtliche Bedenken\n\n` +
          `Du kannst es in einer Woche erneut versuchen.`
        );
      }

      console.log(`[ReactionHandler] DM an ${discordUser.tag} gesendet`);
    } catch (dmErr) {
      console.error('[ReactionHandler] Konnte DM nicht senden:', dmErr.message);
      // Fallback: Reply im Channel
      try {
        await message.reply({
          content: `⚠️ Konnte <@${verification.discordUserId}> keine DM senden. ` +
                   `${approved ? 'Avatar genehmigt' : 'Avatar abgelehnt'}.`
        });
      } catch (replyErr) {
        console.error('[ReactionHandler] Konnte auch nicht im Channel antworten:', replyErr);
      }
    }

  } catch (err) {
    console.error('[ReactionHandler] Fehler bei Custom-Avatar-Reaction:', err);
  }
}
