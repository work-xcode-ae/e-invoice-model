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

## Flow
Browse packages → Select → (Login/Register if needed) → Cart → Pay → Payment success → Dashboard → Create company → Add users.

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
  components/  Navbar, Footer, Logo, PackageCard, PageHero, ProtectedRoute, ScrollToTop
  context/     AuthContext (session + cart)
  data/        packages.js (plans, billing periods, add-ons, VAT)
  pages/       Home, Packages, Requirements, Contact, Login, Register, Cart, Dashboard, NotFound
  services/    api.js (mock API)
  index.css    design tokens + all styles
```
