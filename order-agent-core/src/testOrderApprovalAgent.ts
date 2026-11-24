import {
  auditAllPendingOrders,
  executeOrderApprovalDecision
} from "./agents/orderApprovalAgent.js";

async function runTest() {
  console.log("=================================================================");
  console.log("🤖 TESTING KARIBU SALES ORDER APPROVAL AGENT");
  console.log("=================================================================\n");

  console.log("Step 1: Auditing pending sales orders awaiting payment verification...");
  const summary = await auditAllPendingOrders(5);

  console.log("\n--- AUDIT SUMMARY ---");
  console.log(`Timestamp: ${summary.timestamp}`);
  console.log(`Total Pending Orders: ${summary.totalPendingOrders}`);
  console.log(`Recommended for Approval: ${summary.recommendedForApproval}`);
  console.log(`Requiring Manual Review: ${summary.requiringManualReview}`);
  console.log(`Recommended for Rejection: ${summary.recommendedForRejection}`);
  console.log(`Total Pending Value: GHS ${summary.totalPendingValueGHS.toLocaleString()}`);

  console.log("\n--- DETAILED ORDER EVALUATIONS ---");
  for (const order of summary.orders) {
    console.log(`\n📦 Sales Order #${order.salesOrderId} (${order.salesOrderNumber})`);
    console.log(`   Amount: GHS ${order.orderAmount.toFixed(2)} | Status: ${order.status}`);
    console.log(`   Has Proof of Payment: ${order.hasProofOfPayment ? `Yes (${order.attachmentName})` : "No"}`);
    console.log(`   Approval Confidence Rate: ${order.confidenceRate}% [${order.confidenceTier}]`);
    console.log(`   Recommended Action: ${order.recommendedAction}`);
    console.log(`   Reason: ${order.recommendationReason}`);

    if (order.transcription) {
      console.log("   Transcribed Form Fields:");
      console.log(`     - Document Type: ${order.transcription.documentTypeName} (ID: ${order.transcription.documentTypeId})`);
      console.log(`     - Bank/Platform: ${order.transcription.bankOrPlatform} (Bank ID: ${order.transcription.bankId})`);
      console.log(`     - Reference: ${order.transcription.transactionReference}`);
      console.log(`     - Amount: ${order.transcription.currency} ${order.transcription.amount?.toFixed(2)}`);
      console.log(`     - Depositor: ${order.transcription.depositorName}`);
      console.log(`     - Date: ${order.transcription.paymentDate}`);
    }

    console.log("   Confidence Breakdown Notes:");
    order.confidenceBreakdown.notes.forEach(note => console.log(`     ${note}`));

    if (order.proposedApprovalPayload) {
      console.log("   Proposed Approval Mutation Variables:");
      console.log(`     ${JSON.stringify(order.proposedApprovalPayload.variables, null, 2).split("\n").join("\n     ")}`);
    }
  }

  console.log("\n=================================================================");
  console.log("👤 Step 2: Simulating User / Administrator Final Decision");
  console.log("=================================================================\n");

  const topApproved = summary.orders.find(o => o.recommendedAction === "APPROVE");
  if (topApproved) {
    console.log(`Executing Administrator Sign-off on Order #${topApproved.salesOrderId}...`);
    const decisionResult = await executeOrderApprovalDecision(
      topApproved.salesOrderId,
      "APPROVE",
      topApproved.proposedApprovalPayload?.variables.input
    );
    console.log("Result:", decisionResult);
  }

  console.log("\n✅ Order Approval Agent Test Completed Successfully.\n");
}

runTest().catch(console.error);
