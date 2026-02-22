/**
 * ApiClient - Wrapper für Stream Visualizer API
 *
 * Kommuniziert mit dem Stream Visualizer APIServer
 * Endpoints:
 * - GET  /api/assets
 * - GET  /api/user/:username
 * - POST /api/verify
 * - POST /api/user-image
 */

const axios = require('axios');

class ApiClient {
  constructor(baseURL, apiKey) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;

    // Axios-Client konfigurieren
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 5000 // 5 Sekunden
    });

    // Response-Interceptor für Logging
    this.client.interceptors.response.use(
      response => {
        console.log(`[ApiClient] ✅ ${response.config.method.toUpperCase()} ${response.config.url} → ${response.status}`);
        return response;
      },
      error => {
        if (error.response) {
          console.error(`[ApiClient] ❌ ${error.config.method.toUpperCase()} ${error.config.url} → ${error.response.status}: ${error.response.data.error || error.message}`);
        } else if (error.request) {
          console.error(`[ApiClient] ❌ ${error.config.method.toUpperCase()} ${error.config.url} → Keine Antwort vom Server`);
        } else {
          console.error(`[ApiClient] ❌ Fehler: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Alle verfügbaren Assets abrufen
   * @returns {Promise<object>} Assets nach Kategorien
   */
  async getAssets() {
    try {
      const response = await this.client.get('/api/assets');
      return response.data;
    } catch (err) {
      throw new Error(`Konnte Assets nicht abrufen: ${err.message}. Läuft der Stream Visualizer?`);
    }
  }

  /**
   * User-Daten abrufen
   * @param {string} username - Twitch/YouTube Username
   * @returns {Promise<object>} User-Daten (character, stats)
   */
  async getUser(username) {
    try {
      const response = await this.client.get(`/api/user/${username}`);
      return response.data;
    } catch (err) {
      if (err.response && err.response.status === 404) {
        throw new Error(`User "${username}" nicht gefunden.`);
      }
      throw new Error(`Konnte User-Daten nicht abrufen: ${err.message}`);
    }
  }

  /**
   * Alle User abrufen
   * @returns {Promise<object>} Alle User
   */
  async getAllUsers() {
    const response = await this.client.get('/api/users');
    return response.data;
  }

  /**
   * Verifizierungs-Code erstellen
   * @param {string} username - Twitch/YouTube Username
   * @param {object} customization - Charakter-Daten { koerper, kopf, augen, hut, rahmen, hintergrund }
   * @returns {Promise<object>} { success, code, expiresAt }
   */
  async createVerificationCode(username, customization) {
    try {
      const response = await this.client.post('/api/verify', {
        username: username,
        customization: customization
      });
      return response.data;
    } catch (err) {
      if (err.response && err.response.status === 400) {
        throw new Error(`Ungültige Daten: ${err.response.data.error}`);
      }
      throw new Error(`Konnte Verifizierungs-Code nicht erstellen: ${err.message}`);
    }
  }

  /**
   * Sendet User-Bild an Visualizer zur Stream-Anzeige
   * @param {string} imageUrl - URL des Bildes (z.B. Discord CDN)
   * @param {string} username - Discord-Username des Bild-Senders
   * @returns {Promise<object>} { success, message }
   */
  async sendUserImage(imageUrl, username) {
    try {
      const response = await this.client.post('/api/user-image', {
        imageUrl: imageUrl,
        username: username,
        source: 'discord'
      });
      return response.data;
    } catch (err) {
      if (err.response && err.response.status === 503) {
        throw new Error('UserImageModule ist nicht aktiviert im Visualizer');
      }
      if (err.response && err.response.status === 400) {
        throw new Error(`Ungültige Daten: ${err.response.data.error}`);
      }
      throw new Error(`Bild konnte nicht gesendet werden: ${err.message}`);
    }
  }

  /**
   * Health-Check (prüft ob API erreichbar ist)
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    try {
      await this.client.get('/health');
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Generische GET-Anfrage
   * @param {string} url - API-Pfad
   * @returns {Promise<object>}
   */
  async get(url) {
    return await this.client.get(url);
  }

  /**
   * Generische POST-Anfrage
   * @param {string} url - API-Pfad
   * @param {object} data - Request-Body
   * @returns {Promise<object>}
   */
  async post(url, data) {
    return await this.client.post(url, data);
  }
}

module.exports = ApiClient;
