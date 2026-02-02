# Broccoli Patties - Recipe Flow

## Recipe Details

**Recipe Name**: Broccoli Patties  
**Recipe Type**: batch_prep (creates inventory item)  
**Yield**: Multiple patties for freezing

---

## Proposed Flow Structure

### Raw Ingredients
1. **Frozen broccoli** - 1 bag (raw, from Safeway frozen section)
2. **Eggs** - 6 (raw)
3. **Potatoes** - 2 (raw)
4. **Shredded cheese** - 1 bag (raw)
5. **Flour** - 4 tbsp (raw, pantry)

### Prep Steps (Processing Raw Ingredients)

1. **Large dice potatoes** (prep, batch)
2. **Boil potatoes** (prep, batch)

### Assembly Steps (Combining & Forming)

3. **Steam broccoli** (assembly, batch)
4. **Combine ingredients** (assembly, batch)
5. **Form patties** (assembly, batch)
6. **Par bake patties** (assembly, batch)
7. **Package for freezing** (assembly, batch)

### Intermediate Products (Transient)

- Diced potatoes (large dice)
- Boiled potatoes
- Steamed broccoli
- Combined mixture
- Formed patties (unbaked)
- Par-baked patties

### Final Product (Inventory)

- **Broccoli patties (frozen)** - inventory type
  - Container: Vacuum sealed bag
  - Tracked in inventory system
  - Ready to use in meals

**Note**: Steps 1-2 are PREP (processing raw ingredients). Steps 3-7 are ASSEMBLY (combining/forming).

---

## Mermaid Flow Diagram

```mermaid
graph TD
    %% Raw Ingredients
    P1[Frozen broccoli<br/>1 bag<br/>RAW]
    P2[Eggs<br/>6<br/>RAW]
    P3[Potatoes<br/>2<br/>RAW]
    P4[Shredded cheese<br/>1 bag<br/>RAW]
    P5[Flour<br/>4 tbsp<br/>RAW - PANTRY]
    
    %% Prep Steps (Processing Raw Ingredients)
    S01[STEP 1: Large dice potatoes<br/>PREP - BATCH]
    S02[STEP 2: Boil potatoes<br/>PREP - BATCH]
    
    %% Assembly Steps (Combining & Forming)
    S03[STEP 3: Steam broccoli<br/>ASSEMBLY - BATCH]
    S04[STEP 4: Combine ingredients<br/>ASSEMBLY - BATCH]
    S05[STEP 5: Form patties<br/>ASSEMBLY - BATCH]
    S06[STEP 6: Par bake<br/>ASSEMBLY - BATCH]
    S07[STEP 7: Package for freezing<br/>ASSEMBLY - BATCH]
    
    %% Intermediate Products (Transient)
    T01[Potatoes large dice<br/>TRANSIENT]
    T02[Boiled potatoes<br/>TRANSIENT]
    T03[Steamed broccoli<br/>TRANSIENT]
    T04[Combined mixture<br/>TRANSIENT]
    T05[Formed patties unbaked<br/>TRANSIENT]
    T06[Par-baked patties<br/>TRANSIENT]
    
    %% Final Product (Inventory)
    INV1[Broccoli patties frozen<br/>INVENTORY<br/>Container: Vacuum sealed bag]
    
    %% Prep Edges (Potatoes)
    P3 --> S01
    S01 --> T01
    T01 --> S02
    S02 --> T02
    
    %% Assembly Edges - Steam broccoli
    P1 --> S03
    S03 --> T03
    
    %% Assembly Edges - Combine
    T03 --> S04
    T02 --> S04
    P2 --> S04
    P4 --> S04
    P5 --> S04
    S04 --> T04
    
    %% Assembly Edges - Form patties
    T04 --> S05
    S05 --> T05
    
    %% Assembly Edges - Par bake
    T05 --> S06
    S06 --> T06
    
    %% Assembly Edges - Package
    T06 --> S07
    S07 --> INV1
    
    style P5 fill:#ffe6cc
    style INV1 fill:#e7f3ff
    style T01 fill:#fff3cd
    style T02 fill:#fff3cd
    style T03 fill:#fff3cd
    style T04 fill:#fff3cd
    style T05 fill:#fff3cd
    style T06 fill:#fff3cd
```

## Legend
- **Orange** = Pantry items (not tracked)
- **White** = Raw ingredients
- **Blue** = Inventory items (final product - tracked)
- **Yellow** = Transient intermediate products

## Summary

**Total Products**:
- 5 raw ingredients (1 pantry, 4 regular)
- 6 transient intermediates
- 1 inventory final product
- **Total: 12 product nodes**

**Total Steps**: 7 steps (2 PREP + 5 ASSEMBLY)
**Total Edges**: 18 edges (13 product→step + 5 step→product... wait, let me recount)

Actually: 14 edges total (11 product→step inputs + 7 step→product outputs = 18 edges)

**Container Type**: Vacuum sealed bag (need to verify this container type exists)

**Ready for product matching?** Confirm this flow is correct!
