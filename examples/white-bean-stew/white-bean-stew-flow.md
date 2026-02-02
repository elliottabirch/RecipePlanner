# White Bean and Tomato Stew - Recipe Flow (Detailed with Prep Steps)

## Mermaid Graph

```mermaid
graph TD
    %% Raw/Inventory Ingredients
    P1[Parsley bunch<br/>RAW]
    P2[Lemon<br/>RAW]
    P3[Cherry tomatoes<br/>20 oz<br/>RAW]
    P4[Olive oil<br/>RAW - PANTRY]
    P5[Thyme<br/>RAW]
    P6[Yellow onion<br/>RAW]
    P7[Frozen garlic cubes<br/>INVENTORY]
    P8[Red pepper flakes<br/>RAW - PANTRY]
    P9[White beans canned<br/>RAW - PANTRY]
    P10[Broth<br/>INVENTORY]
    P11[Salt<br/>RAW - PANTRY]
    P12[Pepper<br/>RAW - PANTRY]
    
    %% Prep Steps for Ingredients
    S01[STEP: Chop parsley<br/>PREP - BATCH]
    S02[STEP: Zest lemon<br/>PREP - BATCH]
    S03[STEP: Small dice onion<br/>PREP - BATCH]
    S04[STEP: Pull frozen garlic cube<br/>PREP - BATCH]
    S06[STEP: Rinse beans<br/>PREP - BATCH]
    
    %% Prepped Ingredients (Transient)
    T01[Chopped parsley<br/>0.5 cup<br/>TRANSIENT]
    T02[Lemon zest<br/>2 tsp<br/>TRANSIENT]
    T03[Small diced onion<br/>1 medium<br/>TRANSIENT]
    T04[Garlic cube<br/>1 cube<br/>TRANSIENT]
    T06[Rinsed white beans<br/>30 oz<br/>TRANSIENT]
    
    %% Main Recipe Steps
    S1[STEP: Make lemon-parsley<br/>PREP - BATCH]
    S2[STEP: Roast tomatoes<br/>PREP - BATCH]
    S3[STEP: Sauté aromatics<br/>PREP - BATCH]
    S4[STEP: Simmer beans<br/>PREP - BATCH]
    S5[STEP: Combine stew base<br/>ASSEMBLY - BATCH]
    S6[STEP: Serve with topping<br/>ASSEMBLY - JIT]
    
    %% Intermediate Products
    T10[Roasted tomatoes<br/>TRANSIENT]
    T11[Sautéed aromatics<br/>TRANSIENT]
    T12[Bean mixture<br/>TRANSIENT]
    
    %% Stored Products
    ST1[Lemon-parsley mixture<br/>STORED]
    ST2[White Bean Tomato Stew Base<br/>STORED]
    
    %% Final Product
    F1[White Bean Stew<br/>with Lemon-Parsley<br/>TRANSIENT]
    
    %% Prep Edges
    P1 --> S01 --> T01
    P2 --> S02 --> T02
    P6 --> S03 --> T03
    P7 --> S04 --> T04
    P9 --> S06 --> T06
    
    %% Main Recipe Edges - Step 1 (Make lemon-parsley)
    T01 --> S1
    T02 --> S1
    S1 --> ST1
    
    %% Edges - Step 2 (Roast tomatoes)
    P3 --> S2
    P4 --> S2
    P5 --> S2
    P11 --> S2
    P12 --> S2
    S2 --> T10
    
    %% Edges - Step 3 (Sauté aromatics)
    P4 --> S3
    T03 --> S3
    T04 --> S3
    P8 --> S3
    S3 --> T11
    
    %% Edges - Step 4 (Simmer beans)
    T11 --> S4
    T06 --> S4
    P10 --> S4
    P11 --> S4
    P12 --> S4
    S4 --> T12
    
    %% Edges - Step 5 (Combine stew base - BATCH)
    T12 --> S5
    T10 --> S5
    P11 --> S5
    S5 --> ST2
    
    %% Edges - Step 6 (Serve with topping - JIT)
    ST2 --> S6
    ST1 --> S6
    S6 --> F1
    
    %% Styling
    style P4 fill:#ffe6cc
    style P8 fill:#ffe6cc
    style P9 fill:#ffe6cc
    style P11 fill:#ffe6cc
    style P12 fill:#ffe6cc
    style P7 fill:#e7f3ff
    style P10 fill:#e7f3ff
    style ST1 fill:#d4edda
    style ST2 fill:#d4edda
    style T01 fill:#fff3cd
    style T02 fill:#fff3cd
    style T03 fill:#fff3cd
    style T04 fill:#fff3cd
    style T06 fill:#fff3cd
    style T10 fill:#fff3cd
    style T11 fill:#fff3cd
    style T12 fill:#fff3cd
    style F1 fill:#fff3cd
    style S6 fill:#ffc9c9
```

## Legend
- **Orange** = Pantry items (RAW - simple ingredients not tracked)
- **White** = Fresh raw ingredients
- **Blue** = Inventory items (compound components tracked in inventory)
- **Yellow** = Transient products (prep intermediates, cooking intermediates, or final served dish)
- **Green** = Stored products (made ahead and stored)
- **Pink/Red** = Just-in-time steps (performed at serving time)

## Flow Explanation

**PREP STEPS (Ingredient Processing):**
- Parsley bunch → Chop parsley → Chopped parsley (0.5 cup)
- Lemon → Zest lemon → Lemon zest (2 tsp)
- Yellow onion → Small dice onion → Diced onion (1 medium)
- Frozen garlic cubes (INVENTORY) → Pull frozen garlic cube → Garlic cube (1 cube)
- Canned beans → Rinse beans → Rinsed beans (30 oz)

**BATCH PREP (Main Steps 1-5):**
1. Make lemon-parsley mixture → Store it
2. Roast tomatoes with oil, thyme, S&P → Transient
3. Sauté diced onion, garlic cube, red pepper flakes in oil → Transient
4. Simmer sautéed aromatics with rinsed beans and broth → Transient
5. Combine bean mixture with roasted tomatoes → Store it

**JUST-IN-TIME (Step 6):**
6. Take stored stew base + stored lemon-parsley → Serve

## Summary

**Total Products**: 
- 12 base ingredients (5 pantry, 2 inventory, 5 fresh raw)
- 5 prepped transient ingredients
- 3 cooking transient intermediates
- 2 stored products
- 1 final served transient
- **Total: 23 product nodes**

**Total Steps**: 11 steps (5 prep + 5 batch main + 1 JIT assembly)
**Total Edges**: 38 edges (28 product→step + 10 step→product)

## Ready for Import?
This flow now correctly represents frozen garlic cubes from inventory. Confirm this is correct, and I'll create the import script!
