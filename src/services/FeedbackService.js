/**
 * FeedbackService
 *
 * Verwaltet Bug-Reports und Feature-Requests:
 * - Erstellt Threads in #feedback Channel
 * - Voting via Reactions (👍/👎)
 * - Status-Updates (open, in_progress, resolved, wont_fix)
 * - Dashboard mit Statistiken
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

class FeedbackService {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.statePath = path.join(__dirname, '../../config/feedback-state.json');

    // State (alle Feedbacks)
    this.state = {
      feedbackThreads: {}, // threadId -> feedback-object
      top10MessageId: null,  // Message-ID der gepinnten Top-10-Liste (ALT, deprecated)
      top10BugsMessageId: null,  // Message-ID Top-10 Bugs
      top10RequestsMessageId: null,  // Message-ID Top-10 Requests
      lastUpdate: null
    };

    // Interval-Timer für Auto-Updates
    this.top10UpdateInterval = null;
    this.autoArchiveInterval = null;

    console.log('[FeedbackService] Initialisiert');
  }

  /**
   * Initialisiert Service (lädt State)
   */
  async init() {
    try {
      // State-File laden falls vorhanden
      if (fs.existsSync(this.statePath)) {
        const stateData = fs.readFileSync(this.statePath, 'utf8');
        this.state = JSON.parse(stateData);

        // Migration: netVotes berechnen für alte Feedbacks
        let migratedNetVotes = 0;
        let migratedTags = 0;

        for (const feedback of Object.values(this.state.feedbackThreads)) {
          let changed = false;

          // Migration 1: netVotes
          if (feedback.netVotes === undefined) {
            feedback.netVotes = (feedback.votes?.thumbsUp || 0) - (feedback.votes?.thumbsDown || 0);
            migratedNetVotes++;
            changed = true;
          }

          // Migration 2: Tags
          if (!feedback.tags) {
            feedback.tags = [];
            migratedTags++;
            changed = true;
          }

          // Migration 3: Category (aus type ableiten, falls nicht vorhanden)
          if (!feedback.category) {
            feedback.category = feedback.type; // "bug" oder "request"
            changed = true;
          }
        }

        // Migration 4: Top-10-Messages splitten (ALT: top10MessageId → NEU: 2 separate Messages)
        if (this.state.top10MessageId && !this.state.top10BugsMessageId) {
          console.log('[FeedbackService] ℹ️ Migration: Splitte Top-10-Message in Bugs & Requests');
          this.state.top10BugsMessageId = null;
          this.state.top10RequestsMessageId = null;
          delete this.state.top10MessageId;
        }

        if (migratedNetVotes > 0 || migratedTags > 0) {
          console.log(`[FeedbackService] ℹ️ Migration abgeschlossen:`);
          if (migratedNetVotes > 0) console.log(`  - ${migratedNetVotes} Feedbacks: netVotes berechnet`);
          if (migratedTags > 0) console.log(`  - ${migratedTags} Feedbacks: tags hinzugefügt`);
          this._saveState();
        }

        const feedbackCount = Object.keys(this.state.feedbackThreads).length;
        console.log(`[FeedbackService] ✅ State geladen (${feedbackCount} Feedbacks)`);
      } else {
        console.log('[FeedbackService] ℹ️ Kein State-File gefunden, starte mit leerem State');
      }

      console.log('[FeedbackService] ✅ Initialisierung abgeschlossen');
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler bei Initialisierung:', err);
      throw err;
    }
  }

  /**
   * Erstellt Bug-Report-Thread
   * @param {Object} data - Bug-Report-Daten
   * @returns {Object} { success, threadId, threadUrl }
   */
  async createBugReport(data) {
    try {
      const { category, title, description, reproducibility, author } = data;

      console.log(`[FeedbackService] 🐛 Erstelle Bug-Report: ${title}`);

      // Embed erstellen
      const embed = new EmbedBuilder()
        .setTitle(`🐛 ${title}`)
        .setDescription(description)
        .setColor('#ED4245') // Discord Red
        .addFields(
          { name: 'Kategorie', value: category, inline: true },
          { name: 'Reproduzierbarkeit', value: reproducibility, inline: true },
          { name: 'Status', value: `${this.config.feedback.statusEmojis.open} ${this.config.feedback.statusLabels.open}`, inline: true },
          { name: 'Voting', value: '👍 0 | 👎 0', inline: false }
        )
        .setFooter({ text: `Erstellt von ${author.tag}`, iconURL: author.displayAvatarURL() })
        .setTimestamp();

      // Thread erstellen
      const result = await this._createFeedbackThread({
        type: 'bug',
        embed,
        title,
        category,
        author,
        additionalData: { reproducibility }
      });

      console.log(`[FeedbackService] ✅ Bug-Report erstellt: ${result.threadId}`);

      return result;
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Erstellen von Bug-Report:', err);
      throw err;
    }
  }

  /**
   * Erstellt Feature-Request-Thread
   * @param {Object} data - Feature-Request-Daten
   * @returns {Object} { success, threadId, threadUrl }
   */
  async createFeatureRequest(data) {
    try {
      const { category, title, description, priority, author } = data;

      console.log(`[FeedbackService] ✨ Erstelle Feature-Request: ${title}`);

      // Embed erstellen
      const embed = new EmbedBuilder()
        .setTitle(`✨ ${title}`)
        .setDescription(description)
        .setColor('#5865F2') // Discord Blurple
        .addFields(
          { name: 'Kategorie', value: category, inline: true },
          { name: 'Priorität', value: priority, inline: true },
          { name: 'Status', value: `${this.config.feedback.statusEmojis.open} ${this.config.feedback.statusLabels.open}`, inline: true },
          { name: 'Voting', value: '👍 0 | 👎 0', inline: false }
        )
        .setFooter({ text: `Erstellt von ${author.tag}`, iconURL: author.displayAvatarURL() })
        .setTimestamp();

      // Thread erstellen
      const result = await this._createFeedbackThread({
        type: 'request',
        embed,
        title,
        category,
        author,
        additionalData: { priority }
      });

      console.log(`[FeedbackService] ✅ Feature-Request erstellt: ${result.threadId}`);

      return result;
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Erstellen von Feature-Request:', err);
      throw err;
    }
  }

  /**
   * Erstellt Feedback (Bug oder Feature-Request) - NEUE vereinfachte Methode
   * @param {Object} data - Feedback-Daten (type, title, description, author, tags)
   * @returns {Object} { success, threadId, threadUrl }
   */
  async createFeedback(data) {
    try {
      const { type, title, description, author, tags = [] } = data;

      console.log(`[FeedbackService] ${type === 'bug' ? '🐛' : '✨'} Erstelle ${type}: ${title} (Tags: ${tags.join(', ') || 'keine'})`);

      // Embed erstellen (mit Tags)
      const embed = new EmbedBuilder()
        .setTitle(`${type === 'bug' ? '🐛' : '✨'} ${title}`)
        .setDescription(description)
        .setColor(type === 'bug' ? '#ED4245' : '#5865F2')
        .addFields(
          {
            name: 'Tags',
            value: tags.length > 0 ? tags.map(t => `\`${t}\``).join(', ') : 'Keine Tags',
            inline: false
          },
          {
            name: 'Status',
            value: `${this.config.feedback.statusEmojis.open} ${this.config.feedback.statusLabels.open}`,
            inline: true
          },
          {
            name: 'Voting',
            value: '👍 0 | 👎 0',
            inline: true
          }
        )
        .setFooter({ text: `Erstellt von ${author.tag}`, iconURL: author.displayAvatarURL() })
        .setTimestamp();

      const channelId = this.config.channels.feedback;

      if (!channelId) {
        throw new Error('Feedback-Channel nicht konfiguriert (FEEDBACK_CHANNEL_ID in .env fehlt)');
      }

      // Channel abrufen
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        throw new Error(`Channel ${channelId} nicht gefunden oder kein Text-Channel`);
      }

      // Erste Nachricht posten
      const message = await channel.send({ embeds: [embed] });

      // Thread erstellen
      const threadName = type === 'bug'
        ? `🐛 ${title.substring(0, 90)}`
        : `✨ ${title.substring(0, 90)}`;

      const thread = await message.startThread({
        name: threadName,
        autoArchiveDuration: 10080, // 7 Tage
        reason: `${type === 'bug' ? 'Bug-Report' : 'Feature-Request'} von ${author.tag}`
      });

      // Voting-Reactions hinzufügen
      try {
        await message.react('👍');
        await message.react('👎');
      } catch (err) {
        console.warn('[FeedbackService] ⚠️ Konnte Reactions nicht hinzufügen:', err.message);
      }

      // In State speichern (mit Tags und Category)
      const feedback = {
        threadId: thread.id,
        type: type,
        category: type, // "bug" oder "request" (für Kompatibilität)
        title: title,
        description: description,
        tags: tags, // NEU: Tags-Array
        authorId: author.id,
        authorTag: author.tag,
        status: 'open',
        votes: { thumbsUp: 0, thumbsDown: 0 },
        netVotes: 0,  // Für Sortierung
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageId: message.id,
        channelId: channel.id
      };

      this.state.feedbackThreads[thread.id] = feedback;
      this._saveState();

      const threadUrl = `https://discord.com/channels/${channel.guild.id}/${thread.id}`;

      console.log(`[FeedbackService] ✅ Feedback erstellt: ${thread.id}`);

      return {
        success: true,
        threadId: thread.id,
        threadUrl: threadUrl
      };
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Erstellen von Feedback:', err);
      throw err;
    }
  }

  /**
   * Interne Methode: Erstellt Feedback-Thread (generisch für Bugs & Requests)
   * @param {Object} options - Thread-Options
   * @returns {Object} { success, threadId, threadUrl }
   */
  async _createFeedbackThread(options) {
    try {
      const { type, embed, title, category, author, additionalData } = options;

      const channelId = this.config.channels.feedback;

      if (!channelId) {
        throw new Error('Feedback-Channel nicht konfiguriert (FEEDBACK_CHANNEL_ID in .env fehlt)');
      }

      // Channel abrufen
      const channel = await this.client.channels.fetch(channelId);

      if (!channel || !channel.isTextBased()) {
        throw new Error(`Channel ${channelId} nicht gefunden oder kein Text-Channel`);
      }

      // Erste Nachricht posten
      const message = await channel.send({ embeds: [embed] });

      // Thread erstellen
      const threadName = type === 'bug'
        ? `🐛 ${title.substring(0, 90)}`  // Max 100 chars für Thread-Name
        : `✨ ${title.substring(0, 90)}`;

      const thread = await message.startThread({
        name: threadName,
        autoArchiveDuration: 10080, // 7 Tage
        reason: `${type === 'bug' ? 'Bug-Report' : 'Feature-Request'} von ${author.tag}`
      });

      // Voting-Reactions hinzufügen
      try {
        await message.react('👍');
        await message.react('👎');
      } catch (err) {
        console.warn('[FeedbackService] ⚠️ Konnte Reactions nicht hinzufügen:', err.message);
      }

      // In State speichern
      const feedback = {
        threadId: thread.id,
        type: type,
        category: category,
        title: title,
        description: embed.data.description,
        ...additionalData, // reproducibility oder priority
        authorId: author.id,
        authorTag: author.tag,
        status: 'open',
        votes: { thumbsUp: 0, thumbsDown: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageId: message.id,
        channelId: channel.id
      };

      this.state.feedbackThreads[thread.id] = feedback;
      this._saveState();

      const threadUrl = `https://discord.com/channels/${channel.guild.id}/${thread.id}`;

      return {
        success: true,
        threadId: thread.id,
        threadUrl: threadUrl
      };
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Erstellen von Thread:', err);
      throw err;
    }
  }

  /**
   * Updated Status eines Feedbacks
   * @param {string} threadId - Thread-ID
   * @param {string} newStatus - Neuer Status (open, in_progress, resolved, wont_fix)
   * @returns {Object} { success }
   */
  async updateStatus(threadId, newStatus) {
    try {
      const feedback = this.state.feedbackThreads[threadId];

      if (!feedback) {
        throw new Error('Feedback nicht gefunden (Thread-ID ungültig oder Feedback wurde gelöscht)');
      }

      const validStatuses = ['open', 'in_progress', 'resolved', 'wont_fix'];
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Ungültiger Status: ${newStatus} (erlaubt: ${validStatuses.join(', ')})`);
      }

      console.log(`[FeedbackService] 🔄 Update Status: ${threadId} → ${newStatus}`);

      // Original-Message abrufen und editieren
      const channel = await this.client.channels.fetch(feedback.channelId);
      const message = await channel.messages.fetch(feedback.messageId);

      const oldEmbed = message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed);

      // Status-Field updaten
      const statusEmoji = this.config.feedback.statusEmojis[newStatus];
      const statusLabel = this.config.feedback.statusLabels[newStatus];

      const statusFieldIndex = newEmbed.data.fields.findIndex(f => f.name === 'Status');
      if (statusFieldIndex !== -1) {
        newEmbed.data.fields[statusFieldIndex].value = `${statusEmoji} ${statusLabel}`;
      }

      await message.edit({ embeds: [newEmbed] });

      // State updaten
      feedback.status = newStatus;
      feedback.updatedAt = new Date().toISOString();
      this._saveState();

      // Update-Nachricht im Thread posten
      try {
        const thread = await this.client.channels.fetch(threadId);
        await thread.send(`**Status geändert:** ${statusEmoji} ${statusLabel}`);
      } catch (err) {
        console.warn('[FeedbackService] ⚠️ Konnte Update-Nachricht nicht posten:', err.message);
      }

      console.log(`[FeedbackService] ✅ Status updated: ${threadId} → ${newStatus}`);

      return { success: true };
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Update von Status:', err);
      throw err;
    }
  }

  /**
   * Synct Voting-Counts von Reactions (on-demand)
   * @param {string} threadId - Thread-ID
   * @returns {Object} { thumbsUp, thumbsDown }
   */
  async syncVotingCounts(threadId) {
    try {
      const feedback = this.state.feedbackThreads[threadId];

      if (!feedback) {
        throw new Error('Feedback nicht gefunden');
      }

      // Message abrufen
      const channel = await this.client.channels.fetch(feedback.channelId);
      const message = await channel.messages.fetch(feedback.messageId);

      // Reactions zählen
      let thumbsUp = 0;
      let thumbsDown = 0;

      const reactions = message.reactions.cache;

      const thumbsUpReaction = reactions.find(r => r.emoji.name === '👍');
      const thumbsDownReaction = reactions.find(r => r.emoji.name === '👎');

      if (thumbsUpReaction) {
        thumbsUp = thumbsUpReaction.count - 1; // -1 weil Bot selbst reagiert hat
      }

      if (thumbsDownReaction) {
        thumbsDown = thumbsDownReaction.count - 1;
      }

      // State updaten
      feedback.votes = { thumbsUp, thumbsDown };
      this._saveState();

      return { thumbsUp, thumbsDown };
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Sync von Votes:', err);
      throw err;
    }
  }

  /**
   * Synct alle Voting-Counts (für Dashboard)
   */
  async syncAllVotingCounts() {
    console.log('[FeedbackService] 🔄 Sync alle Voting-Counts...');

    let synced = 0;
    let failed = 0;

    for (const threadId of Object.keys(this.state.feedbackThreads)) {
      try {
        await this.syncVotingCounts(threadId);
        synced++;
      } catch (err) {
        console.warn(`[FeedbackService] ⚠️ Sync failed für ${threadId}:`, err.message);
        failed++;
      }
    }

    console.log(`[FeedbackService] ✅ Voting-Sync abgeschlossen (${synced}/${synced + failed})`);

    return { synced, failed };
  }

  /**
   * Generiert Dashboard-Statistiken
   * @returns {Object} Dashboard-Daten
   */
  async getDashboardStats() {
    try {
      console.log('[FeedbackService] 📊 Generiere Dashboard-Stats...');

      // Alle Votes syncen
      await this.syncAllVotingCounts();

      const feedbacks = Object.values(this.state.feedbackThreads);

      // Nach Typ gruppieren
      const bugs = feedbacks.filter(f => f.type === 'bug');
      const requests = feedbacks.filter(f => f.type === 'request');

      // Nach Status gruppieren
      const bugsByStatus = {
        open: bugs.filter(f => f.status === 'open').length,
        in_progress: bugs.filter(f => f.status === 'in_progress').length,
        resolved: bugs.filter(f => f.status === 'resolved').length,
        wont_fix: bugs.filter(f => f.status === 'wont_fix').length
      };

      const requestsByStatus = {
        open: requests.filter(f => f.status === 'open').length,
        in_progress: requests.filter(f => f.status === 'in_progress').length,
        resolved: requests.filter(f => f.status === 'resolved').length,
        wont_fix: requests.filter(f => f.status === 'wont_fix').length
      };

      // Top 5 meist-gevotete Bugs
      const topBugs = bugs
        .sort((a, b) => b.votes.thumbsUp - a.votes.thumbsUp)
        .slice(0, 5)
        .map(f => ({
          threadId: f.threadId,
          title: f.title,
          votes: f.votes.thumbsUp,
          status: f.status
        }));

      // Top 5 meist-gevotete Requests
      const topRequests = requests
        .sort((a, b) => b.votes.thumbsUp - a.votes.thumbsUp)
        .slice(0, 5)
        .map(f => ({
          threadId: f.threadId,
          title: f.title,
          votes: f.votes.thumbsUp,
          status: f.status
        }));

      // Nach Kategorie gruppieren
      const byCategory = {};
      feedbacks.forEach(f => {
        if (!byCategory[f.category]) {
          byCategory[f.category] = { bugs: 0, requests: 0 };
        }
        if (f.type === 'bug') {
          byCategory[f.category].bugs++;
        } else {
          byCategory[f.category].requests++;
        }
      });

      console.log('[FeedbackService] ✅ Dashboard-Stats generiert');

      return {
        total: {
          bugs: bugs.length,
          requests: requests.length
        },
        bugsByStatus,
        requestsByStatus,
        topBugs,
        topRequests,
        byCategory
      };
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Generieren von Dashboard-Stats:', err);
      throw err;
    }
  }

  /**
   * Gibt Feedback-Objekt zurück (nach Thread-ID)
   * @param {string} threadId - Thread-ID
   * @returns {Object|null} Feedback-Objekt oder null
   */
  getFeedbackByThreadId(threadId) {
    return this.state.feedbackThreads[threadId] || null;
  }

  /**
   * Gibt alle Feedbacks zurück
   * @returns {Array} Array von Feedback-Objekten
   */
  getAllFeedbacks() {
    return Object.values(this.state.feedbackThreads);
  }

  /**
   * Speichert State in JSON-File
   */
  _saveState() {
    try {
      const configDir = path.dirname(this.statePath);

      // Config-Ordner erstellen falls nicht vorhanden
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      this.state.lastUpdate = new Date().toISOString();

      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
      console.log('[FeedbackService] 💾 State gespeichert');
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Speichern von State:', err);
    }
  }

  /**
   * Gibt Statistiken zurück
   * @returns {Object} Stats-Objekt
   */
  getStats() {
    const feedbacks = Object.values(this.state.feedbackThreads);
    return {
      total: feedbacks.length,
      bugs: feedbacks.filter(f => f.type === 'bug').length,
      requests: feedbacks.filter(f => f.type === 'request').length,
      open: feedbacks.filter(f => f.status === 'open').length,
      resolved: feedbacks.filter(f => f.status === 'resolved').length,
      lastUpdate: this.state.lastUpdate
    };
  }

  /**
   * Gibt Feedback-Objekt zurück (nach Message-ID)
   * @param {string} messageId - Message-ID
   * @returns {Object|null} Feedback-Objekt oder null
   */
  getFeedbackByMessageId(messageId) {
    const feedbacks = Object.values(this.state.feedbackThreads);
    return feedbacks.find(f => f.messageId === messageId) || null;
  }

  /**
   * Synct Voting-Counts LIVE (mit Embed-Update)
   * @param {string} threadId - Thread-ID
   * @returns {Object} { thumbsUp, thumbsDown, netVotes }
   */
  async syncVotingCountsLive(threadId) {
    try {
      const feedback = this.state.feedbackThreads[threadId];

      if (!feedback) {
        throw new Error('Feedback nicht gefunden');
      }

      // Message abrufen
      const channel = await this.client.channels.fetch(feedback.channelId);
      const message = await channel.messages.fetch(feedback.messageId);

      // Reactions zählen
      const reactions = message.reactions.cache;

      const thumbsUpReaction = reactions.find(r => r.emoji.name === '👍');
      const thumbsDownReaction = reactions.find(r => r.emoji.name === '👎');

      const thumbsUp = thumbsUpReaction ? thumbsUpReaction.count - 1 : 0; // -1 weil Bot selbst
      const thumbsDown = thumbsDownReaction ? thumbsDownReaction.count - 1 : 0;
      const netVotes = thumbsUp - thumbsDown;

      // State updaten
      feedback.votes = { thumbsUp, thumbsDown };
      feedback.netVotes = netVotes;
      feedback.updatedAt = new Date().toISOString();
      this._saveState();

      // Embed SOFORT updaten
      const oldEmbed = message.embeds[0];
      const newEmbed = EmbedBuilder.from(oldEmbed);

      // Voting-Field updaten
      const votingFieldIndex = newEmbed.data.fields.findIndex(f => f.name === 'Voting');
      if (votingFieldIndex !== -1) {
        newEmbed.data.fields[votingFieldIndex].value = `👍 ${thumbsUp} | 👎 ${thumbsDown}`;
      }

      await message.edit({ embeds: [newEmbed] });

      console.log(`[FeedbackService] ✅ Live-Sync: ${threadId} → 👍 ${thumbsUp} | 👎 ${thumbsDown}`);

      return { thumbsUp, thumbsDown, netVotes };
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Live-Sync:', err);
      throw err;
    }
  }

  /**
   * Gibt Top 10 Feedbacks nach Net-Votes zurück (DEPRECATED - Nutze getTop10Bugs() und getTop10Requests())
   * @returns {Array} Top 10 Feedbacks
   */
  getTop10() {
    const feedbacks = Object.values(this.state.feedbackThreads);

    return feedbacks
      .sort((a, b) => (b.netVotes || 0) - (a.netVotes || 0))
      .slice(0, 10)
      .map((f, index) => ({
        rank: index + 1,
        threadId: f.threadId,
        type: f.type,
        title: f.title,
        status: f.status,
        netVotes: f.netVotes || 0,
        thumbsUp: f.votes.thumbsUp,
        thumbsDown: f.votes.thumbsDown
      }));
  }

  /**
   * Gibt Top 10 Bugs nach Net-Votes zurück
   * @returns {Array} Top 10 Bugs
   */
  getTop10Bugs() {
    const bugs = Object.values(this.state.feedbackThreads).filter(f => f.type === 'bug');

    return bugs
      .sort((a, b) => (b.netVotes || 0) - (a.netVotes || 0))
      .slice(0, 10)
      .map((f, index) => ({
        rank: index + 1,
        threadId: f.threadId,
        title: f.title,
        status: f.status,
        tags: f.tags || [],
        netVotes: f.netVotes || 0,
        thumbsUp: f.votes.thumbsUp,
        thumbsDown: f.votes.thumbsDown
      }));
  }

  /**
   * Gibt Top 10 Feature-Requests nach Net-Votes zurück
   * @returns {Array} Top 10 Feature-Requests
   */
  getTop10Requests() {
    const requests = Object.values(this.state.feedbackThreads).filter(f => f.type === 'request');

    return requests
      .sort((a, b) => (b.netVotes || 0) - (a.netVotes || 0))
      .slice(0, 10)
      .map((f, index) => ({
        rank: index + 1,
        threadId: f.threadId,
        title: f.title,
        status: f.status,
        tags: f.tags || [],
        netVotes: f.netVotes || 0,
        thumbsUp: f.votes.thumbsUp,
        thumbsDown: f.votes.thumbsDown
      }));
  }

  /**
   * Erstellt oder updated die 2 gepinnten Top-10-Listen (Bugs & Requests)
   * @returns {Object} { success, bugsMessageId, requestsMessageId }
   */
  async updateTop10PinnedMessage() {
    try {
      const channelId = this.config.channels.feedback;

      if (!channelId) {
        throw new Error('Feedback-Channel nicht konfiguriert');
      }

      const channel = await this.client.channels.fetch(channelId);

      // Prüfen: Ist der Channel ein normaler Text-Channel (nicht Forum, nicht Thread)?
      const { ChannelType } = require('discord.js');
      const isValidChannel = channel.isTextBased() &&
                            !channel.isThread() &&
                            channel.type !== ChannelType.GuildForum &&
                            channel.type !== ChannelType.GuildAnnouncement;

      if (!isValidChannel) {
        console.warn('[FeedbackService] ⚠️ Feedback-Channel ist kein normaler Text-Channel');
        console.warn(`[FeedbackService] ℹ️ Channel-Type: ${channel.type} (benötigt: ${ChannelType.GuildText})`);
        console.warn('[FeedbackService] ℹ️ Bitte verwende einen normalen Text-Channel für FEEDBACK_CHANNEL_ID, NICHT Forum/Announcement');
        return {
          success: false,
          error: 'Channel ist kein normaler Text-Channel',
          bugsMessageId: null,
          requestsMessageId: null
        };
      }

      // Top 10 Bugs abrufen
      const top10Bugs = this.getTop10Bugs();

      // Embed für Bugs erstellen
      const bugsEmbed = new EmbedBuilder()
        .setTitle('🐛 Top 10 Bug-Reports')
        .setColor('#ED4245') // Discord Red
        .setTimestamp()
        .setFooter({ text: 'Aktualisiert alle 5 Minuten' });

      if (top10Bugs.length === 0) {
        bugsEmbed.setDescription('Es gibt noch keine Bug-Reports. Erstelle den ersten mit `/feedback`!');
      } else {
        let description = 'Die meist-gevoteten Bug-Reports\n\n';
        top10Bugs.forEach(item => {
          const statusEmoji = this.config.feedback.statusEmojis[item.status];
          const votes = item.netVotes >= 0 ? `+${item.netVotes}` : `${item.netVotes}`;
          const tags = item.tags.length > 0 ? item.tags.map(t => `\`${t}\``).join(' ') : '';

          description += `**${item.rank}.** ${statusEmoji} [${item.title}](https://discord.com/channels/${channel.guild.id}/${item.threadId})\n`;
          description += `└ 👍 ${item.thumbsUp} | 👎 ${item.thumbsDown} | **${votes}** ${tags ? '| ' + tags : ''}\n\n`;
        });

        bugsEmbed.setDescription(description);
      }

      // Bugs-Message erstellen/updaten
      if (this.state.top10BugsMessageId) {
        try {
          const message = await channel.messages.fetch(this.state.top10BugsMessageId);
          await message.edit({ embeds: [bugsEmbed] });
          console.log('[FeedbackService] ✅ Top-10-Bugs aktualisiert');
        } catch (err) {
          console.warn('[FeedbackService] Top-10-Bugs-Message nicht gefunden, erstelle neue');
          this.state.top10BugsMessageId = null;
        }
      }

      if (!this.state.top10BugsMessageId) {
        const message = await channel.send({ embeds: [bugsEmbed] });
        await message.pin();
        this.state.top10BugsMessageId = message.id;
        console.log('[FeedbackService] ✅ Top-10-Bugs erstellt und gepinnt');
      }

      // Top 10 Requests abrufen
      const top10Requests = this.getTop10Requests();

      // Embed für Requests erstellen
      const requestsEmbed = new EmbedBuilder()
        .setTitle('✨ Top 10 Feature-Requests')
        .setColor('#5865F2') // Discord Blurple
        .setTimestamp()
        .setFooter({ text: 'Aktualisiert alle 5 Minuten' });

      if (top10Requests.length === 0) {
        requestsEmbed.setDescription('Es gibt noch keine Feature-Requests. Erstelle den ersten mit `/feedback`!');
      } else {
        let description = 'Die meist-gevoteten Feature-Requests\n\n';
        top10Requests.forEach(item => {
          const statusEmoji = this.config.feedback.statusEmojis[item.status];
          const votes = item.netVotes >= 0 ? `+${item.netVotes}` : `${item.netVotes}`;
          const tags = item.tags.length > 0 ? item.tags.map(t => `\`${t}\``).join(' ') : '';

          description += `**${item.rank}.** ${statusEmoji} [${item.title}](https://discord.com/channels/${channel.guild.id}/${item.threadId})\n`;
          description += `└ 👍 ${item.thumbsUp} | 👎 ${item.thumbsDown} | **${votes}** ${tags ? '| ' + tags : ''}\n\n`;
        });

        requestsEmbed.setDescription(description);
      }

      // Requests-Message erstellen/updaten
      if (this.state.top10RequestsMessageId) {
        try {
          const message = await channel.messages.fetch(this.state.top10RequestsMessageId);
          await message.edit({ embeds: [requestsEmbed] });
          console.log('[FeedbackService] ✅ Top-10-Requests aktualisiert');
        } catch (err) {
          console.warn('[FeedbackService] Top-10-Requests-Message nicht gefunden, erstelle neue');
          this.state.top10RequestsMessageId = null;
        }
      }

      if (!this.state.top10RequestsMessageId) {
        const message = await channel.send({ embeds: [requestsEmbed] });
        await message.pin();
        this.state.top10RequestsMessageId = message.id;
        console.log('[FeedbackService] ✅ Top-10-Requests erstellt und gepinnt');
      }

      this._saveState();

      return {
        success: true,
        bugsMessageId: this.state.top10BugsMessageId,
        requestsMessageId: this.state.top10RequestsMessageId
      };
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Update der Top-10-Listen:', err);
      throw err;
    }
  }

  /**
   * Startet Auto-Update-Timer für Top-10-Liste
   */
  startTop10AutoUpdate() {
    // Alle 5 Minuten updaten
    this.top10UpdateInterval = setInterval(async () => {
      try {
        console.log('[FeedbackService] 🔄 Auto-Update: Top-10-Liste...');
        await this.updateTop10PinnedMessage();
      } catch (err) {
        console.error('[FeedbackService] ❌ Auto-Update fehlgeschlagen:', err);
      }
    }, 300000); // 5 Minuten = 300000ms

    console.log('[FeedbackService] ⏰ Auto-Update für Top-10-Liste gestartet (alle 5 Min)');
  }

  /**
   * Stoppt Auto-Update-Timer
   */
  stopTop10AutoUpdate() {
    if (this.top10UpdateInterval) {
      clearInterval(this.top10UpdateInterval);
      console.log('[FeedbackService] ⏹️ Auto-Update gestoppt');
    }
  }

  /**
   * Archiviert Threads mit Status 'resolved' oder 'wont_fix' die älter als 48h sind
   * @returns {Object} { archived, failed }
   */
  async archiveResolvedThreads() {
    try {
      console.log('[FeedbackService] 🗄️ Prüfe Threads für Auto-Archivierung...');

      const feedbacks = Object.values(this.state.feedbackThreads);
      const now = new Date();
      let archived = 0;
      let failed = 0;

      for (const feedback of feedbacks) {
        // Nur resolved oder wont_fix
        if (feedback.status !== 'resolved' && feedback.status !== 'wont_fix') {
          continue;
        }

        // Prüfen: Älter als 48h?
        const updatedAt = new Date(feedback.updatedAt);
        const ageInHours = (now - updatedAt) / (1000 * 60 * 60);

        if (ageInHours < 48) {
          continue;
        }

        try {
          // Thread abrufen
          const thread = await this.client.channels.fetch(feedback.threadId);

          // Prüfen: Ist Thread schon archiviert?
          if (thread.archived) {
            console.log(`[FeedbackService] ℹ️ Thread ${feedback.threadId} ist bereits archiviert`);
            continue;
          }

          // Info-Nachricht posten
          await thread.send(
            `🗄️ **Thread wird automatisch archiviert**\n\nDieser Thread wurde als ${this.config.feedback.statusLabels[feedback.status]} markiert und ist älter als 48 Stunden.`
          );

          // Thread archivieren
          await thread.setArchived(true, 'Auto-Archivierung (48h nach Resolve)');

          archived++;
          console.log(`[FeedbackService] ✅ Thread archiviert: ${feedback.threadId}`);

        } catch (err) {
          console.error(`[FeedbackService] ❌ Fehler beim Archivieren von ${feedback.threadId}:`, err);
          failed++;
        }
      }

      console.log(`[FeedbackService] ✅ Auto-Archivierung abgeschlossen: ${archived} archiviert, ${failed} fehlgeschlagen`);

      return { archived, failed };
    } catch (err) {
      console.error('[FeedbackService] ❌ Fehler beim Auto-Archivieren:', err);
      throw err;
    }
  }

  /**
   * Startet Auto-Archive-Timer
   */
  startAutoArchive() {
    // Alle 30 Minuten prüfen
    this.autoArchiveInterval = setInterval(async () => {
      try {
        console.log('[FeedbackService] 🔄 Auto-Archive-Check...');
        await this.archiveResolvedThreads();
      } catch (err) {
        console.error('[FeedbackService] ❌ Auto-Archive fehlgeschlagen:', err);
      }
    }, 1800000); // 30 Minuten = 1800000ms

    console.log('[FeedbackService] ⏰ Auto-Archive gestartet (alle 30 Min)');
  }

  /**
   * Stoppt Auto-Archive-Timer
   */
  stopAutoArchive() {
    if (this.autoArchiveInterval) {
      clearInterval(this.autoArchiveInterval);
      console.log('[FeedbackService] ⏹️ Auto-Archive gestoppt');
    }
  }
}

module.exports = FeedbackService;
