# Model E-Invoice — Customer Website (React + Vite)

Public website and customer portal for the multi-tenant e-invoicing SaaS.

## Run
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in /dist
```

## Pages
| Route | Page |
|---|---|
| `/` | Landing: hero, how it works (8-step journey), 3 invoice input methods, validation → queue → Peppol → FTA pipeline, packages, FAQ |
| `/packages` | Packages with 1/2/3-month billing, add-on transactions, feature comparison, package & user-limit rules |
| `/requirements` | Onboarding documents, technical requirements, EmaraTax linking steps, requirements form with a live package recommendation |
| `/contact` | Contact info + message form (returns a ticket number) |
| `/login`, `/register` | Auth with validation, password strength, remember me, forgot password, social buttons (placeholders) |
| `/cart` | Cart → period selection → subtotal + 5% VAT → Stripe payment (mock) → payment success |
| `/dashboard` | Protected. Subscription ring (used/limit), renew/upgrade/add-on, onboarding checklist, create company, add users (enforces package user limit) |

## Demo accounts (created automatically in the browser)
| Account | Email | Password |
|---|---|---|
| Customer company owner (ABC Trading) | `demo@modelfc.ae` | `Demo@2026` |
| Team member · Admin | `omar@abctrading.ae` | `Demo@2026` |
| Team member · Accountant | `sara@abctrading.ae` | `Demo@2026` |
| Team member · Viewer | `priya@abctrading.ae` | `Demo@2026` |
| System admin (product owner) | `admin@modelfc.ae` | `Admin@2026` |

All have one-click buttons on the login page.

## Report grids (`src/components/ReportGrid.jsx`)
Every report has a **From / To** date filter (default: the current month, plus presets: last month, last 3 months, this year, last 12 months) and is an on-screen grid with search (all words, all columns), click-to-sort columns, paging (10/25/50/100) and a totals row, plus:
- **Print** — clean A4 layout, column headers repeat on every page.
- **PDF** — A4 file with the MEI header, repeated column headers, totals and page numbers; rendered from HTML so Arabic / RTL is correct (`jspdf` + `html2canvas`, loaded only when used).
- **Excel** — real numbers with formats, filter on the header row and totals.
Exports contain what the grid shows (search and sort applied, all pages). Logic in `src/services/exporters.js`.

## Two panels
**1. Customer company panel** (`/dashboard`) — the owner and their team.
- Menu: *Invoicing* (Overview, Invoices, Reports) · *Master data* (Customers, Categories, Items) · *Account* (Plan & billing, Company, Users, Support).
- **Roles** (`src/services/permissions.js`): Owner = everything incl. billing; Admin = everything except billing; Accountant = invoices, master data, reports, support; Viewer = read only. Menu items and buttons follow the role; Users shows the full permission table. New users get a temporary password (demo; a real backend sends an invitation).
- **Reports**: amount invoiced, VAT, passed/failed, average invoice, invoices per period, how they were created, top customers, top items, VAT summary per category (S/Z/E/O) and an Excel export.
- **Support**: open tickets and follow the conversation with the MEI team.

**2. System admin panel** (`/admin`) — the product owner sees everything.
- *Overview*: Business overview — profit, sales, MRR, new customers, invoices passed today, pending to sync, open tickets, companies low on invoices, sales chart, packages, invoices left per company, renewals due.
- *Business*: **Sales & profit** (range, sales by type/package, top companies, payments, P&L with editable costs: Peppol cost per invoice, gateway fees, fixed costs) · **Packages** (prices, limits, availability, add-on prices, subscribers/MRR per package) · **Companies** (invoices left, passed/failed/pending, revenue, filters, export, drawer with free-invoice credit) · **Reports** (7 report grids: sales & payments, profit & loss by period, companies & balances, packages, all invoices, invoice volume per company, support tickets).
- *Customer care*: **Support tickets** (reply, status, priority) · **Notifications** (send to one, selected, a package, low balance, expiring, expired or all companies) · Refund requests.
- *Operations*: Invoice monitoring, Sync queue, Invoices, Logs. *System*: Users, **Tax & VAT** (each change has a start date: today or scheduled for later, cancellable until it starts; payments use the rate on the payment date and e-invoices the rate on their issue date; VAT registered or not, VAT % on our sales, prices including or excluding VAT, standard rate S on customers' e-invoices, our TRN for subscription tax invoices, with confirmation and change history; applies to new payments and invoices only), Integrations, Settings. Admin → Settings → *Reset demo data* restores everything.

## Features mapped to the flow diagrams
| Diagram | Where |
|---|---|
| 1 · Customer journey (register → package → Stripe → company → users → master data → invoice) | Register, Packages, Cart, Dashboard → Company / Users / Master data / Invoices |
| 2 · Invoice transaction flow (3 inputs → validation → package & user check → queue → background process with retry ×10 → White Label → status & count) | Dashboard → Invoices (Manual entry, Excel upload, API / SDK sandbox), invoice detail timeline; engine in `src/services/invoices.js` |
| 3 · Package management (add-on, renew, upgrade/downgrade, user limits) | Packages, Cart, Dashboard → Plan & billing, Users (activate/deactivate/remove) |
| 4 · Admin monitoring & reporting | `/admin`: dashboard, invoices, packages, customers, users, queue monitor, refunds, reports & logs, settings |
| Refund process | Dashboard → Plan & billing → Refunds; Admin → Refund requests (checklist, approve via Stripe / reject) → package Refunded (Locked) |
| Notifications | Bell in the navbar (the demo account comes with sample notifications) + banners on the dashboard: invoices left (20% / 10% / 0), renewal (≤7 days), expired, failed invoices, refund decisions |

The queue engine runs in the browser every second for the demo (production: every 5–10 minutes, server-side). Admin → Settings controls success rate, step duration and retry delay.

## Master data & invoice creation
- **Dashboard menu → Customers, Categories, Items** (one page each). Click a row to edit, or use *Add*.
  - Customer: trading/legal name, TRN, trade licence, Peppol ID + scheme (0235 = UAE TIN), address (street, city, P.O. Box, emirate, country), contact, buyer reference, payment terms. A *Ready / Incomplete* badge shows whether it can be e-invoiced.
  - Item: name, description, category, SKU, price, unit (UN/ECE Rec 20: C62, H87, HUR, DAY, MON…), VAT category (S 5% · Z 0% · E exempt · O out of scope), GTIN, origin, classification.
  - Category: default unit, VAT category and classification applied to new items.
- **Import from Excel** (button on Customers, Categories and Items): download the template or export the current list, fill it in, upload. A preview shows each row as *New*, *Update* or *Skipped* (with the reason). Customers are matched by TRN then name, items by SKU then name, categories by name. Unknown categories in the items file are created. Logic in `src/services/masterImport.js`.
- **Dashboard → Company**: seller details printed on every invoice (TRN, address, IBAN `AE` + 21 digits, BIC).
- **Invoices → Manual entry**: pick or create a customer inline (*New customer…*), edit it from the buyer card, pick or create items inline, set unit and VAT category per line. VAT is calculated per category.
- **Invoices → Excel upload**: template columns `InvoiceRef, IssueDate, DueDate, CustomerTRN, Customer, ItemSKU, Description, Qty, Unit, UnitPrice, VATCategory, BuyerReference` (one row per line; same InvoiceRef = one invoice). Rejected rows get quick-fix buttons (add/edit customer, add item, company details) and *Validate again*.

## Qvalia integration (Peppol / PINT AE)
Valid invoices are converted to a UBL 2.1 invoice in Qvalia's format (JSON as in
https://api.qvalia.io/sample-data/api-sample-data/invoice, or XML) and sent with
`POST /transaction/{accountRegNo}/invoices/outgoing?delivery_method=peppol` plus an `Idempotency-Key`.
- Builder: `src/services/qvalia.js` (`toQvaliaJson`, `toUblXml`, `sendInvoice`); code lists in `src/data/ubl.js`.
- Responses: 200 → Success (integration ID stored) · 409 → already accepted · 429 / 5xx / timeout → retried (max 10) · other 4xx → Failed with Qvalia's message.
- Open any invoice to see the request, the JSON/XML payload and Qvalia's response (copy / download).
- **Admin → Integrations**: Simulation (default, nothing is sent) or Live; environment (test/production), account registration number, profile (PINT AE `urn:peppol:pint:billing-1@ae-1` or Peppol BIS 3.0), body format, Peppol scheme, proxy URL + *Test connection*.

### Running live
The API key must never be in the browser, so a tiny proxy (no dependencies) adds it server-side:
```bash
QVALIA_API_KEY=your-key QVALIA_ENV=test npm run proxy      # port 8787
# Windows PowerShell
$env:QVALIA_API_KEY="your-key"; $env:QVALIA_ENV="test"; npm run proxy
```
`npm run dev` forwards `/api/qvalia` to it. Then Admin → Integrations → *Live*, enter the account registration number from Qvalia, *Test connection*.
Confirm the PINT AE customization/profile IDs and your account number with Qvalia before production.

## Flow
Browse packages → Select → (Login/Register if needed) → Cart → Pay → Payment success → Dashboard → Create company → Add users.

## Languages (English / العربية)
- Switch in the navbar (desktop and mobile). The choice is remembered per browser.
- Arabic switches the whole page to right-to-left (`<html dir="rtl" lang="ar">`) and uses IBM Plex Sans Arabic.
- English text is the translation key: `t('Packages')`. Arabic lives in `src/i18n/ar.js`, `ar2.js` and `ar3.js`.
  To add a text: wrap it in `t('…')` and add the same English string with its Arabic in `ar.js`.
- Values go in placeholders: `t('Renew {name}', { name })`.
- In `npm run dev`, any text without an Arabic translation is collected in `window.__missingAr` (open the console in Arabic mode).

## Brand (MEI Logo & Color Scheme)
- Deep Navy `#092F58` · Ocean Teal `#3DB4D2` · Muted Gold `#C99B5B` · Champagne `#E7BE7D`
- Logo files in `public/brand/`: colour mark for light backgrounds, white mark for navy backgrounds.
- Wordmark: thin, widely spaced uppercase (Montserrat 300). Fonts are bundled via `@fontsource`, no Google Fonts call.

