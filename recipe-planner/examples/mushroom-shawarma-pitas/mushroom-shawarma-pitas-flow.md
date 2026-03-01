# Vegetarian Mushroom Shawarma Pitas - Flow Diagram

## Recipe Type: meal

## Yield: 1 quart container (stored mushroom mixture) + serves 4

## Flow Diagram

```mermaid
graph TD
    subgraph RAW_INGREDIENTS
        P1[portobello mushroom<br/>RAW]
        P2[onion red<br/>RAW]
        P3[olive oil<br/>RAW/PANTRY]
        P4[cumin<br/>RAW/PANTRY]
        P5[coriander<br/>RAW/PANTRY]
        P6[paprika<br/>RAW/PANTRY]
        P7[salt<br/>RAW/PANTRY]
        P8[pepper black<br/>RAW/PANTRY]
        P9[cabbage red<br/>RAW]
        P10[yogurt greek<br/>RAW]
        P11[turmeric<br/>RAW/PANTRY]
        P12[pita<br/>RAW]
        P13[cilantro<br/>RAW]
    end

    subgraph PREP_STEPS
        S1[Slice mushrooms<br/>PREP/BATCH]
        S2[Large dice onion<br/>PREP/BATCH]
        S3[Slice cabbage<br/>PREP/BATCH]
    end

    subgraph COOKING_STEPS
        S4[Roast mushrooms and onion with spices<br/>ASSEMBLY/BATCH]
        S6[Mix turmeric yogurt<br/>PREP/BATCH]
    end

    subgraph ASSEMBLY
        S5[Dress cabbage with oil<br/>PREP/JUST_IN_TIME]
        S7[Warm pitas<br/>ASSEMBLY/JUST_IN_TIME]
        S8[Assemble pitas<br/>ASSEMBLY/JUST_IN_TIME]
    end

    subgraph PRODUCTS
        T1[mushroom sliced<br/>TRANSIENT]
        T2[onion red large diced<br/>TRANSIENT]
        T3[cabbage red sliced<br/>TRANSIENT]
        T4[mushroom mixture roasted<br/>STORED]
        T5[cabbage dressed<br/>TRANSIENT]
        T6[turmeric yogurt<br/>TRANSIENT]
        T7[pita warmed<br/>TRANSIENT]
        T8[mushroom shawarma pita<br/>TRANSIENT]
    end

    %% Prep flows
    P1 --> S1
    S1 --> T1

    P2 --> S2
    S2 --> T2

    P9 --> S3
    S3 --> T3

    %% Roasting
    T1 --> S4
    T2 --> S4
    P3 --> S4
    P4 --> S4
    P5 --> S4
    P6 --> S4
    P7 --> S4
    P8 --> S4
    S4 --> T4

    %% Cabbage dressing (just-in-time)
    T3 --> S5
    P3 --> S5
    P7 --> S5
    P8 --> S5
    S5 --> T5

    %% Turmeric yogurt
    P10 --> S6
    P11 --> S6
    P7 --> S6
    P8 --> S6
    S6 --> T6

    %% Warming pitas
    P12 --> S7
    S7 --> T7

    %% Final assembly
    T7 --> S8
    T6 --> S8
    T5 --> S8
    T4 --> S8
    P13 --> S8
    S8 --> T8
```

## Notes

- **Stored product**: The roasted mushroom mixture (`mushroom mixture roasted`) is stored in a 1 quart container
- **Batch prep items**: Slicing mushrooms, dicing onion, slicing cabbage, roasting, and turmeric yogurt can be done ahead
- **Just-in-time**: Dressing cabbage, warming pitas, and final assembly happen at serving time
- `onion red large diced` is an existing transient product
- Pantry items (olive oil, spices, salt, pepper) won't be tracked in shopping lists
