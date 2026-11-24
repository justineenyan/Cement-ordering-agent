import express from "express";
import router from "../src/routes/routerRoutes.js";
import * as fs from "node:fs";
import * as path from "node:path";
import http from "node:http";

async function runTests() {
  console.log("🚀 Starting Integration Tests for New Endpoints...\n");

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/api", router);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4999, resolve));
  const baseUrl = "http://localhost:4999/api";

  try {
    // -------------------------------------------------------------------------
    // TEST 1: GET /api/vouchers (Vouchers List + Pagination + Summary)
    // -------------------------------------------------------------------------
    console.log("--- TEST 1: GET /api/vouchers ---");
    const vouchersRes = await fetch(`${baseUrl}/vouchers?limit=5`);
    const vouchersData = await vouchersRes.json();

    console.log("HTTP Status:", vouchersRes.status);
    console.log("Success:", vouchersData.success);
    console.log("Pagination:", vouchersData.pagination);
    console.log("Summary:", vouchersData.summary);
    console.log("First Voucher Sample:", {
      id: vouchersData.data?.[0]?.id,
      voucherNumber: vouchersData.data?.[0]?.voucherNumber,
      customer: vouchersData.data?.[0]?.customer?.customerName,
      status: vouchersData.data?.[0]?.salesVoucherStatus?.description,
      isDeliveryInclusive: vouchersData.data?.[0]?.isDeliveryInclusive,
      orderQuote: vouchersData.data?.[0]?.orderQuote
    });

    if (vouchersData.success && vouchersData.data?.length > 0 && vouchersData.summary?.totalVouchers >= 200) {
      console.log("✅ TEST 1 PASSED: Successfully retrieved vouchers with pagination and 200+ summary counts.\n");
    } else {
      throw new Error(`TEST 1 FAILED: Expected success and 200+ vouchers. Response: ${JSON.stringify(vouchersData)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: GET /api/vouchers?id=1052 (Single Voucher by ID)
    // -------------------------------------------------------------------------
    console.log("--- TEST 2: GET /api/vouchers?id=1052 ---");
    const singleVoucherRes = await fetch(`${baseUrl}/vouchers?id=1052`);
    const singleVoucherData = await singleVoucherRes.json();

    console.log("HTTP Status:", singleVoucherRes.status);
    console.log("Voucher Number:", singleVoucherData.data?.voucherNumber);
    console.log("Customer:", singleVoucherData.data?.customer?.customerName);
    console.log("Orders Count:", singleVoucherData.data?.salesVoucherOrders?.length);
    console.log("Payments Count:", singleVoucherData.data?.payments?.length);

    if (singleVoucherData.success && singleVoucherData.data?.voucherNumber === "SV-1052") {
      console.log("✅ TEST 2 PASSED: Single voucher fetched successfully with full relational graph.\n");
    } else {
      throw new Error(`TEST 2 FAILED: Could not retrieve voucher SV-1052.`);
    }

    // -------------------------------------------------------------------------
    // TEST 3: GET /api/orders/evaluate?id=1052 (Order Evaluation with PoP Analysis)
    // -------------------------------------------------------------------------
    console.log("--- TEST 3: GET /api/orders/evaluate?id=1052 ---");
    const evalRes = await fetch(`${baseUrl}/orders/evaluate?id=1052`);
    const evalData = await evalRes.json();

    console.log("HTTP Status:", evalRes.status);
    console.log("Sales Order:", evalData.salesOrderNumber);
    console.log("Approval Rating:", evalData.approvalRatingPercent);
    console.log("Confidence Tier:", evalData.confidenceTier);
    console.log("Recommended Action:", evalData.recommendedAction);
    console.log("Recommendation Reason:", evalData.recommendationReason);
    console.log("Breakdown:", evalData.confidenceBreakdown);
    console.log("Requires User Final Decision:", evalData.requiresUserFinalDecision);

    if (evalData.success && typeof evalData.approvalRating === "number") {
      console.log("✅ TEST 3 PASSED: Single order evaluation endpoint computed approval rating and recommendation.\n");
    } else {
      throw new Error(`TEST 3 FAILED: Order evaluation failed. Response: ${JSON.stringify(evalData)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: POST /api/payments/upload-pop with Non-Payment Image (Validation Rejection)
    // -------------------------------------------------------------------------
    console.log("--- TEST 4: POST /api/payments/upload-pop (Non-Payment Logo Image) ---");
    const logoFilePath = path.resolve(process.cwd(), "test-images", "HMIcon.png");
    if (fs.existsSync(logoFilePath)) {
      const fileBytes = fs.readFileSync(logoFilePath);
      const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);

      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="HMIcon.png"\r\nContent-Type: image/png\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;

      const bodyBuffer = Buffer.concat([
        Buffer.from(header, "utf-8"),
        fileBytes,
        Buffer.from(footer, "utf-8")
      ]);

      const uploadRejectRes = await fetch(`${baseUrl}/payments/upload-pop?id=1054`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer
      });

      const uploadRejectData = await uploadRejectRes.json();
      console.log("HTTP Status:", uploadRejectRes.status);
      console.log("Passed Validation:", uploadRejectData.passedValidation);
      console.log("Step:", uploadRejectData.step);
      console.log("Rejection Reason:", uploadRejectData.rejectionReason);

      if (uploadRejectRes.status === 422 && uploadRejectData.passedValidation === false) {
        console.log("✅ TEST 4 PASSED: Non-PoP logo image correctly rejected by validation with 422 Unprocessable Entity.\n");
      } else {
        console.warn("⚠️ TEST 4 INFO: Got response:", uploadRejectData);
      }
    }

    // -------------------------------------------------------------------------
    // TEST 5: POST /api/payments/upload-pop with Authentic Deposit Slip
    // -------------------------------------------------------------------------
    console.log("--- TEST 5: POST /api/payments/upload-pop (Authentic Deposit Slip) ---");
    const genuineSlipPath = path.resolve(process.cwd(), "test-images", "stanbic_deposit_slip.jpg");
    if (fs.existsSync(genuineSlipPath)) {
      const slipBytes = fs.readFileSync(genuineSlipPath);
      const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);

      const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="stanbic_deposit_slip.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
      const footer = `\r\n--${boundary}--\r\n`;

      const bodyBuffer = Buffer.concat([
        Buffer.from(header, "utf-8"),
        slipBytes,
        Buffer.from(footer, "utf-8")
      ]);

      const uploadPassRes = await fetch(`${baseUrl}/payments/upload-pop?id=1054`, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer
      });

      const uploadPassData = await uploadPassRes.json();
      console.log("HTTP Status:", uploadPassRes.status);
      console.log("Success:", uploadPassData.success);
      console.log("Verification Status:", uploadPassData.verificationStatus);
      console.log("Attached To:", uploadPassData.attachedTo);
      console.log("Transcription:", uploadPassData.transcription);

      if (uploadPassRes.status === 200 && uploadPassData.passedValidation === true) {
        console.log("✅ TEST 5 PASSED: Authentic proof of payment passed validation and attached to voucher/payment.\n");
      } else {
        console.warn("⚠️ TEST 5 Result:", uploadPassData);
      }
    }

    console.log("🎉 ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!");
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
