# Aashmika Designs — Jewellery API

Express REST API for the Aashmika Designs jewellery storefront and admin panel. Data lives in **MongoDB** (Mongoose). Customer and admin actions use **JWT** authentication.

## Stack

- **Node.js** · **Express 5**
- **MongoDB** via **Mongoose**
- **bcryptjs** (passwords) · **jsonwebtoken** · **nodemailer** · **cors** · **dotenv**
- **Razorpay** (UPI & card checkout) · **Cloudinary** (image uploads) · **Sentry** (optional error monitoring)

## Prerequisites

- Node.js 18+ recommended  
- A MongoDB connection string (Atlas or local)

## Setup

```bash
cd jewellery_backend
npm install
```

Copy the environment template and fill in real values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `CONNECTION_STRING` | Yes | MongoDB URI (e.g. Atlas `mongodb+srv://...`) |
| `JWT_SECRET` | Yes | Long random string used to sign JWTs |
| `PORT` | No | HTTP port (default **5000**) |
| `ADMIN_EMAIL` | No | Seed admin login email (default `admin@jewellery.com`) |
| `ADMIN_PASSWORD` | No | Seed admin password (default `admin123`) |
| `GMAIL_USER` | Cond. | Gmail address used to send OTP emails |
| `GMAIL_APP_PASSWORD` | Cond. | Gmail app password (not your normal account password) |
| `MAIL_FROM` | No | Optional sender address/display, defaults to `GMAIL_USER` |
| `ADMIN_NOTIFY_EMAIL` | Recommended | Receives email when a customer places an order |
| `CLOUDINARY_CLOUD_NAME` | Cond. | Cloudinary cloud name (admin product image uploads) |
| `CLOUDINARY_API_KEY` | Cond. | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cond. | Cloudinary API secret (server only; never expose to the browser) |
| `CLOUDINARY_FOLDER` | No | Upload folder in Cloudinary (default `Jewellery/Products`) |
| `RAZORPAY_KEY_ID` | Cond. | Razorpay public key — required for online checkout |
| `RAZORPAY_KEY_SECRET` | Cond. | Razorpay secret — server only; never expose to the browser |
| `GOOGLE_CLIENT_ID` | Cond. | Google Sign-In (must match frontend `VITE_GOOGLE_CLIENT_ID`) |
| `CORS_ALLOWED_ORIGINS` | Prod. | Comma-separated storefront origins |
| `STOREFRONT_URL` | No | Public shop URL for `sitemap.xml` entries |
| `SENTRY_DSN` | No | Sentry DSN — enables error tracking when `NODE_ENV=production` |

> **Security:** Change `ADMIN_EMAIL` / `ADMIN_PASSWORD` and use a strong `JWT_SECRET` in production. Never commit `.env`.

Razorpay setup guide: [`../docs/RAZORPAY_SETUP.md`](../docs/RAZORPAY_SETUP.md).  
Sentry setup guide: [`../docs/SENTRY_SETUP.md`](../docs/SENTRY_SETUP.md).

## Run

```bash
npm start
```

Server listens on `PORT` (default `http://localhost:5000`). On startup it connects to MongoDB and ensures baseline setup data (admin user + site settings).

- **Root:** `GET /` — simple HTML status message  
- **Health:** `GET /api/health` → `{ "ok": true }`
- **Sitemap:** `GET /api/sitemap.xml` → dynamic XML (static pages + published products). Set `STOREFRONT_URL` to your shop origin.

## API overview

All JSON routes are under **`/api`**. Admin routes require `Authorization: Bearer <admin JWT>` unless noted.

