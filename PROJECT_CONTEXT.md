# 🍱 Meal Subscription Backend — Project Context
> **FOR AI MODELS**: Read this entire file before making ANY changes. This is the single source of truth for this project's backend architecture, business rules, API contracts, and database schema.

---

## 1. PROJECT OVERVIEW

**What is this?**
A multi-sector meal subscription management backend for a business that delivers daily meals to:
- 🎒 **School Students** (Buuttii Kids) — managed by parents, linked to schools
- 👨‍🏫 **School Teachers** — linked to schools
- 💼 **Working Professionals** (Buuttii Pro) — linked to corporate office locations

**Tech Stack:**
- Runtime: Node.js
- Framework: Express.js
- Database: PostgreSQL (via `pg` connection pool)
- Auth: JWT (access + refresh tokens) + Firebase OTP
- File Storage: Cloudinary (menu images)
- Payment Gateway: PhonePe (official V2 SDK `@phonepe-pg/pg-sdk-node`)
- API Docs: Swagger/OpenAPI via `swagger-jsdoc` + `swagger-ui-express`
- Security: `helmet`, `express-rate-limit` (100 req/15min), `bcrypt`
- HTTP Logging: `morgan`

**Entry Point:** `src/server.js`
**Port:** 3000 (from `.env`)
**Docs URL:** `http://localhost:3000/api-docs`

---

## 2. FOLDER STRUCTURE

```
D:\Meal-backend\
├── src\
│   ├── server.js                   # App entry: middleware, routes, error handler, graceful shutdown
│   ├── docs\
│   │   └── swagger.js              # Swagger config: scans all route files for @swagger JSDoc
│   ├── admin\                       # Admin-only domain
│   │   ├── controllers\
│   │   │   ├── authController.js
│   │   │   ├── schoolController.js
│   │   │   ├── subscriptionController.js
│   │   │   ├── menuController.js
│   │   │   ├── corporateLocationController.js
│   │   │   ├── lookupController.js
│   │   │   └── paymentController.js
│   │   ├── routes\
│   │   │   ├── authRoutes.js
│   │   │   ├── schoolRoutes.js
│   │   │   ├── subscriptionRoutes.js
│   │   │   ├── menuRoutes.js
│   │   │   ├── corporateLocationRoutes.js
│   │   │   ├── lookupRoutes.js
│   │   │   └── paymentRoutes.js
│   │   ├── middlewares\
│   │   │   └── authMiddleware.js   # Verifies ADMIN_JWT_SECRET + checks role === 'admin'
│   │   ├── validators\
│   │   │   └── schoolValidator.js  # validateAddSchool, validateEditSchool
│   │   └── services\               # (empty, reserved for future services)
│   ├── client\                      # Client (user-facing) domain
│   │   ├── controllers\
│   │   │   ├── authController.js
│   │   │   ├── childController.js
│   │   │   ├── parentController.js
│   │   │   ├── professionalController.js
│   │   │   ├── teacherController.js
│   │   │   └── paymentController.js
│   │   ├── routes\
│   │   │   ├── authRoutes.js
│   │   │   ├── childRoutes.js
│   │   │   ├── parentRoutes.js
│   │   │   ├── professionalRoutes.js
│   │   │   ├── teacherRoutes.js
│   │   │   └── paymentRoutes.js
│   │   ├── middlewares\
│   │   │   └── authMiddleware.js   # Verifies CLIENT_JWT_SECRET + checks role === 'client'
│   │   └── validators\
│   │       └── childValidator.js   # validateAddChildren (array, max 3, all fields)
│   └── common\                      # Shared across admin + client
│       ├── database\
│       │   └── index.js            # Pool, initDB(), seed data, query helper
│       ├── routes\
│       │   ├── commonRoutes.js     # Schools list, lookup (meal-sizes, standards)
│       │   ├── menuRoutes.js       # Menu history, menu by date
│       │   ├── subscriptionRoutes.js
│       │   └── corporateLocationRoutes.js
│       ├── middlewares\
│       │   ├── commonAuthMiddleware.js  # Tries ADMIN_JWT_SECRET first, then CLIENT_JWT_SECRET
│       │   └── uploadMiddleware.js      # Multer + CloudinaryStorage (5MB limit, jpg/png/jpeg)
│       ├── services\
│       │   └── otpService.js       # Firebase OTP send + verify
│       └── utils\
│           ├── AppError.js         # Custom error class (message, statusCode, isOperational)
│           ├── catchAsync.js       # Wraps async controllers to catch errors
│           └── phonepe.js          # PhonePe SDK wrapper class (singleton)
└── .env                            # Environment variables (see Section 5)
```

