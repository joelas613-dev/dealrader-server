# 🏠 DealRadar – Server

מנוע סריקת עסקאות נדל"ן אוטומטי לישראל.

## ארכיטקטורה

```
src/
├── index.js              # נקודת כניסה – Express + Cron scheduler
├── api/
│   ├── routes.js         # כל נקודות ה-API
│   └── middleware/
│       └── auth.js       # JWT + plan guard
├── scrapers/
│   ├── baseScraper.js    # בסיס עם retry ו-anti-block
│   ├── yad2Scraper.js    # סורק יד2
│   └── madlanScraper.js  # סורק מדלן
├── analyzers/
│   └── yieldAnalyzer.js  # מחשב תשואה, ציון עסקה, השוואת שוק
├── alerts/
│   ├── alertMatcher.js   # מתאים נכסים לקריטריוני משתמשים
│   ├── emailAlert.js     # שולח מייל HTML עשיר
│   └── whatsappAlert.js  # שולח ווטסאפ
├── db/
│   └── airtable.js       # שכבת מסד נתונים – כל הטבלאות
├── jobs/
│   └── scrapeJob.js      # תזמון סריקה מלאה
└── utils/
    └── logger.js         # Winston logger
```

## התקנה

```bash
# 1. שכפל ותתקין
git clone https://github.com/yourname/dealradar-server
cd dealradar-server
npm install

# 2. הגדר משתני סביבה
cp .env.example .env
# ערוך את .env עם המפתחות שלך

# 3. הרץ בפיתוח
npm run dev

# 4. הרץ בפרודקשן
npm start
```

## Docker

```bash
docker-compose up -d
```

## API Endpoints

### Auth
| Method | Path | תיאור |
|--------|------|-------|
| POST | /api/auth/register | הרשמה |
| POST | /api/auth/login | התחברות |
| GET  | /api/me | פרופיל משתמש |

### קריטריונים
| Method | Path | תיאור |
|--------|------|-------|
| GET    | /api/criteria | כל הקריטריונים שלי |
| POST   | /api/criteria | צור קריטריון חדש |
| PUT    | /api/criteria/:id | עדכן קריטריון |
| DELETE | /api/criteria/:id | מחק קריטריון |

### נכסים
| Method | Path | תיאור |
|--------|------|-------|
| GET    | /api/properties | חפש נכסים עם פילטרים |
| GET    | /api/properties/:id | נכס ספציפי |
| GET    | /api/alerts | היסטוריית התראות |

### תשלומים
| Method | Path | תיאור |
|--------|------|-------|
| POST   | /api/checkout | צור Stripe checkout |
| POST   | /api/stripe/webhook | Webhook מ-Stripe |

## הגדרת Airtable

צור Base עם 5 טבלאות:

### Properties
| שדה | סוג |
|-----|-----|
| externalId | Text |
| source | Text |
| url | URL |
| price | Number |
| rooms | Number |
| size | Number |
| city | Text |
| neighborhood | Text |
| annualYield | Number |
| score | Number |
| grade | Text |
| estimatedRent | Number |
| belowMarketPct | Number |
| createdAt | Date |

### Users
| שדה | סוג |
|-----|-----|
| email | Email |
| passwordHash | Text |
| name | Text |
| phone | Phone |
| plan | Text |
| alertsCount | Number |

### UserCriteria
| שדה | סוג |
|-----|-----|
| userId | Text |
| cities | Text (JSON) |
| minRooms | Number |
| maxRooms | Number |
| maxPrice | Number |
| minYield | Number |
| active | Checkbox |

### Alerts
| שדה | סוג |
|-----|-----|
| userId | Text |
| propertyId | Text |
| channel | Text |
| sentAt | Date |

### Subscriptions
| שדה | סוג |
|-----|-----|
| userId | Text |
| stripeCustomerId | Text |
| plan | Text |
| status | Text |
| currentPeriodEnd | Date |

## פריסה ל-Railway (מומלץ)

```bash
# התקן Railway CLI
npm install -g @railway/cli

# התחבר ופרוס
railway login
railway init
railway up

# הגדר משתני סביבה
railway variables set AIRTABLE_API_KEY=...
railway variables set JWT_SECRET=...
# ... שאר המשתנים
```

**עלות Railway:** ~$5/חודש לשרת בסיסי