## Connecting a backend
All data access lives in `src/services/api.js` (currently localStorage mock, demo only — passwords are NOT hashed).
Replace each function with `fetch()` calls to your API, e.g.:
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/forgot-password`
- `GET /api/packages` (replace `src/data/packages.js`)
- `POST /api/checkout` → create a Stripe Checkout Session, confirm by webhook
- `POST /api/companies`, `POST /api/companies/{id}/users`
- `POST /api/contact`, `POST /api/requirements`

## Structure
```
src/
  services/    api.js (auth, checkout, store), invoices.js (validation, queue engine), refunds.js, notifications.js,
               masterData.js, admin.js, logs.js, seed.js (demo data)
  pages/dashboard/  Invoices, InvoiceInputs (manual / Excel / API), MasterData, Refund
  pages/admin/      Admin (layout, dashboard, customers, users, invoices), AdminOps (queue, refunds, packages, logs, settings)
  components/  Navbar, Footer, Logo, PackageCard, PageHero, ProtectedRoute, ScrollToTop, NotificationBell, AlertBanner
  context/     AuthContext (session + cart)
  data/        packages.js (plans, billing periods, add-ons, VAT)
  pages/       Home, Packages, Requirements, Contact, Login, Register, Cart, Dashboard, NotFound
  services/    api.js (mock API)
  index.css    design tokens + all styles
```