---

## 3. DATABASE SCHEMA (PostgreSQL)

All tables auto-created on server start via `src/common/database/index.js → initDB()`.

### Custom ID Sequences
All IDs use custom prefixed sequences (NOT serial integers):
- `clients` → `P-1, P-2, ...`
- `schools` → `SH-1, SH-2, ...`
- `children` → `CH-1, CH-2, ...`
- `daily_menus` → `MN-1, MN-2, ...`
- `subscriptions` → `SUB-1, SUB-2, ...`
- `corporate_locations` → `CL-1, CL-2, ...`
- `professional_profiles` → `PRO-1, PRO-2, ...`
- `parent_profiles` → `PAR-1, PAR-2, ...`
- `teacher_profiles` → `TCH-1, TCH-2, ...`
- `orders` → `ORD-1, ORD-2, ...`
- `transactions` → `TXN-1, TXN-2, ...`
- `admins` → SERIAL integer (1, 2, ...)

### Tables

#### `admins`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | Integer |
| phone_number | VARCHAR(20) UNIQUE | Admin login phone |
| password | VARCHAR(255) | bcrypt hashed |
| is_logged_in | BOOLEAN | Default false |
| last_login | TIMESTAMP | |
| refresh_token | TEXT | Stored for refresh validation |
| created_at | TIMESTAMP | |

**Seed:** Default admin seeded: `+911234567890 / adminpassword`

#### `clients`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `P-{n}` |
| phone_number | VARCHAR(20) UNIQUE | OTP login only |
| is_logged_in | BOOLEAN | |
| last_login | TIMESTAMP | |
| refresh_token | TEXT | |
| created_at | TIMESTAMP | |

#### `schools`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `SH-{n}` |
| name | VARCHAR(255) UNIQUE | |
| address | TEXT NOT NULL | |
| city | VARCHAR(100) NOT NULL | |
| state | VARCHAR(100) NOT NULL | |
| pincode | VARCHAR(20) NOT NULL | |
| country | VARCHAR(100) | Default: 'India' |
| is_active | BOOLEAN | Default: true |
| is_deleted | BOOLEAN | Soft delete flag |
| created_by | INTEGER → admins.id | |
| updated_by | INTEGER → admins.id | |
| created_at / updated_at | TIMESTAMP | |

#### `children`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `CH-{n}` |
| parent_id | VARCHAR(20) → clients.id CASCADE | |
| name | VARCHAR(255) NOT NULL | |
| roll_number | VARCHAR(50) NOT NULL | |
| school_id | VARCHAR(20) → schools.id | |
| standard_id | INTEGER → standards.id | |
| meal_size_id | INTEGER → meal_sizes.id | |
| meal_time | TIME NOT NULL | |
| created_at / updated_at | TIMESTAMP | |

**Business Rule: Max 3 children per parent (enforced in controller)**

#### `meal_sizes` (Seeded, read-only)
| id | name | display_name | sort_order |
|---|---|---|---|
| 1 | small | Small | 1 |
| 2 | medium | Medium | 2 |
| 3 | large | Large | 3 |

