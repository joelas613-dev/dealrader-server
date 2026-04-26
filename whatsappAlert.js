import { BaseScraper } from './baseScraper.js';
import { logger } from '../utils/logger.js';

// Yad2 exposes a JSON API endpoint for listings
const YAD2_API = 'https://gw.yad2.co.il/feed-search-legacy/realestate/forsale';

const CATEGORY_MAP = {
  1: 'apartment',
  3: 'house',
  4: 'garden_apartment',
  5: 'rooftop',
  6: 'studio',
  7: 'duplex',
};

export class Yad2Scraper extends BaseScraper {
  constructor() {
    super('yad2', 'https://www.yad2.co.il');
  }

  async scrape({ city, minRooms, maxRooms, maxPrice, page = 1 } = {}) {
    logger.info(`[Yad2] Scraping page ${page}...`);

    const params = new URLSearchParams({
      forsale: 1,
      propertyGroup: 'apartments',
      page,
      ...(city && { topAreaId: await this.getCityId(city) }),
      ...(minRooms && { rooms: minRooms }),
      ...(maxRooms && { rooms2: maxRooms }),
      ...(maxPrice && { price: maxPrice }),
    });

    const url = `${YAD2_API}?${params}`;

    let data;
    try {
      data = await this.fetchJson(url, {
        headers: {
          'Referer': 'https://www.yad2.co.il/realestate/forsale',
          'Origin': 'https://www.yad2.co.il',
        },
      });
    } catch (err) {
      logger.error(`[Yad2] Failed to fetch: ${err.message}`);
      return [];
    }

    const items = data?.data?.feed?.feed_items || [];
    const listings = items.filter(item => item.type !== 'ad');

    logger.info(`[Yad2] Found ${listings.length} listings on page ${page}`);

    return listings.map(item => this.normalize({
      id: item.id || item.link_token,
      url: `https://www.yad2.co.il/item/${item.link_token}`,
      title: item.title_1 || item.title || '',
      price: item.price,
      rooms: item.Rooms || item.rooms,
      size: item.square_meters || item.SquareMeter,
      floor: item.floor || item.Floor,
      city: item.city || item.area_name,
      neighborhood: item.neighborhood || item.area_name2,
      address: [item.street, item.house_number].filter(Boolean).join(' '),
      type: CATEGORY_MAP[item.subcategoryId] || 'apartment',
      description: item.info_text || '',
      images: this.extractImages(item),
      publishedAt: item.date || new Date().toISOString(),
    }));
  }

  async scrapeMultiplePages(filters = {}, maxPages = 5) {
    const allListings = [];
    for (let page = 1; page <= maxPages; page++) {
      const listings = await this.scrape({ ...filters, page });
      if (!listings.length) break;
      allListings.push(...listings);
      if (listings.length < 20) break; // Last page
    }
    logger.info(`[Yad2] Total scraped: ${allListings.length} listings`);
    return allListings;
  }

  extractImages(item) {
    if (!item.images) return [];
    return item.images.map(img =>
      typeof img === 'string' ? img : img.src || img.url || ''
    ).filter(Boolean).slice(0, 5);
  }

  // Map city names to Yad2 area IDs (partial list)
  async getCityId(cityName) {
    const cityMap = {
      'תל אביב': 1,
      'ירושלים': 100,
      'חיפה': 200,
      'ראשון לציון': 4300,
      'פתח תקווה': 7400,
      'באר שבע': 14000,
      'נתניה': 7200,
      'אשדוד': 9000,
      'חולון': 4500,
      'בני ברק': 4100,
    };
    return cityMap[cityName] || '';
  }
}
