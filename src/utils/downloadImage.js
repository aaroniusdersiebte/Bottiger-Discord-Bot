/**
 * downloadImage - laedt eine Discord-Attachment-URL als Buffer (mit Redirect-Folge).
 * Ausgelagert aus wolpertinger.js#handleUpload, damit meme-submit.js und
 * wolpertinger-submit.js dieselbe Logik nutzen statt sie zu duplizieren.
 */
const https = require('https');
const http = require('http');

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        return downloadImage(response.headers.location).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = downloadImage;