#### `standards` (Seeded, read-only)
| id | name | display_name | numeric_value |
|---|---|---|---|
| 1 | 1st | 1st Standard | 1 |
| ... | ... | ... | ... |
| 12 | 12th | 12th Standard | 12 |

#### `daily_menus`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `MN-{n}` |
| image_url | TEXT NOT NULL | Cloudinary CDN URL |
| image_public_id | TEXT | Cloudinary public ID (for deletion) |
| items | TEXT | Comma-separated food items |
| menu_date | DATE | Default: today |
| is_active | BOOLEAN NOT NULL | Must send on PUT |
| created_by | INTEGER → admins.id | |
| created_at / updated_at | TIMESTAMP | |

#### `subscriptions`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `SUB-{n}` |
| plan_name | VARCHAR(255) NOT NULL | |
| price | DECIMAL(10,2) NOT NULL | |
| billing_cycle | VARCHAR(50) NOT NULL | e.g. "Monthly", "Yearly" |
| trial_days | INTEGER | Default: 0 |
| display_order | INTEGER | Default: 1 |
| is_active | BOOLEAN | |
| created_by / updated_by | INTEGER → admins.id | |
| created_at / updated_at | TIMESTAMP | |

#### `corporate_locations`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `CL-{n}` |
| name | VARCHAR(255) NOT NULL | |
| address | TEXT NOT NULL | |
| city | VARCHAR(100) NOT NULL | |
| state | VARCHAR(100) NOT NULL | |
| is_active | BOOLEAN | |
| created_by | INTEGER → admins.id | |
| created_at / updated_at | TIMESTAMP | |

#### `parent_profiles`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `PAR-{n}` |
| client_id | VARCHAR(20) UNIQUE → clients.id CASCADE | One profile per client |
| name | VARCHAR(255) NOT NULL | |
| created_at / updated_at | TIMESTAMP | |

#### `teacher_profiles`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `TCH-{n}` |
| client_id | VARCHAR(20) UNIQUE → clients.id CASCADE | |
| name | VARCHAR(255) NOT NULL | |
| school_college_name | VARCHAR(255) NOT NULL | |
| city / state | VARCHAR(100) | |
| location | TEXT NOT NULL | |
| status | VARCHAR(50) | Default: 'active' |
| created_at / updated_at | TIMESTAMP | |

#### `professional_profiles`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `PRO-{n}` |
| client_id | VARCHAR(20) UNIQUE → clients.id CASCADE | |
| name | VARCHAR(255) NOT NULL | |
| company_name | VARCHAR(255) NOT NULL | |
| corporate_location_id | VARCHAR(20) → corporate_locations.id | |
| city / state | VARCHAR(100) | |
| lunch_time | TIME NOT NULL | |
| created_at / updated_at | TIMESTAMP | |

#### `orders`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `ORD-{n}` |
| client_id | VARCHAR(20) → clients.id CASCADE | |
| subscription_id | VARCHAR(20) → subscriptions.id | |
| entity_type | VARCHAR(20) | `'child'`, `'teacher'`, `'professional'` |
| entity_id | VARCHAR(20) | FK to child/teacher/professional |
| amount | DECIMAL(10,2) | |
| status | VARCHAR(20) | `pending`, `completed`, `failed`, `cancelled` |
| created_at / updated_at | TIMESTAMP | |

#### `transactions`
| Column | Type | Notes |
|---|---|---|
| id | VARCHAR(20) PK | `TXN-{n}` |
| order_id | VARCHAR(20) → orders.id CASCADE | |
| merchant_transaction_id | VARCHAR(255) UNIQUE | Generated: `TXN_{orderId}_{timestamp}` |
| gateway_transaction_id | VARCHAR(255) | From PhonePe |
| amount | DECIMAL(10,2) | |
| status | VARCHAR(20) | `pending`, `success`, `failure` |
| payment_method | VARCHAR(50) | |
| gateway_response | JSONB | Full gateway payload |
| created_at / updated_at | TIMESTAMP | |

