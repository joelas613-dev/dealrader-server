import pLimit from 'p-limit';
import { Yad2Scraper } from '../scrapers/yad2Scraper.js';
import { MadlanScraper } from '../scrapers/madlanScraper.js';
import { YieldAnalyzer } from '../analyzers/yieldAnalyzer.js';
import { AlertMatcher } from '../alerts/alertMatcher.js';
import { Properties } from '../db/airtable.js';
import { logger } from '../utils/logger.js';

const scrapers = [
  new Yad2Scraper(),
  new MadlanScraper(),
];

const analyzer = new YieldAnalyzer();
const matcher = new AlertMatcher();
const limit = pLimit(parseInt(process.env.SCRAPE_CONCURRENCY) || 3);

export async function runScrapeJob() {
  const start = Date.now();
  logger.info('=== Scrape job started ===');

  // 1. Scrape from all sources in parallel (with concurrency limit)
  const scrapeResults = await Promise.allSettled(
    scrapers.map(scraper =>
      limit(() => scraper.scrapeMultiplePages({}, 3))
    )
  );

  const rawListings = scrapeResults.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    logger.error(`Scraper ${scrapers[i].name} failed: ${r.reason}`);
    return [];
  });

  logger.info(`Scraped ${rawListings.length} raw listings`);

  // 2. Deduplicate by externalId
  const seen = new Set();
  const unique = rawListings.filter(p => {
    if (seen.has(p.externalId)) return false;
    seen.add(p.externalId);
    return true;
  });
  logger.info(`Unique listings after dedup: ${unique.length}`);

  // 3. Analyze yields
  const analyzed = analyzer.analyzeMany(unique);
  const topDeals = analyzed
    .filter(p => p.score >= 40)
    .sort((a, b) => b.score - a.score);

  logger.info(`Top deals (score >= 40): ${topDeals.length}`);

  // 4. Save to database (upsert)
  let saved = 0;
  const saveLimit = pLimit(5);
  await Promise.allSettled(
    analyzed.map(property =>
      saveLimit(async () => {
        try {
          await Properties.upsert(property);
          saved++;
        } catch (err) {
          logger.error(`Failed to save ${property.externalId}: ${err.message}`);
        }
      })
    )
  );
  logger.info(`Saved/updated ${saved} properties`);

  // 5. Match against user criteria and send alerts
  const alertsSent = await matcher.processNewProperties(topDeals);

  const duration = ((Date.now() - start) / 1000).toFixed(1);
  logger.info(`=== Job complete in ${duration}s | Scraped: ${unique.length} | Alerts: ${alertsSent} ===`);

  return {
    scraped: unique.length,
    topDeals: topDeals.length,
    saved,
    alertsSent,
    duration: parseFloat(duration),
  };
}
