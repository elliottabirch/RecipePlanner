# Test Database Environment - Implementation Checklist

## Quick Reference
- **Production DB**: http://192.168.50.95:8090 (RED indicator)
- **Test DB**: http://192.168.50.95:8091 (GREEN indicator)
- **Main Plan**: See [`test-database-environment.md`](test-database-environment.md)

## Pre-Implementation

- [ ] Verify test PocketBase instance running on port 8091
- [ ] Confirm both databases are accessible from development machine

## Phase 1: Configuration (Code Mode)

### Environment Configuration
- [ ] Update [`recipe-planner/.env`](../recipe-planner/.env) with test database URL
- [ ] Create [`recipe-planner/src/lib/db-config.ts`](../recipe-planner/src/lib/db-config.ts)

### PocketBase Client Updates  
- [ ] Refactor [`recipe-planner/src/lib/pocketbase.ts`](../recipe-planner/src/lib/pocketbase.ts)
  - Add `getCurrentEnvironment()` function
  - Add `setCurrentEnvironment()` function
  - Add `getCurrentDbUrl()` function
  - Add `switchDatabase()` function
  - Make `pb` instance switchable

## Phase 2: UI Components (Code Mode)

### Database Switcher Component
- [ ] Create [`recipe-planner/src/components/DatabaseSwitcher.tsx`](../recipe-planner/src/components/DatabaseSwitcher.tsx)
  - Chip displaying current database
  - Menu for selecting database
  - Confirmation dialog for production switch
  - Color-coded indicators (RED=prod, GREEN=test)

### Layout Integration
- [ ] Update [`recipe-planner/src/components/Layout.tsx`](../recipe-planner/src/components/Layout.tsx)
  - Import DatabaseSwitcher component
  - Add to AppBar Toolbar (right side)

## Phase 3: Data Sync Script (Code Mode)

### Sync Script Creation
- [ ] Create [`recipe-planner/sync-to-test.js`](../recipe-planner/sync-to-test.js)
  - Connect to both databases
  - Copy all collections from prod to test
  - Preserve record IDs for relationships
  - Handle errors gracefully

### Package.json Update
- [ ] Add `sync-to-test` script to [`recipe-planner/package.json`](../recipe-planner/package.json)

## Phase 4: Import Script Updates (Code Mode)

### Import Script Enhancement
- [ ] Update [`recipe-planner/import-white-bean-stew.js`](../recipe-planner/import-white-bean-stew.js)
  - Add dotenv support
  - Use IMPORT_DB_URL environment variable
  - Default to test database
  - Display target database in console

### Import Helper Script
- [ ] Create [`recipe-planner/run-import.sh`](../recipe-planner/run-import.sh)
  - Support test/prod argument
  - Confirmation prompt for production
  - Set IMPORT_DB_URL environment variable

## Phase 5: Testing & Validation

### Functional Testing
- [ ] Start frontend: `npm run dev`
- [ ] Verify database switcher appears in UI
- [ ] Test switching to TEST database
- [ ] Verify persistence (reload page, check database)
- [ ] Test switching to PROD database (confirm dialog appears)
- [ ] Cancel production switch (verify stays on test)

### Data Sync Testing
- [ ] Run sync: `npm run sync-to-test`
- [ ] Switch UI to test database
- [ ] Verify all data appears correctly
- [ ] Check recipes, products, weekly plans

### Import Testing
- [ ] Run import on test: `bash run-import.sh test`
- [ ] Verify recipe import succeeds
- [ ] Check recipe appears in UI (on test database)
- [ ] Switch to production
- [ ] Verify production database unchanged

### Isolation Testing
- [ ] Make changes on test database (create/edit/delete)
- [ ] Switch to production
- [ ] Verify production unaffected
- [ ] Switch back to test
- [ ] Verify test changes persisted

## Phase 6: Documentation

- [ ] Update main README with database switcher usage
- [ ] Document sync workflow
- [ ] Document import workflow
- [ ] Add troubleshooting section

## Rollout

- [ ] Sync initial test database
- [ ] Deploy frontend with switcher
- [ ] Train team on database switcher usage
- [ ] Establish workflow for testing imports

## Success Criteria

✅ Database switcher visible and functional in UI  
✅ Clear visual indication of current database  
✅ Can switch between test and production seamlessly  
✅ Selection persists across sessions  
✅ Sync script successfully copies all data  
✅ Import scripts work on test database  
✅ Production database remains isolated from test changes  
✅ Confirmation required before production changes  

## Estimated Implementation Order

1. **Configuration** (30 min) - Set up environment and config files
2. **PocketBase Client** (20 min) - Add switching capability
3. **UI Component** (45 min) - Build DatabaseSwitcher component
4. **Layout Integration** (10 min) - Add switcher to Layout
5. **Sync Script** (30 min) - Build data sync functionality
6. **Import Updates** (20 min) - Update import scripts
7. **Testing** (45 min) - Comprehensive testing
8. **Documentation** (15 min) - Update docs

**Total**: Approximately 3-4 hours

## Quick Start Commands (After Implementation)

```bash
# Sync production data to test
npm run sync-to-test

# Run import on test database (safe)
bash run-import.sh test

# Run import on production (requires confirmation)
bash run-import.sh prod

# Start development server
npm run dev
```

## Notes

- Default to test database for all destructive operations
- Always sync before testing to ensure fresh data
- Use production only after thorough testing on test
- Database selection stored in localStorage per browser