#### `client_subscriptions`
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| client_id | VARCHAR(20) → clients.id CASCADE | |
| subscription_id | VARCHAR(20) → subscriptions.id | |
| entity_type | VARCHAR(20) | |
| entity_id | VARCHAR(20) | |
| start_date | TIMESTAMP | |
| end_date | TIMESTAMP | Extended on renewal |
| is_active | BOOLEAN | |
| order_id | VARCHAR(20) → orders.id | |
| UNIQUE | (client_id, entity_id, entity_type) | One active sub per entity |

---

## 4. COMPLETE API REFERENCE

### Authentication Strategy
- **Admin routes** use `ADMIN_JWT_SECRET`, signed with `role: 'admin'`
- **Client routes** use `CLIENT_JWT_SECRET`, signed with `role: 'client'`
- **Common routes** use `commonAuthMiddleware` — accepts both roles
- All protected routes require: `Authorization: Bearer <accessToken>`
- Refresh tokens stored in DB and invalidated on logout

### Admin APIs (`/api/admin/...`)

#### Auth
| Method | Endpoint | Body | Response |
|---|---|---|---|
| POST | `/api/admin/auth/login` | `{ phoneNumber, password }` | `{ success, message }` — triggers Firebase OTP |
| POST | `/api/admin/auth/verify-otp` | `{ phoneNumber, code }` | `{ success, data: { accessToken, refreshToken, user } }` |
| POST | `/api/admin/auth/logout` | — (Bearer token) | `{ success, message }` |
| POST | `/api/admin/auth/refresh` | `{ refreshToken }` | `{ success, data: { accessToken, refreshToken } }` |

#### Schools
| Method | Endpoint | Body / Params | Notes |
|---|---|---|---|
| POST | `/api/admin/schools` | `{ name, address, city, state, pincode, country? }` | Duplicate name → 409 |
| GET | `/api/admin/schools` | Query: `page, limit, search` | Response: `{ data: { schools[], pagination } }` |
| GET | `/api/admin/schools/:id` | Path: `id` (e.g. `SH-1`) | Response: `{ data: { school } }` |
| PUT | `/api/admin/schools/:id` | Any school fields (all optional) | COALESCE update |
| DELETE | `/api/admin/schools/:id` | Path: `id` | Hard delete from DB |

#### Subscriptions
| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/admin/subscriptions` | `{ plan_name, price, billing_cycle, trial_days?, display_order?, is_active? }` |
| PUT | `/api/admin/subscriptions/:id` | Any subscription fields |
| DELETE | `/api/admin/subscriptions/:id` | — |

#### Menu (multipart/form-data)
| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/admin/menu/upload` | FormData: `image` (file), `menu_date`, `items?` |
| PUT | `/api/admin/menu/:date` | FormData: `image?` (file), `items?`, `is_active` (**required**) |
| DELETE | `/api/admin/menu/:date` | Path: date in `YYYY-MM-DD` format |

> ⚠️ **CRITICAL**: `PUT /api/admin/menu/:date` requires `is_active` in the body. Its DB column is NOT NULL. Omitting it causes a 500 constraint error.

