import axios from 'axios';
import * as cheerio from 'cheerio';
import pRetry from 'p-retry';
import { logger } from '../utils/logger.js';

// Rotate user agents to avoid blocks
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 Safari/605.1.15',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BaseScraper {
  constructor(name, baseUrl) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.client = axios.create({
      timeout: 15000,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Fetch HTML with retry + random delays
  async fetch(url, options = {}) {
    return pRetry(async () => {
      await sleep(800 + Math.random() * 1200); // 0.8–2s random delay
      const response = await this.client.get(url, {
        ...options,
        headers: {
          'User-Agent': randomUA(),
          ...options.headers,
        },
      });
      return response.data;
    }, {
      retries: 3,
      onFailedAttempt: error => {
        logger.warn(`[${this.name}] Retry ${error.attemptNumber}/3 for ${url}: ${error.message}`);
      },
    });
  }

  // Fetch JSON API endpoint
  async fetchJson(url, options = {}) {
    return pRetry(async () => {
      await sleep(500 + Math.random() * 800);
      const response = await this.client.get(url, {
        ...options,
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'application/json',
          ...options.headers,
        },
      });
      return response.data;
    }, {
      retries: 3,
      onFailedAttempt: error => {
        logger.warn(`[${this.name}] JSON retry ${error.attemptNumber}/3 for ${url}: ${error.message}`);
      },
    });
  }

  load(html) {
    return cheerio.load(html);
  }

  // Normalize property data to a standard schema
  normalize(raw) {
    return {
      externalId: `${this.name}_${raw.id}`,
      source: this.name,
      url: raw.url,
      title: raw.title || '',
      price: this.parsePrice(raw.price),
      rooms: this.parseRooms(raw.rooms),
      size: this.parseNumber(raw.size),
      floor: this.parseNumber(raw.floor),
      city: raw.city || '',
      neighborhood: raw.neighborhood || '',
      address: raw.address || '',
      type: raw.type || 'apartment',
      description: raw.description || '',
      images: raw.images || [],
      publishedAt: raw.publishedAt || new Date().toISOString(),
      scrapedAt: new Date().toISOString(),
    };
  }

  parsePrice(val) {
    if (!val) return 0;
    const str = String(val).replace(/[^\d]/g, '');
    return parseInt(str, 10) || 0;
  }

  parseRooms(val) {
    if (!val) return 0;
    const num = parseFloat(String(val).replace(',', '.'));
    return isNaN(num) ? 0 : num;
  }

  parseNumber(val) {
    if (!val) return 0;
    const num = parseFloat(String(val).replace(/[^\d.]/g, ''));
    return isNaN(num) ? 0 : num;
  }

  // Must be implemented by each scraper
  async scrape() {
    throw new Error(`${this.name}: scrape() not implemented`);
  }
}
