import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { z } from 'zod';
import { Users, Criteria, Properties, Alerts, Subscriptions } from '../db/airtable.js';
import { YieldAnalyzer } from '../analyzers/yieldAnalyzer.js';
import { authMiddleware, planGuard } from './middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const analyzer = new YieldAnalyzer();

// ─── Validation schemas ───────────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  phone: z.string().optional(),
});

const criteriaSchema = z.object({
  cities: z.array(z.string()).min(1),
  minRooms: z.number().min(1).max(10).optional(),
  maxRooms: z.number().min(1).max(10).optional(),
  maxPrice: z.number().min(100000).optional(),
  minYield: z.number().min(0).max(20).optional(),
  maxBelowMarket: z.number().min(0).max(50).optional(),
  propertyTypes: z.array(z.string()).optional(),
});

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error.flatten() });
    }
    req.body = result.data;
    next();
  };
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', validate(registerSchema), async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    const existing = await Users.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await Users.create({ email, passwordHash, name, phone, plan: 'free' });

    const token = jwt.sign(
      { sub: user.id, plan: 'free' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await Users.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { sub: user.id, plan: user.plan || 'free' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, user: sanitizeUser(user) });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── USER PROFILE ──────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await Users.findById(req.userId);
    const subscription = await Subscriptions.findByUser(req.userId);
    res.json({ user: sanitizeUser(user), subscription });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CRITERIA ─────────────────────────────────────────────────────────────────
router.get('/criteria', authMiddleware, async (req, res) => {
  const list = await Criteria.findByUser(req.userId);
  res.json(list);
});

router.post('/criteria', authMiddleware, validate(criteriaSchema), async (req, res) => {
  try {
    const user = await Users.findById(req.userId);
    const existing = await Criteria.findByUser(req.userId);

    // Free plan: max 1 criteria set
    if (user.plan === 'free' && existing.length >= 1) {
      return res.status(403).json({
        error: 'Upgrade to add more criteria sets',
        upgrade: true,
      });
    }

    const criteria = await Criteria.create(req.userId, req.body);
    res.status(201).json(criteria);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/criteria/:id', authMiddleware, validate(criteriaSchema), async (req, res) => {
  try {
    const updated = await Criteria.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/criteria/:id', authMiddleware, async (req, res) => {
  try {
    await Criteria.delete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PROPERTIES ───────────────────────────────────────────────────────────────
router.get('/properties', authMiddleware, async (req, res) => {
  try {
    const { city, minRooms, maxPrice, minYield, page = 1 } = req.query;
    const properties = await Properties.search({
      city,
      minRooms: minRooms ? parseFloat(minRooms) : undefined,
      maxPrice: maxPrice ? parseInt(maxPrice) : undefined,
      minYield: minYield ? parseFloat(minYield) : undefined,
    });

    // Sort by score
    properties.sort((a, b) => (b.score || 0) - (a.score || 0));

    const PAGE_SIZE = 20;
    const pageNum = parseInt(page);
    const paginated = properties.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE);

    res.json({
      items: paginated,
      total: properties.length,
      page: pageNum,
      pages: Math.ceil(properties.length / PAGE_SIZE),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/properties/:id', authMiddleware, async (req, res) => {
  try {
    const property = await Properties.findById(req.params.id);
    res.json(property);
  } catch (err) {
    res.status(404).json({ error: 'Property not found' });
  }
});

// ─── ALERTS HISTORY ───────────────────────────────────────────────────────────
router.get('/alerts', authMiddleware, async (req, res) => {
  const alerts = await Alerts.findByUser(req.userId);
  res.json(alerts);
});

// ─── PAYMENTS / STRIPE ────────────────────────────────────────────────────────
const PRICE_IDS = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro: process.env.STRIPE_PRICE_PRO,
  agency: process.env.STRIPE_PRICE_AGENCY,
};

router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const user = await Users.findById(req.userId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      metadata: { userId: req.userId, plan },
      success_url: `${process.env.APP_URL}/dashboard?upgraded=1`,
      cancel_url: `${process.env.APP_URL}/pricing`,
      locale: 'he',
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    logger.error(`Checkout error: ${err.message}`);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

router.post('/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn(`Stripe webhook error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, plan } = session.metadata;

    await Users.update(userId, { plan });
    await Subscriptions.upsert(userId, {
      customerId: session.customer,
      subscriptionId: session.subscription,
      plan,
      status: 'active',
      currentPeriodEnd: null,
    });
    logger.info(`User ${userId} upgraded to ${plan}`);
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const subscription = await Subscriptions.findByStripeId(sub.id);
    if (subscription) {
      await Users.update(subscription.userId, { plan: 'free' });
      await Subscriptions.upsert(subscription.userId, {
        ...subscription,
        status: 'cancelled',
      });
    }
  }

  res.json({ received: true });
});

// ─── ADMIN (internal use) ─────────────────────────────────────────────────────
router.post('/admin/scrape', async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { runScrapeJob } = await import('../jobs/scrapeJob.js');
  const result = await runScrapeJob();
  res.json(result);
});

function sanitizeUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

export default router;