#### Corporate Locations
| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/admin/corporate-locations` | `{ name, address, city, state, is_active? }` |

#### Lookup (Read-only, seeded data)
| Method | Endpoint | Response |
|---|---|---|
| GET | `/api/admin/lookup/meal-sizes` | `{ data: { mealSizes: [] } }` |
| GET | `/api/admin/lookup/standards` | `{ data: { standards: [] } }` |

#### Payments (Analytics)
| Method | Endpoint | Query Params |
|---|---|---|
| GET | `/api/admin/payment/all` | `schoolId, entityType, status, startDate, endDate, page, limit` |
| GET | `/api/admin/payment/stats` | — → `{ data: { overall: { total_revenue, total_orders, pending_orders, failed_orders }, byEntity[] } }` |

---

### Client APIs (`/api/client/...`)

#### Auth (OTP-only, no password)
| Method | Endpoint | Body | Notes |
|---|---|---|---|
| POST | `/api/client/auth/send-otp` | `{ phoneNumber }` | Sends Firebase OTP |
| POST | `/api/client/auth/verify-otp` | `{ phoneNumber, code }` | Auto-registers if new user |
| POST | `/api/client/auth/logout` | Bearer token | Clears refresh token |
| POST | `/api/client/auth/refresh` | `{ refreshToken }` | Rotates token |
| GET | `/api/client/auth/me` | Bearer token | Returns parent/professional/teacher profile status |

#### Children (Buuttii Kids)
| Method | Endpoint | Body / Params |
|---|---|---|
| POST | `/api/client/children` | `{ children: [{ name, rollNumber, schoolId, standardId, mealSizeId, mealTime }] }` |
| GET | `/api/client/children` | — Returns joined data with school_name, standard_name, meal_size_name |
| PUT | `/api/client/children/:childId` | Any child fields |
| DELETE | `/api/client/children/:childId` | — |

> **Business Rule: Maximum 3 children per parent (enforced server-side)**

#### Parent Profile
| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/client/parent/profile` | `{ name }` — upsert |
| PUT | `/api/client/parent/profile` | `{ name }` |
| GET | `/api/client/parent/profile` | — |
| DELETE | `/api/client/parent/profile` | — |

#### Teacher Profile (Buuttii Kids — school staff)
| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/client/teacher/profile` | `{ name, school_college_name, city, state, location }` |
| PUT | `/api/client/teacher/profile` | Any fields |
| GET | `/api/client/teacher/profile` | — |
| DELETE | `/api/client/teacher/profile` | — |

#### Professional Profile (Buuttii Pro)
| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/client/professional/profile` | `{ name, company_name, corporate_location_id, city, state, lunch_time }` |
| PUT | `/api/client/professional/profile` | Any fields |
| GET | `/api/client/professional/profile` | — |
| DELETE | `/api/client/professional/profile` | — |

#### Payments (PhonePe)
| Method | Endpoint | Body / Notes |
|---|---|---|
| POST | `/api/client/payment/initiate` | `{ subscriptionId, entityType, entityId, customRedirectUrl? }` → returns `paymentUrl` |
| POST | `/api/client/payment/webhook` | Called by PhonePe servers (not by client app) |
| GET | `/api/client/payment/status/:txnId` | Syncs from PhonePe + updates DB |
| GET | `/api/client/payment/status-page` | Query: `?tid=...` — HTML landing page after redirect |
| GET | `/api/client/payment/history` | Query: `page, limit` |
| GET | `/api/client/payment/active-subscriptions` | Returns all active subscriptions with entity names |

---

### Common APIs (`/api/common/...`)
Accessible by both Admin and Client JWTs.

| Method | Endpoint | Response |
|---|---|---|
| GET | `/api/common/schools` | `{ data: { schools[], pagination } }` Query: `page, limit, search` |
| GET | `/api/common/lookup/meal-sizes` | `{ data: { mealSizes[] } }` |
| GET | `/api/common/lookup/standards` | `{ data: { standards[] } }` |
| GET | `/api/common/subscriptions` | `{ count, data: [] }` flat array |
| GET | `/api/common/subscriptions/:id` | `{ data: {} }` |
| GET | `/api/common/corporate-locations` | `{ count, data: [] }` flat array |
| GET | `/api/common/menu/history/all` | `{ count, data: [] }` Query: `limit` (default all) |
| GET | `/api/common/menu/:date` | `{ data: {} }` for a specific date |

---

## 5. ENVIRONMENT VARIABLES (.env)