### Public (catalog & storefront)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Health check (`ok`, DB status) |
| `GET` | `/sitemap.xml` | Dynamic sitemap (set `STOREFRONT_URL`) |
| `GET` | `/store-settings` | Public store profile, shipping thresholds |
| `GET` | `/categories` | Legacy category name list |
| `GET` | `/catalog/categories` | Category tiles for home / shop nav |
| `GET` | `/products` | Published products |
| `GET` | `/products/listing` | Paginated collection grid with facets |
| `GET` | `/products/reviews/summaries` | Aggregate ratings for product cards |
| `GET` | `/products/:id` | Single published product |
| `GET` | `/products/:id/reviews` | Product reviews (optional customer auth) |
| `POST` | `/products/:id/reviews` | Submit review (customer JWT) |
| `GET` | `/size-charts/:id` | Public size chart |
| `GET` | `/merchandising/new-arrivals` | New arrival product IDs |
| `GET` | `/merchandising/new-arrivals/products` | New arrival products |
| `GET` | `/payments/razorpay-config` | Public Razorpay key id (when configured) |

### Customer auth & account

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/auth/register` | — | Register |
| `POST` | `/auth/login` | — | Login → JWT |
| `POST` | `/auth/google` | — | Google Sign-In → JWT |
| `POST` | `/auth/forgot-password/request` | — | Send OTP email |
| `POST` | `/auth/forgot-password/verify` | — | Verify OTP → reset token |
| `POST` | `/auth/forgot-password/reset` | — | Reset password |
| `GET` | `/auth/me` | Customer | Profile |
| `PATCH` | `/auth/me` | Customer | Update profile |
| `GET` | `/auth/cart` | Customer | Synced cart |
| `PUT` | `/auth/cart` | Customer | Replace cart |
| `GET` | `/auth/wishlist` | Customer | Synced wishlist |
| `PUT` | `/auth/wishlist` | Customer | Replace wishlist |
| `GET` | `/auth/orders` | Customer | Order history |
| `GET` | `/auth/orders/:id` | Customer | Single order |
| `POST` | `/auth/orders/:id/cancel-request` | Customer | Request cancellation |
| `POST` | `/auth/orders/:id/return-request` | Customer | Request return |

### Orders & payments

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/orders` | Customer | Place COD order |
| `POST` | `/orders/razorpay-order` | Customer | Create Razorpay order (paise) |
| `POST` | `/orders/razorpay-verify` | Customer | Verify payment signature → save order |
| `POST` | `/coupons/quote` | Customer | Validate coupon & discounted total |

### Admin

Login: `POST /api/admin/auth/login` (admin credentials from DB / seed).

#### Dashboard & uploads

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/dashboard/summary` | KPIs, recent orders |
| `GET` | `/admin/upload/cloudinary-signature` | Signed params for browser upload |

#### Products

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/products` | List all products |
| `GET` | `/admin/products/:id` | Single product |
| `POST` | `/admin/products` | Create |
| `PATCH` | `/admin/products/:id` | Update |
| `DELETE` | `/admin/products/:id` | Delete |
| `POST` | `/admin/products/:id/duplicate` | Duplicate |
| `PATCH` | `/admin/products/bulk` | Bulk publish / archive / etc. |
| `GET` | `/admin/products/export` | CSV export |
| `POST` | `/admin/products/import` | CSV import |

#### Inventory

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/inventory/stock` | All stock levels |
| `GET` | `/admin/inventory/low-stock` | Low-stock alerts |
| `POST` | `/admin/inventory/adjust` | Manual adjustment |
| `POST` | `/admin/inventory/stock-take` | Stock-take session |
| `GET` | `/admin/inventory/movements` | Movement history |

#### Catalog (structured)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/catalog/categories` | List |
| `POST` | `/admin/catalog/categories` | Create |
| `PATCH` | `/admin/catalog/categories/:id` | Update |
| `DELETE` | `/admin/catalog/categories/:id` | Delete |
| `GET` | `/admin/catalog/collections` | List collections |
| `POST` | `/admin/catalog/collections` | Create |
| `PATCH` | `/admin/catalog/collections/:id` | Update |
| `DELETE` | `/admin/catalog/collections/:id` | Delete |

