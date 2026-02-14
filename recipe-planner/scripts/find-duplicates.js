import PocketBase from "pocketbase";

const pb = new PocketBase("http://192.168.50.95:8090");

async function findDuplicates() {
  const products = await pb.collection("products").getFullList({ sort: "name" });

  console.log("=".repeat(80));
  console.log("SEARCHING FOR POTENTIAL DUPLICATES");
  console.log("=".repeat(80));

  // 1. Exact duplicates (same name)
  console.log("\n--- EXACT DUPLICATES (same name, case-insensitive) ---");
  const nameCount = new Map();
  products.forEach((p) => {
    const name = p.name.toLowerCase();
    if (!nameCount.has(name)) nameCount.set(name, []);
    nameCount.get(name).push(p);
  });
  let exactDupes = 0;
  nameCount.forEach((items, name) => {
    if (items.length > 1) {
      exactDupes++;
      console.log("\n\"" + name + "\" appears " + items.length + " times:");
      items.forEach((p) =>
        console.log("  - " + p.name + " [" + p.type + "] (ID: " + p.id + ")")
      );
    }
  });
  if (exactDupes === 0) console.log("  None found");

  // 2. Check common ingredient categories
  const categories = [
    "olive",
    "parsley",
    "garlic",
    "onion",
    "cheese",
    "chicken",
    "beef",
    "broccoli",
    "potato",
    "tomato",
    "pasta",
    "spaghet",
    "flour",
    "egg",
    "salt",
    "pepper",
    "oil",
    "butter",
    "rice",
    "bean",
    "carrot",
    "celery",
    "lettuce",
    "cucumber",
    "lemon",
    "lime",
  ];

  console.log("\n--- PRODUCTS BY CATEGORY ---");
  categories.forEach((cat) => {
    const matches = products.filter((p) =>
      p.name.toLowerCase().includes(cat)
    );
    if (matches.length > 0) {
      console.log("\n" + cat.toUpperCase() + " (" + matches.length + "):");
      matches.forEach((p) =>
        console.log("  - " + p.name + " [" + p.type + "] (ID: " + p.id + ")")
      );
    }
  });

  // 3. Find same-type products with very similar names
  console.log("\n\n--- POTENTIAL DUPLICATES (same type, similar name) ---");
  const checked = new Set();
  let potentialDupes = 0;

  products.forEach((p1) => {
    products.forEach((p2) => {
      if (p1.id >= p2.id) return;
      if (p1.type !== p2.type) return;

      const key = p1.id + ":" + p2.id;
      if (checked.has(key)) return;
      checked.add(key);

      const n1 = p1.name.toLowerCase().trim();
      const n2 = p2.name.toLowerCase().trim();

      // Check for very similar names
      const words1 = n1.split(/\s+/);
      const words2 = n2.split(/\s+/);

      // If first word matches and same type, flag it
      if (words1[0] === words2[0] && words1[0].length > 3) {
        potentialDupes++;
        console.log(
          "\n  [" + p1.type + "] Similar first word \"" + words1[0] + "\":"
        );
        console.log("    - " + p1.name + " (ID: " + p1.id + ")");
        console.log("    - " + p2.name + " (ID: " + p2.id + ")");
      }
    });
  });
  if (potentialDupes === 0) console.log("  None found");
}

findDuplicates();