```
PORT=3000
NODE_ENV=development

# Database
DB_USER=<postgres_username>
DB_PASSWORD=<postgres_password>
DB_NAME=Meal
DB_HOST=localhost
DB_PORT=5432

# JWT Secrets
CLIENT_JWT_SECRET=client_super_secret_key_123
CLIENT_REFRESH_SECRET=client_refresh_secret_key_456
ADMIN_JWT_SECRET=admin_super_secret_key_789
ADMIN_REFRESH_SECRET=admin_refresh_secret_key_012
JWT_EXPIRES_IN=2d
REFRESH_TOKEN_EXPIRES_IN=7d

# Firebase (for OTP)
FIREBASE_API_KEY=<firebase_web_api_key>
FIREBASE_PROJECT_ID=<project_id>

# Cloudinary (for menu image uploads)
CLOUDINARY_CLOUD_NAME=<cloud_name>
CLOUDINARY_API_KEY=<api_key>
CLOUDINARY_API_SECRET=<api_secret>

# PhonePe (Payment Gateway)
PHONEPE_CLIENT_ID=<client_id>
PHONEPE_CLIENT_SECRET=<client_secret>
PHONEPE_CLIENT_VERSION=1
PHONEPE_ENV=sandbox        # 'live' for production
PHONEPE_REDIRECT_URL=http://localhost:3000/api/client/payment/status-page
```

---

## 6. KEY SERVICES & UTILITIES

### OTP Service (`src/common/services/otpService.js`)
- Uses **Firebase REST API** (not Firebase Admin SDK)
- In-memory `sessionStore` Map: `phoneNumber → sessionInfo`
- Sessions auto-expire after **10 minutes**
- `sendOTP(phoneNumber)` → stores `sessionInfo`, sends SMS
- `verifyOTP(phoneNumber, code)` → validates via Firebase, deletes session

### PhonePe Utility (`src/common/utils/phonepe.js`)
- Singleton class wrapping `@phonepe-pg/pg-sdk-node` V2 SDK
- `initiatePayment(data)` → returns `{ redirectUrl }`
- `checkStatus(merchantTransactionId)` → polls gateway
- Amount is converted to paise: `Math.round(amount * 100)`

### AppError (`src/common/utils/AppError.js`)
```js
new AppError('message', statusCode) // isOperational = true
```

### catchAsync (`src/common/utils/catchAsync.js`)
Wraps every async controller to pass errors to the global error handler.

---

## 7. SECURITY ARCHITECTURE

| Layer | Implementation |
|---|---|
| Helmet | Security headers on all responses |
| Rate Limiting | 100 req per 15 min per IP on all `/api/*` routes |
| JWT Auth | Separate secrets for admin and client roles |
| Password Hashing | bcrypt with salt rounds = 10 |
| SQL Injection | Parameterized queries only (`$1, $2, ...`) |
| Refresh Token Rotation | New refresh token issued on every refresh call |
| Token Revocation | Refresh tokens stored in DB; logout nullifies them |

---

## 8. BUSINESS LOGIC RULES

1. **Max 3 children per parent** — checked in `childController.addChildren` before insert. Also validated in `childValidator.js` (request-level).
2. **Menu `is_active` is required on PUT** — NOT NULL constraint in DB; must always send it
3. **Menu dates are timezone-sensitive** — DB stores UTC; frontend must use local date extraction (not `.slice(0,10)` on ISO string) to avoid off-by-one errors in IST (+05:30)
4. **Subscription renewal extends end_date** — if an active subscription exists, new payment extends from current `end_date`, not from today
5. **Schools use hard delete** (not soft delete despite `is_deleted` column existing) — DELETE runs `DELETE FROM schools WHERE id = $1`
6. **Admin login is 2-step**: Step 1 = password verify + OTP send; Step 2 = OTP verify + JWT issue
7. **Client login is 1-step**: OTP only — auto-registers new users on first verify
8. **Roll number uniqueness** is per school (not global)
9. **Mutual exclusivity: Teacher vs Professional** — a client CANNOT have both a teacher profile and a professional profile. Creating one blocks creating the other (403 Forbidden). Enforced in both `teacherController.saveTeacherProfile` and `professionalController.saveProfessionalProfile`.
10. **Admin can view/delete teacher & professional profiles** — controllers check `req.user.role === 'admin'` and accept optional `?clientId=` query param to act on behalf of a specific user.

