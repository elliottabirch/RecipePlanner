import PocketBase from "pocketbase";

// Connect to PocketBase
const pb = new PocketBase("http://192.168.50.95:8090");

async function findProductMatches() {
  try {
    const allProducts = await pb.collection("products").getFullList({
      sort: "name",
    });

    console.log(`\nTotal products in database: ${allProducts.length}\n`);
    console.log("=".repeat(80));
    console.log("SMART PRODUCT MATCHING");
    console.log("=".repeat(80));

    // Search patterns
    const searches = {
      tomatoes: allProducts.filter((p) =>
        p.name.toLowerCase().includes("tomato"),
      ),
      onions: allProducts.filter((p) => p.name.toLowerCase().includes("onion")),
      garlic: allProducts.filter((p) =>
        p.name.toLowerCase().includes("garlic"),
      ),
      stock: allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("stock") ||
          p.name.toLowerCase().includes("broth"),
      ),
      thyme: allProducts.filter((p) => p.name.toLowerCase().includes("thyme")),
      beans: allProducts.filter((p) => p.name.toLowerCase().includes("bean")),
      pepperFlakes: allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("pepper") &&
          p.name.toLowerCase().includes("flake"),
      ),
      // Transient patterns
      choppedParsley: allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("parsley") &&
          p.name.toLowerCase().includes("chop"),
      ),
      lemonZest: allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("lemon") &&
          p.name.toLowerCase().includes("zest"),
      ),
      dicedOnion: allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("onion") &&
          p.name.toLowerCase().includes("dice"),
      ),
      garlicCube: allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("garlic") &&
          (p.name.toLowerCase().includes("cube") ||
            p.name.toLowerCase().includes("pulled")),
      ),
      rinsedBeans: allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes("bean") &&
          p.name.toLowerCase().includes("rinse"),
      ),
    };

    for (const [key, matches] of Object.entries(searches)) {
      console.log(`\n${key}:`);
      if (matches.length > 0) {
        matches.forEach((p) => {
          console.log(`  - ${p.name} [${p.type}] (ID: ${p.id})`);
        });
      } else {
        console.log(`  No matches found`);
      }
    }

    console.log("\n");
    console.log("=".repeat(80));
  } catch (error) {
    console.error("Error:", error);
  }
}

findProductMatches();
