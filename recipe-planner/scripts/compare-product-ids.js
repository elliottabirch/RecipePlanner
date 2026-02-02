import PocketBase from "pocketbase";

const pbProd = new PocketBase("http://192.168.50.95:8090");
const pbTest = new PocketBase("http://192.168.50.95:8091");

async function compareProductIds() {
  console.log("\n" + "=".repeat(80));
  console.log("COMPARING PRODUCT IDs: Production vs Test");
  console.log("=".repeat(80) + "\n");

  try {
    // Get products from both databases
    const prodProducts = await pbProd.collection("products").getFullList({
      sort: "name",
    });
    const testProducts = await pbTest.collection("products").getFullList({
      sort: "name",
    });

    console.log(`Production DB: ${prodProducts.length} products`);
    console.log(`Test DB: ${testProducts.length} products\n`);

    // Create lookup maps
    const prodMap = new Map(prodProducts.map((p) => [p.name.toLowerCase(), p]));
    const testMap = new Map(testProducts.map((p) => [p.name.toLowerCase(), p]));

    const results = {
      matching: [],
      mismatch: [],
      prodOnly: [],
      testOnly: [],
    };

    // Check products that exist in both
    for (const [name, prodProduct] of prodMap.entries()) {
      const testProduct = testMap.get(name);

      if (testProduct) {
        if (
          prodProduct.id === testProduct.id &&
          prodProduct.type === testProduct.type
        ) {
          results.matching.push({
            name: prodProduct.name,
            id: prodProduct.id,
            type: prodProduct.type,
          });
        } else {
          results.mismatch.push({
            name: prodProduct.name,
            prodId: prodProduct.id,
            testId: testProduct.id,
            prodType: prodProduct.type,
            testType: testProduct.type,
          });
        }
      } else {
        results.prodOnly.push({
          name: prodProduct.name,
          id: prodProduct.id,
          type: prodProduct.type,
        });
      }
    }

    // Check for products only in test
    for (const [name, testProduct] of testMap.entries()) {
      if (!prodMap.has(name)) {
        results.testOnly.push({
          name: testProduct.name,
          id: testProduct.id,
          type: testProduct.type,
        });
      }
    }

    // Display results
    console.log("=".repeat(80));
    console.log("✅ MATCHING PRODUCTS (same ID in both databases):");
    console.log("=".repeat(80));
    console.log(`Count: ${results.matching.length}\n`);
    if (results.matching.length > 0 && results.matching.length <= 20) {
      results.matching.forEach((p) => {
        console.log(`  ✓ ${p.name} [${p.type}] - ${p.id}`);
      });
    } else if (results.matching.length > 20) {
      console.log(`  (Showing first 10...)`);
      results.matching.slice(0, 10).forEach((p) => {
        console.log(`  ✓ ${p.name} [${p.type}] - ${p.id}`);
      });
      console.log(`  ... and ${results.matching.length - 10} more`);
    }

    if (results.mismatch.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("⚠️  MISMATCHED PRODUCTS (different IDs or types):");
      console.log("=".repeat(80));
      results.mismatch.forEach((p) => {
        console.log(`  ⚠️  ${p.name}`);
        console.log(`     Prod: ${p.prodId} [${p.prodType}]`);
        console.log(`     Test: ${p.testId} [${p.testType}]`);
      });
    }

    if (results.prodOnly.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("📦 PRODUCTS ONLY IN PRODUCTION:");
      console.log("=".repeat(80));
      results.prodOnly.forEach((p) => {
        console.log(`  - ${p.name} [${p.type}] - ${p.id}`);
      });
    }

    if (results.testOnly.length > 0) {
      console.log("\n" + "=".repeat(80));
      console.log("🧪 PRODUCTS ONLY IN TEST:");
      console.log("=".repeat(80));
      results.testOnly.forEach((p) => {
        console.log(`  - ${p.name} [${p.type}] - ${p.id}`);
      });
    }

    console.log("\n" + "=".repeat(80));
    console.log("SUMMARY");
    console.log("=".repeat(80));
    console.log(`✅ Matching (same ID): ${results.matching.length}`);
    console.log(`⚠️  Mismatched IDs: ${results.mismatch.length}`);
    console.log(`📦 Production only: ${results.prodOnly.length}`);
    console.log(`🧪 Test only: ${results.testOnly.length}`);

    if (results.mismatch.length === 0 && results.prodOnly.length === 0) {
      console.log("\n✅ Test database is in perfect sync with production!");
      console.log(
        "   All product IDs match - safe to use production IDs in import scripts.\n",
      );
    } else if (results.mismatch.length > 0) {
      console.log("\n⚠️  WARNING: ID mismatches found!");
      console.log(
        "   Import scripts using production IDs may fail on test database.\n",
      );
    } else {
      console.log("\n✅ All shared products have matching IDs.");
      console.log(
        `   Test database has ${results.testOnly.length} additional products from imports.\n`,
      );
    }
  } catch (error) {
    console.error("\n❌ Error:", error);
  }
}

compareProductIds();
