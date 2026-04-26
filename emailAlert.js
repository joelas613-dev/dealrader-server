import { BaseScraper } from './baseScraper.js';
import { logger } from '../utils/logger.js';

const MADLAN_API = 'https://www.madlan.co.il/api2/searches/listings';

export class MadlanScraper extends BaseScraper {
  constructor() {
    super('madlan', 'https://www.madlan.co.il');
  }

  async scrape({ city, minRooms, maxRooms, maxPrice, page = 0 } = {}) {
    logger.info(`[Madlan] Scraping page ${page}...`);

    const payload = {
      dealType: 'SELL',
      listingType: 'APARTMENT',
      offset: page * 25,
      limit: 25,
      ...(city && { addressDetails: { city } }),
      ...(minRooms && { minRooms }),
      ...(maxRooms && { maxRooms }),
      ...(maxPrice && { maxPrice }),
    };

    let data;
    try {
      const response = await this.client.post(MADLAN_API, payload, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible)',
          'Content-Type': 'application/json',
          'Referer': 'https://www.madlan.co.il',
          'x-requested-with': 'XMLHttpRequest',
        },
      });
      data = response.data;
    } catch (err) {
      logger.error(`[Madlan] Failed to fetch: ${err.message}`);
      return [];
    }

    const listings = data?.data?.listings || data?.listings || [];
    logger.info(`[Madlan] Found ${listings.length} listings`);

    return listings.map(item => this.normalize({
      id: item.id || item.listingId,
      url: `https://www.madlan.co.il/listing/${item.id || item.listingId}`,
      title: item.title || `${item.rooms} חדרים ב${item.city}`,
      price: item.price || item.askingPrice,
      rooms: item.rooms,
      size: item.size || item.sqm,
      floor: item.floor,
      city: item.city || item.addressDetails?.city,
      neighborhood: item.neighborhood || item.addressDetails?.neighborhood,
      address: item.address || item.addressDetails?.streetName,
      type: this.mapType(item.propertyType),
      description: item.description || '',
      images: (item.images || []).slice(0, 5),
      publishedAt: item.publishDate || new Date().toISOString(),
    }));
  }

  mapType(type) {
    const map = {
      'APARTMENT': 'apartment',
      'GARDEN_APARTMENT': 'garden_apartment',
      'HOUSE': 'house',
      'ROOFTOP': 'rooftop',
      'STUDIO': 'studio',
    };
    return map[type] || 'apartment';
  }
}
