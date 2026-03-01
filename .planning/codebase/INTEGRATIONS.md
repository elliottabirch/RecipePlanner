# External Integrations

**Analysis Date:** 2026-03-01

## APIs & External Services

**PocketBase Backend:**
- PocketBase v0.26.5+ - Backend database and CMS platform
  - SDK/Client: `pocketbase` npm package
  - Authentication: Built-in user authentication system
  - Usage: Primary backend for all data persistence

## Data Storage

**Databases:**
- PocketBase (dual instance setup)
  - Production instance: `http://192.168.50.95:8090`
    - Connection env var: `VITE_POCKETBASE_URL`
    - Client: `pocketbase` SDK in `src/lib/pocketbase.ts`
  - Test instance: `http://192.168.50.95:8091`
    - Connection env var: `VITE_POCKETBASE_TEST_URL`
    - Client: `pocketbase` SDK in `src/lib/pocketbase.ts`
  - Default environment: Test (for safety)
  - Storage key for persistence: `pb_db_environment` (localStorage)

**Database Collections:**
Located in `src/lib/api.ts`, the following PocketBase collections are used:
- `stores` - Retail stores for ingredient sourcing
- `sections` - Store sections (produce, dairy, etc.)
- `container_types` - Meal container types
- `tags` - Recipe/meal tags and categories
- `products` - Ingredients and products
- `recipes` - Recipe definitions
- `recipe_tags` - Recipe-to-tag relationships
- `recipe_product_nodes` - Recipe product nodes in flow diagram
- `recipe_steps` - Recipe preparation steps
- `product_to_step_edges` - Product-to-step edges in recipe flow
- `step_to_product_edges` - Step-to-product edges in recipe flow
- `weekly_plans` - Weekly meal plans
- `planned_meals` - Meals assigned to weekly plans
- `inventory_items` - User inventory tracking
- `meal_variant_overrides` - Customizations for meal variants

**File Storage:**
- Not detected - No file upload/storage integrations found

**Caching:**
- Browser localStorage only
  - Database environment preference: `pb_db_environment` key
  - PocketBase client state management: In-memory

## Authentication & Identity

**Auth Provider:**
- PocketBase built-in authentication
  - Implementation: OAuth2-compatible user system
  - Located in: `src/lib/pocketbase.ts`
  - No user authentication UI implemented in current codebase
  - PocketBase handles user management and permissions

## Monitoring & Observability

**Error Tracking:**
- Not detected - No error tracking service configured

**Logs:**
- systemd journalctl on production NAS
  - Access: `ssh nas "journalctl --user -u recipe-planner -f"`
  - Service logs available via `--user` flag for `nasadmin` account
- Browser console for client-side debugging

## CI/CD & Deployment

**Hosting:**
- Linux NAS (OpenMediaVault) at `192.168.50.95`
  - Frontend served on port 3000
  - Production PocketBase: port 8090
  - Test PocketBase: port 8091

**CI Pipeline:**
- Not detected - No CI/CD automation configured
- Manual deployment process via SSH commands

**Deployment Process:**
- Git pull on NAS: `/srv/dev-disk-by-uuid-6ba0fcd6-7c5b-48eb-8f78-30d953f694fd/appdata/recipe-planner/`
- npm install && npm run build on NAS
- systemd service restart: `systemctl --user restart recipe-planner`
- Static file serving via `serve` package on built `/dist/` directory

## Environment Configuration

**Required env vars:**
- `VITE_POCKETBASE_URL` - Production PocketBase URL
- `VITE_POCKETBASE_TEST_URL` - Test PocketBase URL

**Secrets location:**
- `.env` file in `/home/ellio/code/RecipePlanner/recipe-planner/.env`
- Contains non-secret configuration (URLs only, no passwords)
- PocketBase authentication credentials managed by PocketBase admin panel

## Webhooks & Callbacks

**Incoming:**
- Not detected - No webhook endpoints exposed

**Outgoing:**
- Not detected - No outgoing webhook integrations found

## Network Architecture

**Frontend to Backend:**
- HTTP requests from React app to PocketBase REST API
- PocketBase SDK handles request/response serialization
- Real-time updates disabled: `pb.autoCancellation(false)` in `src/lib/pocketbase.ts`

**Database Switching:**
- Runtime environment switching between production/test databases
- Implementation: `src/lib/pocketbase.ts` - `switchDatabase()` function
- Uses localStorage to persist environment selection
- Page reload required to reinitialize PocketBase client

---

*Integration audit: 2026-03-01*
