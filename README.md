# Aashmika Designs — Jewellery API

Express REST API for the Aashmika Designs jewellery storefront and admin panel. Data lives in **MongoDB** (Mongoose). Customer and admin actions use **JWT** authentication.

## Stack

- **Node.js** · **Express 5**
- **MongoDB** via **Mongoose**
- **bcryptjs** (passwords) · **jsonwebtoken** · **nodemailer** · **cors** · **dotenv**

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
| `CLOUDINARY_CLOUD_NAME` | Cond. | Cloudinary cloud name (admin product image uploads) |
| `CLOUDINARY_API_KEY` | Cond. | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cond. | Cloudinary API secret (server only; never expose to the browser) |
| `CLOUDINARY_FOLDER` | No | Upload folder in Cloudinary (default `jewellery/products`) |

> **Security:** Change `ADMIN_EMAIL` / `ADMIN_PASSWORD` and use a strong `JWT_SECRET` in production. Never commit `.env`.

## Run

```bash
npm start
```

Server listens on `PORT` (default `http://localhost:5000`). On startup it connects to MongoDB and runs **seed logic** if collections need initial data (including the admin user from env defaults).

- **Root:** `GET /` — simple HTML status message  
- **Health:** `GET /api/health` → `{ "ok": true }`

## API overview

All JSON routes are under **`/api`**.

### Public (catalog)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/categories` | List categories |
| `GET` | `/products` | Published products |
| `GET` | `/products/:id` | Single published product |
| `GET` | `/merchandising/new-arrivals` | New arrival product IDs |

### Customer auth (`Authorization: Bearer <token>` where noted)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/auth/register` | — | Register |
| `POST` | `/auth/login` | — | Login → JWT |
| `POST` | `/auth/forgot-password/request` | — | Send OTP to email via Gmail |
| `POST` | `/auth/forgot-password/verify` | — | Verify OTP and return short-lived reset token |
| `POST` | `/auth/forgot-password/reset` | — | Reset password using reset token |
| `GET` | `/auth/me` | Customer | Current profile |
| `PATCH` | `/auth/me` | Customer | Update profile |
| `GET` | `/auth/orders` | Customer | Orders for this account (by user id or email) |

### Storefront orders

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/orders` | Customer JWT (required) | Place order; linked to the signed-in customer |

### Admin (`Authorization: Bearer <admin JWT>`)

Login: `POST /api/admin/auth/login` (body uses admin credentials from your DB / seed).

| Area | Examples |
|------|----------|
| Products | `GET/POST /admin/products`, `PATCH/DELETE /admin/products/:id` |
| Uploads | `GET /admin/upload/cloudinary-signature` — signed params for direct browser upload to Cloudinary |
| Categories | `GET /admin/categories`, `PUT /admin/categories` |
| Merchandising | `GET/PUT /admin/merchandising/new-arrivals` |
| Orders | `GET /admin/orders`, `GET/PATCH /admin/orders/:id` (id = order `publicId`) |
| Users | `GET /admin/users`, `PATCH /admin/users/:id` |

## Project layout

```
jewellery_backend/
├── index.js              # App entry, middleware, listen
├── DB/connection.js      # Mongoose connect
├── Routes/router.js      # Route table
├── Controller/           # Handlers (products, users, admin)
├── Models/               # Mongoose schemas
├── middleware/           # JWT: admin, customer, optional customer
└── seed/                 # seedIfNeeded — admin, sample data if empty
```

## Troubleshooting

- **`CONNECTION_STRING is missing`** — Create `.env` from `.env.example` and set the Mongo URI.  
- **Cannot login as admin** — Confirm seed ran; check `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`.  
- **CORS** — Enabled for all origins in code; for production you may want to restrict `cors()` to your frontend origin.

---

Frontend that consumes this API: see **[../jewellery_frontend/README.md](../jewellery_frontend/README.md)**.