#### Categories (legacy home grid) & merchandising

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/categories` | List home categories |
| `PUT` | `/admin/categories` | Replace home categories |
| `GET` | `/admin/merchandising/new-arrivals` | New-arrival IDs |
| `PUT` | `/admin/merchandising/new-arrivals` | Save new-arrival IDs |

#### Settings & shipping

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/settings` | Store settings |
| `PUT` | `/admin/settings` | Update store settings |
| `GET` | `/admin/settings/integrations` | Razorpay / courier / email health |
| `GET` | `/admin/shipping` | Shipping rules |
| `PUT` | `/admin/shipping` | Update shipping rules |

#### Analytics

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/analytics/sales` | Sales over time |
| `GET` | `/admin/analytics/products` | Product performance |

#### Orders

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/orders` | List orders |
| `GET` | `/admin/orders/:id` | Order detail (`id` = `publicId`) |
| `PATCH` | `/admin/orders/:id` | Update status, notes, tracking |
| `PATCH` | `/admin/orders/bulk` | Bulk status updates |
| `GET` | `/admin/orders/export` | CSV export |
| `GET` | `/admin/orders/courier-status` | Courier tracking lookup |
| `GET` | `/admin/orders/:id/invoice` | Invoice PDF |
| `POST` | `/admin/orders/:id/confirm-cod` | Confirm high-value COD |
| `POST` | `/admin/orders/:id/refund` | Process refund |
| `POST` | `/admin/orders/:id/rma` | Return / exchange action |
| `POST` | `/admin/orders/:id/courier/awb` | Generate courier AWB |

#### Customers, coupons, reviews, size charts

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/users` | List customers |
| `GET` | `/admin/users/:id` | Customer detail |
| `PATCH` | `/admin/users/:id` | Update customer |
| `PATCH` | `/admin/users/:id/disabled` | Enable / disable account |
| `GET` | `/admin/coupons` | List coupons |
| `POST` | `/admin/coupons` | Create coupon |
| `PATCH` | `/admin/coupons/:id` | Update coupon |
| `DELETE` | `/admin/coupons/:id` | Delete coupon |
| `GET` | `/admin/reviews` | List reviews |
| `PATCH` | `/admin/reviews/bulk` | Bulk moderate |
| `PATCH` | `/admin/reviews/:id` | Update review |
| `DELETE` | `/admin/reviews/:id` | Delete review |
| `GET` | `/admin/size-charts` | List size charts |
| `POST` | `/admin/size-charts` | Create |
| `PATCH` | `/admin/size-charts/:id` | Update |
| `DELETE` | `/admin/size-charts/:id` | Delete |

## Project layout

```
jewellery_backend/
├── index.js              # Entry, DB connect, listen
├── app.js                # Express app factory
├── DB/connection.js      # Mongoose connect
├── Routes/router.js      # Route table
├── Controller/           # Handlers (products, orders, payments, admin)
├── Models/               # Mongoose schemas
├── middleware/           # JWT, rate limits, cache
└── seed/                 # Baseline admin + site settings
```

## Troubleshooting

- **`CONNECTION_STRING is missing`** — Create `.env` from `.env.example` and set the Mongo URI.  
- **Cannot login as admin** — Confirm seed ran; check `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`.  
- **CORS** — Set `CORS_ALLOWED_ORIGINS` to your production storefront URL(s), comma-separated. If unset, only `http://localhost:5173` and `http://127.0.0.1:5173` are allowed. See [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
- **Razorpay / online checkout** — Set both `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`; see [../docs/RAZORPAY_SETUP.md](../docs/RAZORPAY_SETUP.md).
- **Errors not in Sentry** — Set `SENTRY_DSN` with `NODE_ENV=production`; see [../docs/SENTRY_SETUP.md](../docs/SENTRY_SETUP.md).

---

Frontend that consumes this API: see **[../jewellery_frontend/README.md](../jewellery_frontend/README.md)**.
