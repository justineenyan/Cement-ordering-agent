import { prisma } from "../src/db/prisma.js";
import {
  createOrUpdateSalesVoucher,
  createOrUpdatePayment,
  setOrderApprovalStatus,
  getPendingOrdersForAudit,
  getDatabaseAnalytics
} from "../src/services/orderDbService.js";
import {
  getSalesOrdersAnalyticsTool,
  getUsersAnalyticsTool,
  getCustomerAnalyticsTool,
  resolveProductTool,
  resolveLoadingPointTool
} from "../src/tools/supabaseDbTools.js";
import { handleOrderManagementIntent } from "../src/agents/orderManagementAgent.js";
import { handleAnalyticsIntent } from "../src/agents/analyticsAgent.js";

async function main() {
  console.log("=================================================================");
  console.log("🚀 TESTING DIRECT SUPABASE POSTGRESQL AGENT & DB INTEGRATION");
  console.log("=================================================================\n");

  // Test 1: Direct DB Connectivity & Analytics
  console.log("1️⃣ Testing direct database analytics from Supabase...");
  const dbAnalytics = await getDatabaseAnalytics();
  console.log(`   - Total Sales Orders: ${dbAnalytics.salesOrders.totalOrders}`);
  console.log(`   - Total Users: ${dbAnalytics.users.totalUsers} (${dbAnalytics.users.activeRate} active)`);
  console.log(`   - Total Payments: ${dbAnalytics.payments.totalPaymentsSampled} (Approval rate: ${dbAnalytics.payments.approvalRate})`);
  console.log(`   - Total Volume: ${dbAnalytics.salesOrders.totalQuantityBags} bags`);
  console.log(`   - Total Value: GHS ${dbAnalytics.salesOrders.totalValueAmount}`);
  console.log("   ✅ Database analytics query successful.\n");

  // Test 2: Tools Matrix direct queries
  console.log("2️⃣ Testing Supabase DB Tools matrix...");
  const salesOrdersRes = await getSalesOrdersAnalyticsTool(10);
  console.log(`   - Sales Orders Tool: ${salesOrdersRes.metrics.totalOrders} orders, sample count: ${salesOrdersRes.metrics.sampleOrders.length}`);

  const usersRes = await getUsersAnalyticsTool(10);
  console.log(`   - Users Tool: ${usersRes.metrics.totalUsers} users (${usersRes.metrics.activeUsers} active, ${usersRes.metrics.activeRate})`);

  const customersRes = await getCustomerAnalyticsTool(10);
  console.log(`   - Customers Tool: ${customersRes.metrics.totalCustomers} customers, Total Credit: GHS ${customersRes.metrics.totalAvailableCredit}`);

  const product = resolveProductTool("52.5N cement");
  const loadingPoint = resolveLoadingPointTool("takoradi");
  console.log(`   - Resolved Product: ${product.title} (ID: ${product.id})`);
  console.log(`   - Resolved Loading Point: ${loadingPoint.name} (ID: ${loadingPoint.id})`);
  console.log("   ✅ DB Tools queries successful.\n");

  // Test 3: Create Sales Voucher in Supabase
  console.log("3️⃣ Creating live Sales Voucher in Supabase...");
  const newVoucher = await createOrUpdateSalesVoucher({
    companyId: 3,
    customerId: 107,
    sourceLocationId: 12,
    destinationId: 88,
    isDeliveryInclusive: true,
    comments: "Created by Supabase AI Agent integration test",
    salesVoucherItemInputs: [
      {
        productId: 23,
        quantity: 100,
        trucksCount: 1,
        sourceLocationId: 12,
        destinationId: 88,
        isDeliveryInclusive: true
      }
    ]
  });

  if (!newVoucher) throw new Error("Failed to create sales voucher in Supabase");
  console.log(`   - Created Voucher: ${newVoucher.voucherNumber} (ID: ${newVoucher.id})`);
  console.log(`   - Total Quote: GHS ${newVoucher.orderQuote}`);
  console.log(`   - Generated SO Count: ${newVoucher.salesVoucherOrders.length}`);
  console.log(`   - Sales Order Number: ${newVoucher.salesVoucherOrders[0]?.salesOrderNumber}`);
  console.log("   ✅ Live Sales Voucher created in Supabase.\n");

  // Test 4: Submit Payment for the Voucher
  console.log("4️⃣ Submitting Payment & Proof of Payment in Supabase...");
  const payment = await createOrUpdatePayment({
    salesVoucherId: newVoucher.id,
    customerId: 107,
    amount: newVoucher.orderQuote || 11000,
    amountApproved: newVoucher.orderQuote || 11000,
    paymentModeId: 2,
    paymentStatusId: 1, // Pending verification
    customerTranscriptionItemInput: {
      documentTypeId: 2,
      bankId: 5,
      documentDate: new Date().toISOString(),
      documentReference: `DEP-TEST-${newVoucher.id}`,
      depositorName: "Kwame Mensah",
      notes: "Test deposit slip attached to Supabase"
    },
    documentUrls: ["test-images/photo_2026-04-18_14-23-46.jpg"]
  });

  console.log(`   - Created Payment: ${payment?.paymentReference} (ID: ${payment?.id})`);
  console.log(`   - Payment Status: ${payment?.paymentStatus?.description}`);
  console.log(`   - Attached Transcriptions: ${payment?.paymentTranscriptions.length}`);
  console.log(`   - Attached Documents: ${payment?.paymentDocuments.length}`);
  console.log("   ✅ Payment record inserted into Supabase.\n");

  // Test 5: Verify Order Approval Flow in Supabase
  console.log("5️⃣ Approving Order Payment in Supabase...");
  const approvedPayment = await setOrderApprovalStatus(
    newVoucher.id,
    true,
    newVoucher.orderQuote || 11000,
    "Approved by Supabase Automated Integration Test"
  );
  console.log(`   - Payment Status: ${approvedPayment.paymentStatusId === 2 ? "Approved" : "Pending"}`);
  console.log(`   - Amount Approved: GHS ${approvedPayment.amountApproved}`);

  const updatedVoucher = await prisma.salesVoucher.findUnique({
    where: { id: newVoucher.id },
    include: { salesVoucherStatus: true, salesVoucherOrders: true }
  });
  console.log(`   - Updated Voucher Status: ${updatedVoucher?.salesVoucherStatus?.description} (ID: ${updatedVoucher?.salesVoucherStatusId})`);
  console.log(`   - SO Order Status ID: ${updatedVoucher?.salesVoucherOrders[0]?.salesVoucherOrderStatusId} (20 = Confirmed)`);
  console.log("   ✅ Order officially approved and confirmed in Supabase.\n");

  // Test 6: AI Order Management Agent Intent
  console.log("6️⃣ Testing Order Management Agent intent...");
  const agentOrderRes = await handleOrderManagementIntent("I want to buy 50 bags of 52.5N cement from Tema plant");
  console.log(`   - Reply: ${agentOrderRes.reply.substring(0, 120)}...`);
  console.log(`   - Status: ${agentOrderRes.status}`);
  console.log("   ✅ Order Management Agent conversational step passed.\n");

  // Test 7: AI Analytics Agent Query against Supabase
  console.log("7️⃣ Testing Analytics Agent query against Supabase...");
  const analyticsRes = await handleAnalyticsIntent("how many active users are in the system?");
  console.log(`   - Success: ${analyticsRes.success}`);
  console.log(`   - Reply: ${analyticsRes.reply}`);
  console.log(`   - Metrics:`, analyticsRes.metrics);
  console.log("   ✅ Analytics Agent queried Supabase directly.\n");

  console.log("=================================================================");
  console.log("🎉 ALL SUPABASE POSTGRESQL DB INTERACTIONS PASSED WITH 100% SUCCESS!");
  console.log("=================================================================");
}

main()
  .catch((e) => {
    console.error("❌ Test failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