---

## 9. KNOWN ISSUES & GOTCHAS

| Issue | Detail |
|---|---|
| Rate limit in dev | 100 req/15min is hit fast with React Strict Mode (double renders). Frontend uses a 5-second GET cache to mitigate. |
| PhonePe not configured | `PHONEPE_CLIENT_ID` not in `.env` yet. PhonePe SDK will silently fail on init. Client payment routes exist but cannot be tested without credentials. |
| `is_active` on menu PUT | Always send `is_active` (true/false) in FormData for menu updates or the server returns 500. |
| `school_college_name` on teacher | This is a plain text field, not a FK to `schools`. Linking teacher to a school record is not enforced at DB level. |
| OTP in-memory store | `sessionStore` is a Node.js Map — it resets on server restart. In production, replace with Redis. |
| `professionalController` uses raw `query` import | `const { query } = require('../../common/database')` — no `catchAsync` wrapper. Errors caught manually in try/catch. Same for `teacherController`. |
| Swagger title is outdated | `swagger.js` title says "Meal Subscription OTP API" — should be updated to reflect full system scope. |
| Image upload max size | Cloudinary upload middleware sets 5MB limit per file. Larger files will be rejected by multer before hitting the controller. Only `jpg`, `png`, `jpeg` are allowed. Images are auto-resized to max 1000×1000px by Cloudinary transformation. |

---

## 10. CODING STANDARDS (MUST FOLLOW)

1. **Never use `SELECT *`** — always name specific columns for clarity and performance
2. **Always use parameterized queries** — never string interpolation in SQL
3. **One concern per file** — controllers only handle HTTP; business logic goes in services
4. **Use `catchAsync`** — wrap every async route handler
5. **Use `AppError`** — never call `res.status().json()` directly for errors; use `next(new AppError(...))`
6. **Swagger on every route** — all new routes must have full `@swagger` JSDoc with request body AND response body schemas
7. **Validators in separate files** — use the `validators/` folder; never validate inside controllers
8. **Proper HTTP status codes**: 200 GET/PUT, 201 POST, 204 DELETE (or 200 with message), 400 validation, 401 auth, 403 forbidden, 404 not found, 409 conflict, 500 server error

---

## 11. CURRENT PROGRESS STATUS

### ✅ DONE (Fully Implemented)
- Admin authentication (2-step: password + OTP)
- Admin: Schools CRUD
- Admin: Subscriptions CRUD
- Admin: Daily Menu upload/update/delete (Cloudinary)
- Admin: Corporate Locations (create only)
- Admin: Lookup data (meal sizes, standards) — seeded
- Admin: Payment analytics (all payments + stats)
- Client authentication (OTP only, auto-register)
- Client: Children CRUD (max 3)
- Client: Parent profile CRUD
- Client: Teacher profile CRUD
- Client: Professional profile CRUD
- Client: Payment initiation (PhonePe V2 SDK)
- Client: Payment webhook handler
- Client: Payment status check + sync
- Client: Payment history
- Client: Active subscriptions list
- Common: Schools list (paginated)
- Common: Lookup APIs
- Common: Subscription plans list
- Common: Corporate locations list
- Common: Menu history + menu by date

### ⏳ PENDING / NOT YET BUILT
- Admin: Edit/Delete corporate locations
- Admin: View subscribers per school
- Admin: Push notifications (send to all users or specific schools)
- Admin: Report generation (school-wise)
- Admin: Edit/delete teacher or professional profiles
- Client: Subscription expiry notifications
- QR code / unique ID per child for meal tracking
- WhatsApp chat integration
- Feedback/message system
