import express from "express";
import router from "../src/routes/routerRoutes.js";
import { prisma } from "../src/db/prisma.js";

async function runTestSuite() {
  console.log("=================================================================");
  console.log("🛡️ TESTING STRICT USER CHAT VS ADMIN CHAT ACCESS CONTROL");
  console.log("=================================================================\n");

  const app = express();
  app.use(express.json());
  app.use("/api", router);

  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://localhost:${address.port}/api`;

  let passedTests = 0;
  let totalTests = 0;

  async function postJson(endpoint: string, body: any): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    return { status: res.status, body: json };
  }

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? `: ${detail}` : ""}`);
    }
  }

  const customerUserContext = {
    userId: "usr-001",
    customerId: 107,
    canCreateOrder: true
  };

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: USER CHAT (PERMITTED CUSTOMER ENQUIRIES & ACTIONS)
    // ------------------------------------------------------------------------
    console.log("--- SECTION 1: Permitted User Chat Commands ---");

    // Test 1: User enquires about their own balance
    const resBalance = await postJson("/chat", {
      message: "what is my account balance and credit limit?",
      userContext: customerUserContext
    });
    assert(
      resBalance.status === 200 &&
      resBalance.body.uiHint === "DATA_POINTS" &&
      resBalance.body.chat.includes("Account & Credit Overview") &&
      resBalance.body.data?.customer?.name.includes("Kwame Mensah"),
      "User Chat: Enquiry about own account balance returns scoped KPI data"
    );

    // Test 2: User enquires about their own orders
    const resOrders = await postJson("/chat", {
      message: "show my recent orders",
      userContext: customerUserContext
    });
    assert(
      resOrders.status === 200 &&
      resOrders.body.uiHint === "DATA_TABLE" &&
      resOrders.body.chat.includes("Recent Cement Orders") &&
      Array.isArray(resOrders.body.data?.items),
      "User Chat: Enquiry about own orders returns scoped order table"
    );

    // Test 3: User enquires about their own payments
    const resPayments = await postJson("/chat", {
      message: "show my payment history",
      userContext: customerUserContext
    });
    assert(
      resPayments.status === 200 &&
      (resPayments.body.uiHint === "DATA_TABLE" || resPayments.body.chat.includes("Payments")),
      "User Chat: Enquiry about own payments returns scoped payment history"
    );

    // Test 4: User enquires about product catalog & pricing
    const resCatalog = await postJson("/chat", {
      message: "what cement products and prices do you have?",
      userContext: customerUserContext
    });
    assert(
      resCatalog.status === 200 &&
      resCatalog.body.uiHint === "PRODUCT_SELECTOR" &&
      resCatalog.body.data?.items?.length > 0,
      "User Chat: Enquiry about cement catalog returns product selector"
    );

    // Test 5: User places a cement order
    const resOrderPlacement = await postJson("/chat", {
      message: "I want to buy 50 bags of 52.5N from Tema plant",
      userContext: customerUserContext
    });
    assert(
      resOrderPlacement.status === 200 &&
      (resOrderPlacement.body.uiHint === "CONFIRMATION" ||
       resOrderPlacement.body.uiHint === "ORDER_SUMMARY" ||
       resOrderPlacement.body.uiHint === "PRODUCT_SELECTOR") &&
      resOrderPlacement.body.responseType === "ORDER_MANAGEMENT",
      "User Chat: Cement ordering flow permitted for customer"
    );

    // ------------------------------------------------------------------------
    // SECTION 2: USER CHAT (STRICTLY BLOCKED ADMIN & COMPLEX TASKS)
    // ------------------------------------------------------------------------
    console.log("\n--- SECTION 2: Blocked Admin & Complex Tasks in User Chat ---");

    // Test 6: User attempts to approve an order in User Chat
    const resBlockApprove = await postJson("/chat", {
      message: "approve sales order #1052",
      userContext: customerUserContext
    });
    assert(
      resBlockApprove.status === 200 &&
      resBlockApprove.body.chat.includes("Administrative commands") &&
      resBlockApprove.body.chat.includes("restricted to the Admin Portal"),
      "User Chat: Blocked order approval command with security notice"
    );

    // Test 7: User attempts to audit pending orders in User Chat
    const resBlockAudit = await postJson("/chat", {
      message: "audit all pending orders and verify proof of payment",
      userContext: customerUserContext
    });
    assert(
      resBlockAudit.status === 200 &&
      resBlockAudit.body.chat.includes("restricted to the Admin Portal"),
      "User Chat: Blocked PoP audit command with security notice"
    );

    // Test 8: User attempts to query system-wide analytics in User Chat
    const resBlockAnalytics = await postJson("/chat", {
      message: "what is the rejection rate and most common rejection causes?",
      userContext: customerUserContext
    });
    assert(
      resBlockAnalytics.status === 200 &&
      resBlockAnalytics.body.chat.includes("restricted to the Admin Portal"),
      "User Chat: Blocked platform rejection rate analytics"
    );

    // Test 9: User attempts to list all users in User Chat
    const resBlockUsers = await postJson("/chat", {
      message: "list all users in the system",
      userContext: customerUserContext
    });
    assert(
      resBlockUsers.status === 200 &&
      resBlockUsers.body.chat.includes("restricted to the Admin Portal"),
      "User Chat: Blocked system users browsing"
    );

    // Test 10: User attempts to view another customer's data in User Chat
    const resBlockCrossCustomer = await postJson("/chat", {
      message: "show orders for customer 2",
      userContext: customerUserContext
    });
    assert(
      resBlockCrossCustomer.status === 200 &&
      resBlockCrossCustomer.body.chat.includes("restricted to the Admin Portal"),
      "User Chat: Blocked cross-customer orders access"
    );

    // ------------------------------------------------------------------------
    // SECTION 3: ADMIN CHAT (FULL ACCESS TO COMPLEX TASKS)
    // ------------------------------------------------------------------------
    console.log("\n--- SECTION 3: Admin Chat (Exclusively Runs Complex Tasks) ---");

    // Test 11: Admin Chat runs PoP Audit
    const resAdminAudit = await postJson("/chat/admin", {
      message: "audit pending sales orders and check receipts"
    });
    assert(
      resAdminAudit.status === 200 &&
      resAdminAudit.body.chat.includes("Sales Order Approval & PoP Audit Report") &&
      resAdminAudit.body.data?.items?.length !== undefined,
      "Admin Chat: Successfully executed Order Approval PoP Audit"
    );

    // Test 12: Admin Chat queries platform analytics
    const resAdminAnalytics = await postJson("/chat/admin", {
      message: "what is the rejection rate and leading causes of rejection?"
    });
    assert(
      resAdminAnalytics.status === 200 &&
      resAdminAnalytics.body.responseType === "ANALYTICS" &&
      resAdminAnalytics.body.chat.length > 0,
      "Admin Chat: Successfully executed platform rejection analytics"
    );

    // ------------------------------------------------------------------------
    // SECTION 4: UN-PREFIXED PUBLIC ENDPOINTS RESTRICTION
    // ------------------------------------------------------------------------
    console.log("\n--- SECTION 4: Legacy Public Endpoint Guards ---");

    // Test 13: Direct POST /api/analytics is 403 Forbidden
    const resPublicAnalytics = await postJson("/analytics", {
      message: "show system analytics"
    });
    assert(
      resPublicAnalytics.status === 403 &&
      resPublicAnalytics.body.error.includes("restricted exclusively to the Admin Portal"),
      "Direct /api/analytics returns 403 Forbidden"
    );

    // Test 14: Direct POST /api/orders/audit-approvals is 403 Forbidden
    const resPublicAudit = await postJson("/orders/audit-approvals", {});
    assert(
      resPublicAudit.status === 403 &&
      resPublicAudit.body.error.includes("restricted exclusively to the Admin Portal"),
      "Direct /api/orders/audit-approvals returns 403 Forbidden"
    );

    // Test 15: Direct POST /api/payments/transcribe is 403 Forbidden
    const resPublicTranscribe = await postJson("/payments/transcribe", {});
    assert(
      resPublicTranscribe.status === 403 &&
      resPublicTranscribe.body.error.includes("restricted exclusively to the Admin Portal"),
      "Direct /api/payments/transcribe returns 403 Forbidden"
    );

    console.log("\n=================================================================");
    console.log(`🎯 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${((passedTests / totalTests) * 100).toFixed(0)}%)`);
    console.log("=================================================================\n");

  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
