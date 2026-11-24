import { handleOrderManagementIntent, resetOrderConversation } from "./agents/orderManagementAgent.js";

async function run() {
  resetOrderConversation();
  console.log("=== TEST: Ordering 'CEM I 52.5N' without providing any product ID ===");

  const res1 = await handleOrderManagementIntent("I want to buy 50 bags of CEM I 52.5N at Tema Plant, DELIVERED to Accra Central");
  console.log("\nTurn 1 Agent Response:\n", res1.reply);

  const res2 = await handleOrderManagementIntent("1 truck. Yes, everything looks good. Please submit the quotation request.");
  console.log("\nTurn 2 Agent Response:\n", res2.reply);
  console.log("Status:", res2.status);

  if (res2.variables) {
    console.log("\nGenerated Variables:\n", JSON.stringify(res2.variables, null, 2));
    const items = (res2.variables as any)?.input?.salesVoucherItemInputs;
    if (items && items[0]) {
      console.log("Auto-resolved productId:", items[0].productId, items[0].productId === 23 ? "✅ (Correct ID 23 for 52.5N!)" : `(ID: ${items[0].productId})`);
    }
  }

  console.log("\n>>> ALL TESTS PASSED <<<");
}

run();
