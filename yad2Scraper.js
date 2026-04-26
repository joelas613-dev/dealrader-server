import Airtable from 'airtable';
import { logger } from '../utils/logger.js';

Airtable.configure({ apiKey: process.env.AIRTABLE_API_KEY });
const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

// ─── Table names ────────────────────────────────────────────────────────────
const TABLES = {
  PROPERTIES: 'Properties',
  USERS: 'Users',
  CRITERIA: 'UserCriteria',
  ALERTS: 'Alerts',
  SUBSCRIPTIONS: 'Subscriptions',
};

// ─── Generic helpers ─────────────────────────────────────────────────────────
async function findAll(table, filterFormula = '', maxRecords = 1000) {
  const options = { maxRecords };
  if (filterFormula) options.filterByFormula = filterFormula;
  const records = [];
  await base(table).select(options).eachPage((page, next) => {
    records.push(...page.map(r => ({ id: r.id, ...r.fields })));
    next();
  });
  return records;
}

async function findOne(table, id) {
  const record = await base(table).find(id);
  return { id: record.id, ...record.fields };
}

async function create(table, fields) {
  const record = await base(table).create(fields);
  return { id: record.id, ...record.fields };
}

async function update(table, id, fields) {
  const record = await base(table).update(id, fields);
  return { id: record.id, ...record.fields };
}

async function destroy(table, id) {
  await base(table).destroy(id);
  return { deleted: true, id };
}

// ─── Properties ──────────────────────────────────────────────────────────────
export const Properties = {
  async upsert(property) {
    // Check by external ID to avoid duplicates
    const existing = await findAll(
      TABLES.PROPERTIES,
      `{externalId} = "${property.externalId}"`
    );
    if (existing.length > 0) {
      return update(TABLES.PROPERTIES, existing[0].id, {
        ...property,
        updatedAt: new Date().toISOString(),
      });
    }
    return create(TABLES.PROPERTIES, {
      ...property,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  },

  async findNew(sinceMinutes = 10) {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
    return findAll(
      TABLES.PROPERTIES,
      `IS_AFTER({createdAt}, "${since}")`
    );
  },

  async findById(id) {
    return findOne(TABLES.PROPERTIES, id);
  },

  async search({ city, minRooms, maxPrice, minYield }) {
    const filters = [];
    if (city) filters.push(`FIND("${city}", {city})`);
    if (minRooms) filters.push(`{rooms} >= ${minRooms}`);
    if (maxPrice) filters.push(`{price} <= ${maxPrice}`);
    if (minYield) filters.push(`{annualYield} >= ${minYield}`);
    const formula = filters.length
      ? `AND(${filters.join(',')})`
      : '';
    return findAll(TABLES.PROPERTIES, formula);
  },
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const Users = {
  async create(userData) {
    return create(TABLES.USERS, {
      ...userData,
      createdAt: new Date().toISOString(),
      plan: 'free',
      alertsCount: 0,
    });
  },

  async findByEmail(email) {
    const records = await findAll(
      TABLES.USERS,
      `{email} = "${email}"`
    );
    return records[0] || null;
  },

  async findById(id) {
    return findOne(TABLES.USERS, id);
  },

  async update(id, fields) {
    return update(TABLES.USERS, id, fields);
  },

  async incrementAlerts(id) {
    const user = await findOne(TABLES.USERS, id);
    return update(TABLES.USERS, id, {
      alertsCount: (user.alertsCount || 0) + 1,
    });
  },
};

// ─── User Criteria ────────────────────────────────────────────────────────────
export const Criteria = {
  async create(userId, criteria) {
    return create(TABLES.CRITERIA, {
      userId,
      ...criteria,
      active: true,
      createdAt: new Date().toISOString(),
    });
  },

  async findByUser(userId) {
    return findAll(
      TABLES.CRITERIA,
      `AND({userId} = "${userId}", {active} = TRUE())`
    );
  },

  async findAll() {
    return findAll(TABLES.CRITERIA, '{active} = TRUE()');
  },

  async update(id, fields) {
    return update(TABLES.CRITERIA, id, fields);
  },

  async delete(id) {
    return update(TABLES.CRITERIA, id, { active: false });
  },

  // Check if a property matches a given criteria
  matches(property, criteria) {
    const checks = [
      !criteria.cities?.length || criteria.cities.includes(property.city),
      !criteria.minRooms || property.rooms >= criteria.minRooms,
      !criteria.maxRooms || property.rooms <= criteria.maxRooms,
      !criteria.maxPrice || property.price <= criteria.maxPrice,
      !criteria.minYield || property.annualYield >= criteria.minYield,
      !criteria.maxBelowMarket || property.belowMarketPct >= criteria.maxBelowMarket,
      !criteria.propertyTypes?.length || criteria.propertyTypes.includes(property.type),
    ];
    return checks.every(Boolean);
  },
};

// ─── Alerts ───────────────────────────────────────────────────────────────────
export const Alerts = {
  async create(userId, propertyId, channel) {
    return create(TABLES.ALERTS, {
      userId,
      propertyId,
      channel,
      sentAt: new Date().toISOString(),
      status: 'sent',
    });
  },

  async wasAlerted(userId, propertyId) {
    const records = await findAll(
      TABLES.ALERTS,
      `AND({userId} = "${userId}", {propertyId} = "${propertyId}")`
    );
    return records.length > 0;
  },

  async findByUser(userId, limit = 50) {
    return findAll(
      TABLES.ALERTS,
      `{userId} = "${userId}"`,
      limit
    );
  },
};

// ─── Subscriptions ───────────────────────────────────────────────────────────
export const Subscriptions = {
  async upsert(userId, stripeData) {
    const existing = await findAll(
      TABLES.SUBSCRIPTIONS,
      `{userId} = "${userId}"`
    );
    const fields = {
      userId,
      stripeCustomerId: stripeData.customerId,
      stripeSubscriptionId: stripeData.subscriptionId,
      plan: stripeData.plan,
      status: stripeData.status,
      currentPeriodEnd: stripeData.currentPeriodEnd,
      updatedAt: new Date().toISOString(),
    };
    if (existing.length > 0) {
      return update(TABLES.SUBSCRIPTIONS, existing[0].id, fields);
    }
    return create(TABLES.SUBSCRIPTIONS, {
      ...fields,
      createdAt: new Date().toISOString(),
    });
  },

  async findByUser(userId) {
    const records = await findAll(
      TABLES.SUBSCRIPTIONS,
      `{userId} = "${userId}"`
    );
    return records[0] || null;
  },

  async findByStripeId(subscriptionId) {
    const records = await findAll(
      TABLES.SUBSCRIPTIONS,
      `{stripeSubscriptionId} = "${subscriptionId}"`
    );
    return records[0] || null;
  },
};

logger.info('Database layer initialized');
