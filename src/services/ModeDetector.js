/**
 * ModeDetector - Erkennt ob Stream Visualizer läuft
 *
 * Modi:
 * - 'api': Visualizer läuft → Nutze API-Endpoints
 * - 'standalone': Visualizer aus → Direkter File-Access
 */

class ModeDetector {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.currentMode = 'unknown'; // 'api' | 'standalone' | 'unknown'
    this.lastCheck = null;
    this.checkInterval = 60000; // 1 Minute (re-check Interval)
  }

  /**
   * Erkennt den aktuellen Modus durch API-Health-Check
   * @returns {Promise<string>} 'api' oder 'standalone'
   */
  async detectMode() {
    try {
      const isApiAvailable = await this.apiClient.healthCheck();

      if (isApiAvailable) {
        // API erreichbar → Visualizer läuft
        if (this.currentMode !== 'api') {
          this.currentMode = 'api';
          console.log('[ModeDetector] 🟢 Visualizer läuft → API-Mode');
        }
      } else {
        // API nicht erreichbar → Visualizer aus
        if (this.currentMode !== 'standalone') {
          this.currentMode = 'standalone';
          console.log('[ModeDetector] 🔴 Visualizer aus → Standalone-Mode');
        }
      }
    } catch (err) {
      // Bei Fehler: Standalone
      if (this.currentMode !== 'standalone') {
        this.currentMode = 'standalone';
        console.log('[ModeDetector] 🔴 API-Fehler → Standalone-Mode');
      }
    }

    this.lastCheck = Date.now();
    return this.currentMode;
  }

  /**
   * Gibt den aktuellen Modus zurück (mit auto-refresh)
   * @returns {Promise<string>}
   */
  async getCurrentMode() {
    // Re-check wenn letzter Check älter als Interval
    if (!this.lastCheck || Date.now() - this.lastCheck > this.checkInterval) {
      await this.detectMode();
    }

    return this.currentMode;
  }

  /**
   * Forciert eine sofortige Modus-Erkennung
   * @returns {Promise<string>}
   */
  async forceCheck() {
    return await this.detectMode();
  }

  /**
   * Gibt Statistiken zurück
   * @returns {object}
   */
  getStats() {
    return {
      currentMode: this.currentMode,
      lastCheck: this.lastCheck,
      lastCheckAgo: this.lastCheck ? Date.now() - this.lastCheck : null,
      nextCheckIn: this.lastCheck ? Math.max(0, this.checkInterval - (Date.now() - this.lastCheck)) : 0
    };
  }
}

module.exports = ModeDetector;
