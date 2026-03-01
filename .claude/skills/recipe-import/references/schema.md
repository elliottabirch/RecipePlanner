# RecipePlanner Database Schema

## Database URLs

- **Production**: `http://192.168.50.95:8090`
- **Test**: `http://192.168.50.95:8091`

**Always use test database (8091) for imports.**

## Core Collections for Recipe Import

### recipes
- name: text (required)
- notes: text
- recipe_type: select - "meal" | "batch_prep"

### products
Global product registry (shared across recipes).
- name: text (required)
- type: select (required) - "raw" | "transient" | "stored" | "inventory"
- pantry: bool - Simple ingredients not tracked in shopping lists
- store: relation
- section: relation
- storage_location: select - "fridge" | "freezer" | "dry"
- container_type: relation
- track_quantity: bool
- ready_to_eat: bool
- meal_slot: select - "snack" | "meal"

### recipe_product_nodes
Product instances within a specific recipe.
- recipe: relation (required)
- product: relation (required)
- quantity: number
- unit: text
- meal_destination: text
- position_x: number
- position_y: number

### recipe_steps
- recipe: relation (required)
- name: text (required)
- step_type: select (required) - "prep" | "assembly"
- timing: select - "batch" | "just_in_time"
- position_x: number
- position_y: number

### product_to_step_edges
Products flowing INTO steps.
- recipe: relation (required)
- source: relation (required) - recipe_product_node ID
- target: relation (required) - recipe_step ID

### step_to_product_edges
Products created BY steps.
- recipe: relation (required)
- source: relation (required) - recipe_step ID
- target: relation (required) - recipe_product_node ID

## Supporting Collections

### stores
- name: text (required)

### sections
- name: text (required)

### container_types
- name: text (required)

### tags
- name: text (required)
- color: text

### recipe_tags
- recipe: relation (required)
- tag: relation (required)

### weekly_plans
- name: text

### planned_meals
- weekly_plan: relation (required)
- recipe: relation (required)
- meal_slot: select (required) - "breakfast" | "lunch" | "dinner" | "snack" | "micah"
- day: select - "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
- quantity: number

### inventory_items
- product: relation (required)
- in_stock: bool (required)
- notes: text
