# Creamy Tomato Soup - Flow Diagram

## Recipe Type: meal

## Yield: 4 to 6 servings (about 8½ cups)

## Flow Diagram

```mermaid
graph TD
    subgraph RAW_INGREDIENTS
        P1[butter<br/>RAW/PANTRY]
        P2[onion yellow<br/>RAW]
        P3[salt<br/>RAW/PANTRY]
        P4[pepper black<br/>RAW/PANTRY]
        P5[garlic cubes frozen<br/>INVENTORY]
        P6[crushed red pepper<br/>RAW/PANTRY]
        P7[paprika smoked<br/>RAW/PANTRY]
        P8[flour all-purpose<br/>RAW/PANTRY]
        P9[tomato whole peeled canned<br/>RAW]
        P10[stock vegetable<br/>INVENTORY]
        P11[thyme fresh<br/>RAW]
        P12[sugar<br/>RAW/PANTRY]
        P13[ancho chile<br/>RAW]
        P14[crema<br/>RAW]
        P15[chives<br/>RAW]
    end

    subgraph PREP_STEPS
        S1[Small dice yellow onion<br/>PREP/BATCH]
    end

    subgraph COOKING_STEPS
        S2[Pull out garlic cubes<br/>ASSEMBLY/BATCH]
        S3[Sauté onion, garlic, spices, and flour in butter<br/>ASSEMBLY/BATCH]
        S4[Simmer with tomatoes, stock, thyme, sugar, ancho chile<br/>ASSEMBLY/BATCH]
        S5[Remove thyme and ancho, blend until creamy<br/>ASSEMBLY/BATCH]
    end

    subgraph SERVE
        S6[Top with crema and chives<br/>ASSEMBLY/JUST_IN_TIME]
    end

    subgraph PRODUCTS
        T1[onion yellow small-dice<br/>TRANSIENT]
        T2[garlic cube pulled<br/>TRANSIENT]
        T3[onion roux base<br/>TRANSIENT]
        T4[tomato soup simmered<br/>TRANSIENT]
        T5[creamy tomato soup base<br/>STORED]
        T6[creamy tomato soup<br/>TRANSIENT]
    end

    %% Prep flows
    P2 --> S1
    S1 --> T1

    P5 --> S2
    S2 --> T2


    %% Sauté + roux
    P1 --> S3
    T1 --> S3
    T2 --> S3
    P3 --> S3
    P4 --> S3
    P6 --> S3
    P7 --> S3
    P8 --> S3
    S3 --> T3

    %% Simmer
    T3 --> S4
    P9 --> S4
    P10 --> S4
    P11 --> S4
    P12 --> S4
    P13 --> S4
    S4 --> T4

    %% Blend (produces stored base)
    T4 --> S5
    S5 --> T5

    %% Serve
    T5 --> S6
    P14 --> S6
    P15 --> S6
    S6 --> T6
```

## Notes

- **Stored product**: `creamy tomato soup base` — the finished blended soup is stored and reheated for serving.
- **Batch prep items**: Mincing onion, mincing garlic, sauté/roux, simmer, and blend are all done ahead — the soup keeps well.
- **Just-in-time**: Topping with crema and chives at serving time.
- **Pantry items**: butter, salt, pepper, crushed red pepper, smoked paprika, flour, sugar (not tracked in shopping lists).
- **Inventory items**: vegetable stock and frozen garlic cubes (the recipe's "garlic" comes from pre-made cubes, pulled out via an assembly step into `garlic cube (pulled)` transient).
- **Optional ingredient skipped**: grilled cheese is a separate dish served alongside, not modeled as part of this recipe.
- The ancho chile is added whole, then removed before blending. The recipe optionally allows blending in a portion of the deseeded chile for more smoky flavor — modeled as the simple "remove and blend" path here.
