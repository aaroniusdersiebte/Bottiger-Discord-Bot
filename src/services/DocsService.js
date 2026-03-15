/**
 * DocsService
 *
 * Verwaltet Feature-Dokumentationen im Forum-Channel:
 * - Lädt Markdown-Files aus docs/features/
 * - Parst Frontmatter (YAML zwischen ---)
 * - Generiert Discord-Embeds
 * - Lädt Bilder aus docs/images/
 * - Synct Messages in Forum-Posts (pro Kategorie)
 * - Unterstützt partielle Syncs (nur geänderte Files)
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ChannelType } = require('discord.js');

class DocsService {
  constructor(config) {
    this.config = config;
    this.docsPath = path.join(__dirname, '../../docs/features');
    this.imagesPath = path.join(__dirname, '../../docs/images');
    this.statePath = path.join(__dirname, '../../config/docs-state.json');

    // Cache
    this.docsCache = new Map();
    this.lastLoad = null;
    this.cacheLifetime = 5 * 60 * 1000; // 5 Minuten

    // State (Forum-Post-IDs und Message-IDs)
    this.state = {
      forumPostIds: {},        // Kategorie -> Forum-Post/Thread-ID
      threadMessages: {},       // Thread-ID -> { featureKey: messageId }
      overviewBotMessageId: null, // Bot-Message-ID im Übersicht-Thread
      lastSync: null
    };

    console.log('[DocsService] Initialisiert');
  }

  /**
   * Initialisiert Service (lädt State)
   */
  async init() {
    try {
      // State-File laden falls vorhanden
      if (fs.existsSync(this.statePath)) {
        const stateData = fs.readFileSync(this.statePath, 'utf8');
        const loadedState = JSON.parse(stateData);

        // State mergen (damit neue Felder nicht überschrieben werden)
        this.state = {
          ...this.state,
          forumPostIds: loadedState.forumPostIds || {},
          threadMessages: loadedState.threadMessages || {},
          overviewBotMessageId: loadedState.overviewBotMessageId || null,
          lastSync: loadedState.lastSync || null
        };

        const featureCount = Object.values(this.state.threadMessages)
          .reduce((sum, msgs) => sum + Object.keys(msgs).length, 0);
        console.log(`[DocsService] ✅ State geladen (${featureCount} Features)`);
      } else {
        console.log('[DocsService] ℹ️ Kein State-File gefunden, starte mit leerem State');
      }

      // Docs-Ordner erstellen falls nicht vorhanden
      if (!fs.existsSync(this.docsPath)) {
        fs.mkdirSync(this.docsPath, { recursive: true });
        console.log(`[DocsService] 📁 Docs-Ordner erstellt: ${this.docsPath}`);
      }

      // Images-Ordner erstellen falls nicht vorhanden
      if (!fs.existsSync(this.imagesPath)) {
        fs.mkdirSync(this.imagesPath, { recursive: true });
        console.log(`[DocsService] 📁 Images-Ordner erstellt: ${this.imagesPath}`);
      }

      console.log('[DocsService] ✅ Initialisierung abgeschlossen');
    } catch (err) {
      console.error('[DocsService] ❌ Fehler bei Initialisierung:', err);
      throw err;
    }
  }

  /**
   * Lädt alle Feature-Docs (mit Caching)
   * @param {boolean} forceReload - Erzwingt Reload (ignoriert Cache)
   * @returns {Array} Array von Doc-Objekten
   */
  loadFeatureDocs(forceReload = false) {
    try {
      // Cache-Check
      if (!forceReload && this.lastLoad && Date.now() - this.lastLoad < this.cacheLifetime) {
        console.log(`[DocsService] ℹ️ Nutze gecachte Docs (${this.docsCache.size} Features)`);
        return Array.from(this.docsCache.values());
      }

      console.log('[DocsService] 🔄 Lade Feature-Docs...');

      // Docs-Ordner lesen
      if (!fs.existsSync(this.docsPath)) {
        console.warn('[DocsService] ⚠️ Docs-Ordner existiert nicht, erstelle ihn...');
        fs.mkdirSync(this.docsPath, { recursive: true });
        return [];
      }

      const files = fs.readdirSync(this.docsPath).filter(file => file.endsWith('.md'));

      if (files.length === 0) {
        console.log('[DocsService] ℹ️ Keine Markdown-Files gefunden in docs/features/');
        return [];
      }

      const docs = [];
      this.docsCache.clear();

      for (const file of files) {
        try {
          const filePath = path.join(this.docsPath, file);
          const doc = this.parseMarkdown(filePath);
          docs.push(doc);
          this.docsCache.set(doc.filename, doc);
          console.log(`[DocsService]   ✅ ${file} geladen`);
        } catch (err) {
          console.error(`[DocsService]   ❌ Fehler beim Laden von ${file}:`, err.message);
        }
      }

      // Nach 'order' sortieren (falls vorhanden)
      docs.sort((a, b) => {
        const orderA = parseInt(a.frontmatter.order) || 999;
        const orderB = parseInt(b.frontmatter.order) || 999;
        return orderA - orderB;
      });

      this.lastLoad = Date.now();
      console.log(`[DocsService] ✅ ${docs.length} Feature-Docs geladen`);

      return docs;
    } catch (err) {
      console.error('[DocsService] ❌ Fehler beim Laden der Docs:', err);
      throw err;
    }
  }

  /**
   * Parst einzelnes Markdown-File
   * @param {string} filePath - Absoluter Pfad zur .md Datei
   * @returns {Object} Doc-Objekt mit frontmatter und content
   */
  parseMarkdown(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const filename = path.basename(filePath);

      // Frontmatter extrahieren (zwischen --- und ---)
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);

      if (!frontmatterMatch) {
        throw new Error('Kein Frontmatter gefunden (--- ... --- fehlt)');
      }

      const frontmatterRaw = frontmatterMatch[1];
      const markdownContent = content.slice(frontmatterMatch[0].length).trim();

      // Frontmatter-Felder parsen (simple YAML-Parsing)
      const frontmatter = this._parseFrontmatter(frontmatterRaw);

      // Defaults für fehlende Felder
      if (!frontmatter.title) frontmatter.title = filename.replace('.md', '');
      if (!frontmatter.category) frontmatter.category = 'Sonstiges';
      if (!frontmatter.emoji) frontmatter.emoji = '📄';
      if (!frontmatter.updatedAt) frontmatter.updatedAt = 'Unbekannt';
      if (!frontmatter.type) frontmatter.type = 'article'; // 'command' oder 'article'

      return {
        filename,
        frontmatter,
        content: markdownContent
      };
    } catch (err) {
      console.error(`[DocsService] Fehler beim Parsen von ${filePath}:`, err.message);
      throw err;
    }
  }

  /**
   * Parst Frontmatter-String (simple YAML)
   * @param {string} frontmatterRaw - YAML-String
   * @returns {Object} Parsed frontmatter
   */
  _parseFrontmatter(frontmatterRaw) {
    const frontmatter = {};

    frontmatterRaw.split('\n').forEach(line => {
      // Ignoriere leere Zeilen und Kommentare
      if (!line.trim() || line.trim().startsWith('#')) return;

      // Key-Value-Pair extrahieren
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) return;

      const key = line.substring(0, colonIndex).trim();
      let value = line.substring(colonIndex + 1).trim();

      // Quotes entfernen (falls vorhanden)
      value = value.replace(/^["']|["']$/g, '');

      frontmatter[key] = value;
    });

    return frontmatter;
  }

  /**
   * Generiert Discord-Embed aus Doc-Objekt
   * @param {Object} doc - Doc-Objekt (von parseMarkdown)
   * @returns {EmbedBuilder} Discord-Embed
   */
  generateEmbed(doc) {
    try {
      const { frontmatter, content } = doc;

      // Content zu Discord-Format konvertieren und kürzen falls nötig
      let description = this._convertMarkdownToDiscord(content);

      // Visueller Trenner am Ende hinzufügen
      description += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

      // Discord Embed Description Limit: 4096 chars
      if (description.length > 4000) {
        description = description.substring(0, 3997) + '...';
      }

      const embed = new EmbedBuilder()
        .setTitle(`${frontmatter.emoji} ${frontmatter.title}`)
        .setDescription(description)
        .setColor('#5865F2') // Discord Blurple
        .setFooter({ text: `📅 Zuletzt aktualisiert: ${frontmatter.updatedAt}` })
        .setTimestamp();

      // Kategorie als Field (optional)
      if (frontmatter.category) {
        embed.addFields({ name: '📁 Kategorie', value: frontmatter.category, inline: true });
      }

      return embed;
    } catch (err) {
      console.error('[DocsService] Fehler beim Generieren von Embed:', err);
      throw err;
    }
  }

  /**
   * Lädt Bild-Attachment für Doc (falls vorhanden)
   * @param {Object} doc - Doc-Objekt
   * @returns {Object|null} Attachment-Objekt oder null
   */
  getImageAttachment(doc) {
    try {
      const imageName = doc.frontmatter.image;

      if (!imageName) {
        return null;
      }

      const imagePath = path.join(this.imagesPath, imageName);

      if (!fs.existsSync(imagePath)) {
        console.warn(`[DocsService] ⚠️ Bild nicht gefunden: ${imageName} (für ${doc.filename})`);
        return null;
      }

      return {
        attachment: imagePath,
        name: imageName
      };
    } catch (err) {
      console.warn('[DocsService] ⚠️ Fehler beim Laden von Bild:', err.message);
      return null;
    }
  }

  /**
   * Gibt einzelnes Doc zurück (nach Filename)
   * @param {string} filename - Dateiname (z.B. "tts-system.md")
   * @returns {Object|null} Doc-Objekt oder null
   */
  getDocByFilename(filename) {
    try {
      // Erstmal aus Cache versuchen
      if (this.docsCache.has(filename)) {
        return this.docsCache.get(filename);
      }

      // Falls nicht in Cache: Neu laden
      const docs = this.loadFeatureDocs();
      return docs.find(doc => doc.filename === filename) || null;
    } catch (err) {
      console.error('[DocsService] Fehler beim Abrufen von Doc:', err);
      return null;
    }
  }

  /**
   * Erstellt Message-Payload für Discord (Embed + Bild)
   * @param {Object} doc - Doc-Objekt
   * @returns {Object} Discord-Message-Payload { embeds: [...], files: [...] }
   */
  createMessagePayload(doc) {
    const embed = this.generateEmbed(doc);
    const payload = { embeds: [embed] };

    // Bild anhängen falls vorhanden
    const imageAttachment = this.getImageAttachment(doc);
    if (imageAttachment) {
      payload.files = [imageAttachment];
      // Bild im Embed anzeigen
      embed.setImage(`attachment://${imageAttachment.name}`);
    }

    return payload;
  }

  /**
   * Synct Feature-Docs zum Forum-Channel
   * @param {Object} client - Discord.js Client
   * @param {Object|null} fileChanges - { changed: [], deleted: [] } oder null für Full-Sync
   * @returns {Object} Sync-Result mit Stats
   */
  async syncToChannel(client, fileChanges = null) {
    try {
      console.log('[DocsService] 🔄 Starte Forum-Sync...');

      const forumChannelId = this.config.docsForum?.channelId;

      if (!forumChannelId) {
        throw new Error('Forum-Channel-ID nicht konfiguriert (DOCS_FORUM_CHANNEL_ID in .env fehlt)');
      }

      // Forum-Channel abrufen
      const forumChannel = await client.channels.fetch(forumChannelId);

      if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        throw new Error(`Channel ${forumChannelId} nicht gefunden oder kein Forum-Channel`);
      }

      // Partial oder Full Sync?
      if (fileChanges && (fileChanges.changed?.length > 0 || fileChanges.deleted?.length > 0)) {
        return await this._syncPartial(client, forumChannel, fileChanges);
      }

      return await this._syncFull(client, forumChannel);
    } catch (err) {
      console.error('[DocsService] ❌ Sync-Fehler:', err);
      throw err;
    }
  }

  /**
   * Full-Sync: Alle Docs syncen
   */
  async _syncFull(client, forumChannel) {
    console.log('[DocsService] 📋 Full-Sync...');

    // Docs laden (fresh, kein Cache)
    const docs = this.loadFeatureDocs(true);

    if (docs.length === 0) {
      throw new Error('Keine Feature-Docs gefunden in docs/features/');
    }

    const syncResults = {
      success: 0,
      failed: 0,
      features: []
    };

    // Docs nach Kategorie gruppieren
    const docsByCategory = this._groupDocsByCategory(docs);

    // Pro Kategorie: Forum-Post holen/erstellen
    for (const [category, categoryDocs] of Object.entries(docsByCategory)) {
      try {
        console.log(`[DocsService] 📂 Verarbeite Kategorie: ${category} (${categoryDocs.length} Docs)`);

        // Forum-Post erstellen oder abrufen
        const thread = await this._getOrCreateForumPost(forumChannel, category);
        this.state.forumPostIds[category] = thread.id;

        // Initialisiere threadMessages für diesen Thread
        if (!this.state.threadMessages[thread.id]) {
          this.state.threadMessages[thread.id] = {};
        }

        // Jedes Doc in den Thread posten/updaten
        for (const doc of categoryDocs) {
          try {
            const featureKey = doc.filename.replace('.md', '');
            const existingMessageId = this.state.threadMessages[thread.id][featureKey];

            // Message-Payload erstellen
            const payload = await this._createMessagePayloadWithLinks(doc, thread, client);

            // Post oder Update
            const messageId = await this._postOrUpdateMessage(thread, existingMessageId, payload);

            if (messageId) {
              this.state.threadMessages[thread.id][featureKey] = messageId;
              syncResults.success++;
              syncResults.features.push({
                name: doc.frontmatter.title,
                category: category,
                status: 'success',
                messageId: messageId,
                threadId: thread.id
              });
              console.log(`[DocsService]   ✅ ${doc.frontmatter.title}`);
            }
          } catch (err) {
            syncResults.failed++;
            syncResults.features.push({
              name: doc.frontmatter.title,
              category: category,
              status: 'failed',
              error: err.message
            });
            console.error(`[DocsService]   ❌ ${doc.frontmatter.title}:`, err.message);
          }
        }
      } catch (err) {
        console.error(`[DocsService] ❌ Fehler bei Kategorie ${category}:`, err.message);
      }
    }

    // Übersicht-Message im Overview-Thread updaten
    await this._updateOverviewMessage(client, docsByCategory);

    // State speichern
    this.state.lastSync = new Date().toISOString();
    this._saveState();

    console.log(`[DocsService] ✅ Full-Sync abgeschlossen (${syncResults.success}/${docs.length} erfolgreich)`);

    return syncResults;
  }

  /**
   * Partial-Sync: Nur geänderte/gelöschte Files syncen
   */
  async _syncPartial(client, forumChannel, fileChanges) {
    const { changed = [], deleted = [] } = fileChanges;
    console.log(`[DocsService] 📋 Partial-Sync (${changed.length} geändert, ${deleted.length} gelöscht)`);

    const syncResults = {
      success: 0,
      failed: 0,
      deleted: 0,
      features: []
    };

    // Geänderte Files syncen
    for (const filename of changed) {
      try {
        const filePath = path.join(this.docsPath, filename);
        if (!fs.existsSync(filePath)) continue;

        const doc = this.parseMarkdown(filePath);
        this.docsCache.set(doc.filename, doc);

        const category = doc.frontmatter.category || 'Sonstiges';
        const featureKey = filename.replace('.md', '');

        // Forum-Post für Kategorie holen/erstellen
        const thread = await this._getOrCreateForumPost(forumChannel, category);
        this.state.forumPostIds[category] = thread.id;

        if (!this.state.threadMessages[thread.id]) {
          this.state.threadMessages[thread.id] = {};
        }

        const existingMessageId = this.state.threadMessages[thread.id][featureKey];
        const payload = await this._createMessagePayloadWithLinks(doc, thread, client);
        const messageId = await this._postOrUpdateMessage(thread, existingMessageId, payload);

        if (messageId) {
          this.state.threadMessages[thread.id][featureKey] = messageId;
          syncResults.success++;
          console.log(`[DocsService]   ✅ ${doc.frontmatter.title} (aktualisiert)`);
        }
      } catch (err) {
        syncResults.failed++;
        console.error(`[DocsService]   ❌ ${filename}:`, err.message);
      }
    }

    // Gelöschte Files: Messages entfernen
    for (const filename of deleted) {
      try {
        const featureKey = filename.replace('.md', '');
        await this._removeDeletedMessage(client, featureKey);
        syncResults.deleted++;
        console.log(`[DocsService]   🗑️ ${filename} (Message entfernt)`);
      } catch (err) {
        console.error(`[DocsService]   ⚠️ Konnte Message für ${filename} nicht löschen:`, err.message);
      }
    }

    // Übersicht-Message updaten (nur wenn was geändert wurde)
    if (changed.length > 0 || deleted.length > 0) {
      const docs = this.loadFeatureDocs(true);
      const docsByCategory = this._groupDocsByCategory(docs);
      await this._updateOverviewMessage(client, docsByCategory);
    }

    // State speichern
    this.state.lastSync = new Date().toISOString();
    this._saveState();

    console.log(`[DocsService] ✅ Partial-Sync abgeschlossen (${syncResults.success} aktualisiert, ${syncResults.deleted} gelöscht)`);

    return syncResults;
  }

  /**
   * Entfernt Message für gelöschtes File
   */
  async _removeDeletedMessage(client, featureKey) {
    // Suche in allen Threads
    for (const [threadId, messages] of Object.entries(this.state.threadMessages)) {
      if (messages[featureKey]) {
        try {
          const thread = await client.channels.fetch(threadId);
          if (thread) {
            const message = await thread.messages.fetch(messages[featureKey]);
            await message.delete();
          }
        } catch (err) {
          // Ignorieren falls bereits gelöscht
        }
        delete messages[featureKey];
        break;
      }
    }
  }

  /**
   * Erstellt oder holt Forum-Post für eine Kategorie
   */
  async _getOrCreateForumPost(forumChannel, category) {
    try {
      const existingPostId = this.state.forumPostIds[category];

      // Versuche bestehenden Post zu holen
      if (existingPostId) {
        try {
          const thread = await forumChannel.threads.fetch(existingPostId);
          if (thread && !thread.archived) {
            console.log(`[DocsService]   🔄 Nutze bestehenden Forum-Post: ${category}`);
            return thread;
          }
        } catch (err) {
          console.warn(`[DocsService]   ⚠️ Bestehender Forum-Post ${existingPostId} nicht gefunden`);
        }
      }

      // Neuen Forum-Post erstellen
      const categoryEmoji = this._getCategoryEmoji(category);
      const threadName = `${categoryEmoji} ${category}`;

      const thread = await forumChannel.threads.create({
        name: threadName,
        message: {
          content: `**${categoryEmoji} ${category}**\n\nDokumentation für alle ${category}-Features.`
        },
        autoArchiveDuration: 10080, // 7 Tage
        reason: `Docs-Forum-Post für Kategorie: ${category}`
      });

      console.log(`[DocsService]   ✅ Neuer Forum-Post erstellt: ${threadName}`);
      return thread;

    } catch (err) {
      console.error(`[DocsService] ❌ Fehler beim Forum-Post-Management für ${category}:`, err);
      throw err;
    }
  }

  /**
   * Aktualisiert die Bot-Message im Übersicht-Thread
   */
  async _updateOverviewMessage(client, docsByCategory) {
    try {
      const overviewThreadId = this.config.docsForum?.overviewThreadId;

      if (!overviewThreadId) {
        console.warn('[DocsService] ⚠️ Übersicht-Thread-ID nicht konfiguriert');
        return;
      }

      const thread = await client.channels.fetch(overviewThreadId);

      if (!thread) {
        console.warn('[DocsService] ⚠️ Übersicht-Thread nicht gefunden');
        return;
      }

      // Payload erstellen
      const payload = await this._createOverviewPayload(docsByCategory, thread.guild);

      // Bestehende Bot-Message editieren oder neue erstellen
      const existingMessageId = this.state.overviewBotMessageId;

      if (existingMessageId) {
        try {
          const message = await thread.messages.fetch(existingMessageId);
          await message.edit(payload);
          console.log('[DocsService] ✅ Übersicht-Message aktualisiert');
          return;
        } catch (err) {
          console.warn('[DocsService] ⚠️ Konnte bestehende Übersicht-Message nicht editieren');
        }
      }

      // Neue Message erstellen
      const message = await thread.send(payload);
      this.state.overviewBotMessageId = message.id;
      console.log('[DocsService] ✅ Übersicht-Message erstellt');

    } catch (err) {
      console.error('[DocsService] ❌ Fehler beim Update der Übersicht:', err);
    }
  }

  /**
   * Erstellt Payload für Übersicht-Message
   */
  async _createOverviewPayload(docsByCategory, guild) {
    const forumChannelId = this.config.docsForum?.channelId;

    // Haupt-Embed
    const mainEmbed = new EmbedBuilder()
      .setTitle('📚 Dokumentations-Übersicht')
      .setDescription('Alle Stream-Features und Infos, organisiert nach Kategorien.')
      .setColor('#5865F2')
      .setTimestamp();

    // Footer mit Statistik
    const totalFeatures = Object.values(docsByCategory).flat().length;
    mainEmbed.setFooter({
      text: `${Object.keys(docsByCategory).length} Kategorien • ${totalFeatures} Features • Zuletzt aktualisiert`
    });

    const embeds = [mainEmbed];

    // Nach Kategorien sortiert → je 1 Embed
    const sortedCategories = Object.keys(docsByCategory).sort();

    for (const category of sortedCategories) {
      const categoryDocs = docsByCategory[category];
      const threadId = this.state.forumPostIds[category];
      const categoryEmoji = this._getCategoryEmoji(category);

      const categoryEmbed = new EmbedBuilder()
        .setColor('#5865F2');

      if (threadId) {
        // Link zum Forum-Post
        const threadUrl = `https://discord.com/channels/${guild.id}/${threadId}`;

        categoryEmbed.setTitle(`${categoryEmoji} ${category}`);
        categoryEmbed.setURL(threadUrl);

        // Feature-Liste als Description
        const threadMessages = this.state.threadMessages[threadId] || {};
        const lines = [];

        categoryDocs.forEach(doc => {
          const featureKey = doc.filename.replace('.md', '');
          const messageId = threadMessages[featureKey];

          if (messageId) {
            const messageUrl = `https://discord.com/channels/${guild.id}/${threadId}/${messageId}`;
            lines.push(`${doc.frontmatter.emoji} [${doc.frontmatter.title}](${messageUrl})`);
          } else {
            lines.push(`${doc.frontmatter.emoji} ${doc.frontmatter.title} _(wird gesynct...)_`);
          }
        });

        categoryEmbed.setDescription(lines.join('\n'));
      } else {
        categoryEmbed.setTitle(`${categoryEmoji} ${category}`);
        categoryEmbed.setDescription('_Forum-Post wird erstellt..._');
      }

      embeds.push(categoryEmbed);
    }

    // Discord Limit: Max 10 Embeds pro Message
    if (embeds.length > 10) {
      console.warn(`[DocsService] ⚠️ ${embeds.length} Embeds generiert, Discord-Limit ist 10`);
      return { embeds: embeds.slice(0, 10) };
    }

    return { embeds };
  }

  /**
   * Erstellt Message-Payload mit internen Links
   */
  async _createMessagePayloadWithLinks(doc, thread, client) {
    const embed = this.generateEmbed(doc);
    const payload = { embeds: [embed] };

    // Bild anhängen falls vorhanden
    const imageAttachment = this.getImageAttachment(doc);
    if (imageAttachment) {
      payload.files = [imageAttachment];
      embed.setImage(`attachment://${imageAttachment.name}`);
    }

    // Interne Links in Content ersetzen
    const description = embed.data.description;
    if (description) {
      const processedDescription = await this._processInternalLinks(description, thread, client);
      embed.setDescription(processedDescription);
    }

    return payload;
  }

  /**
   * Verarbeitet interne Links im Markdown
   */
  async _processInternalLinks(markdown, thread, client) {
    const linkPattern = /\[([^\]]+)\]\(#([a-zA-Z0-9\-_]+)\)/g;

    let result = markdown;
    const matches = [...markdown.matchAll(linkPattern)];

    for (const match of matches) {
      const [fullMatch, linkText, docId] = match;

      let foundMessageId = null;
      let foundThreadId = null;

      for (const [threadId, messages] of Object.entries(this.state.threadMessages)) {
        if (messages[docId]) {
          foundMessageId = messages[docId];
          foundThreadId = threadId;
          break;
        }
      }

      if (foundMessageId && foundThreadId) {
        const jumpLink = `https://discord.com/channels/${thread.guild.id}/${foundThreadId}/${foundMessageId}`;
        result = result.replace(fullMatch, `[${linkText}](${jumpLink})`);
      } else {
        result = result.replace(fullMatch, `${linkText} _(Link zu ${docId} noch nicht verfügbar)_`);
      }
    }

    return result;
  }

  /**
   * Postet neue Message oder editiert bestehende
   */
  async _postOrUpdateMessage(channel, messageId, payload) {
    try {
      if (messageId) {
        try {
          const message = await channel.messages.fetch(messageId);
          await message.edit(payload);
          console.log(`[DocsService]     📝 Message ${messageId} editiert`);
          return messageId;
        } catch (err) {
          console.warn(`[DocsService]     ⚠️ Konnte Message ${messageId} nicht editieren`);
        }
      }

      const message = await channel.send(payload);
      console.log(`[DocsService]     ➕ Neue Message gepostet: ${message.id}`);
      return message.id;

    } catch (err) {
      console.error('[DocsService] ❌ Fehler beim Message-Management:', err);
      throw err;
    }
  }

  /**
   * Gruppiert Docs nach Kategorie
   */
  _groupDocsByCategory(docs) {
    const grouped = {};

    docs.forEach(doc => {
      const category = doc.frontmatter.category || 'Ohne Kategorie';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(doc);
    });

    return grouped;
  }

  /**
   * Gibt passendes Emoji für eine Kategorie zurück
   */
  _getCategoryEmoji(category) {
    const categoryEmojis = {
      'Features': '✨',
      'ChatBefehl': '❗',
      'Stream Spezifisch': '🔎',
      'Discord Bot': '👾',
      'Tools': '🔧',
      'API': '🔌',
      'Bot': '🤖',
      'Streaming': '🎥',
      'Community': '👥',
      'Ohne Kategorie': '📁'
    };

    return categoryEmojis[category] || '📄';
  }

  /**
   * Konvertiert einfaches Markdown zu Discord-Format
   */
  _convertMarkdownToDiscord(markdown) {
    let result = markdown;

    // Überschriften zu fett konvertieren
    result = result.replace(/^### (.*$)/gim, '**$1**');
    result = result.replace(/^## (.*$)/gim, '**$1**');
    result = result.replace(/^# (.*$)/gim, '**$1**');

    // Listenpunkte zu Bullet Points
    result = result.replace(/^[-*] (.*$)/gim, '• $1');
    result = result.replace(/^\s{2,}[-*] (.*$)/gim, '  • $1');

    // Mehrere Leerzeilen reduzieren
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
  }

  /**
   * Speichert State in JSON-File
   */
  _saveState() {
    try {
      const configDir = path.dirname(this.statePath);

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
      console.log('[DocsService] 💾 State gespeichert');
    } catch (err) {
      console.error('[DocsService] ❌ Fehler beim Speichern von State:', err);
    }
  }

  /**
   * Generiert Kurzfassung aller Commands für Stream-Beschreibung
   */
  generateStreamSummary() {
    const docs = this.loadFeatureDocs();
    const commands = docs.filter(doc => doc.frontmatter.type === 'command');
    if (commands.length === 0) return 'Keine Commands gefunden.';

    commands.sort((a, b) => (parseInt(a.frontmatter.order) || 999) - (parseInt(b.frontmatter.order) || 999));

    const paid = commands.filter(doc => doc.frontmatter.group === 'paid');
    const free = commands.filter(doc => doc.frontmatter.group === 'free');
    const sep = '──────────────────────────────';
    const lines = [];

    if (paid.length > 0) {
      lines.push('🛠️ STREAM-INTERAKTION (POINTS)');
      lines.push(sep);
      for (const doc of paid) {
        const { emoji, usage, cost, summary } = doc.frontmatter;
        lines.push(`${emoji} ${usage} | ${cost} | ${summary}`);
        lines.push(sep);
      }
    }

    if (free.length > 0) {
      if (paid.length > 0) lines.push('');
      lines.push('✨ KOSTENLOSE COMMANDS');
      lines.push(sep);
      for (const doc of free) {
        const { emoji, usage, summary } = doc.frontmatter;
        lines.push(`${emoji} ${usage} | ${summary}`);
        lines.push(sep);
      }
    }

    return lines.join('\n');
  }

  /**
   * Gibt Statistiken zurück
   */
  getStats() {
    const featureCount = Object.values(this.state.threadMessages)
      .reduce((sum, msgs) => sum + Object.keys(msgs).length, 0);

    return {
      cachedDocs: this.docsCache.size,
      syncedFeatures: featureCount,
      forumPosts: Object.keys(this.state.forumPostIds).length,
      lastSync: this.state.lastSync
    };
  }
}

module.exports = DocsService;
