import * as path from "node:path";
import * as fs from "node:fs/promises";
import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";
import {
  evaluateOrderApproval,
  BANK_ID_MAP,
  type PendingSalesOrder,
  type OrderEvaluationResult
} from "../agents/orderApprovalAgent.js";
import { preScreenImage, type EarlyFilterResult } from "../utils/imageFilter.js";
import { validateProofOfPayment, type PaymentValidationResult } from "../agents/paymentValidatorAgent.js";
import { validateAndTranscribeImage, resolveImageForSalesOrder } from "./imageTranscriptionService.js";

export interface VoucherQueryFilter {
  id?: number | string;
  page?: number;
  limit?: number;
  statusId?: number;
  status?: string;
  customerId?: number | string;
  deliveryType?: "DELIVERED" | "EXW";
  search?: string;
  sortBy?: "id" | "createdAt" | "orderQuote" | "voucherNumber";
  sortOrder?: "asc" | "desc";
}

export interface VoucherListResult {
  vouchers: any[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
  summary: {
    totalVouchers: number;
    deliveredCount: number;
    exwCount: number;
    pendingCount: number;
    paymentSubmittedCount: number;
    confirmedCount: number;
    rejectedCount: number;
  };
}

/**
 * Standard Prisma include relation graph for Sales Vouchers.
 */
export const voucherIncludeGraph: Prisma.SalesVoucherInclude = {
  customer: {
    select: {
      id: true,
      customerCode: true,
      customerName: true,
      email: true,
      phoneNumber: true,
      customerAccountBalance: true,
      customerAvailableCredit: true,
      customerCrLimit: true,
      customerCurrency: true,
      active: true
    }
  },
  sourceLocation: {
    select: {
      id: true,
      name: true,
      code: true,
      type: true
    }
  },
  destination: {
    select: {
      id: true,
      name: true,
      code: true,
      region: true,
      country: true,
      distance: true
    }
  },
  salesVoucherStatus: {
    select: {
      id: true,
      description: true,
      translationKey: true
    }
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          itemCode: true,
          title: true,
          unitPrice: true,
          standardUnit: true,
          productGroup: true
        }
      }
    }
  },
  salesVoucherOrders: {
    select: {
      id: true,
      salesOrderNumber: true,
      salesVoucherId: true,
      quantity: true,
      amountTotal: true,
      deliveryType: true,
      salesOrderCreated: true,
      destinationId: true
    }
  },
  payments: {
    orderBy: { id: "desc" },
    include: {
      paymentMode: true,
      paymentStatus: true,
      paymentDocuments: {
        orderBy: { id: "desc" }
      },
      paymentTranscriptions: {
        orderBy: { id: "desc" },
        include: {
          bank: true,
          bankBranch: true,
          documentType: true
        }
      }
    }
  }
};

/**
 * Queries sales vouchers with comprehensive filtering, pagination, and summary statistics.
 */
export async function getSalesVouchers(filter: VoucherQueryFilter): Promise<VoucherListResult> {
  const page = Math.max(1, Number(filter.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
  const skip = (page - 1) * limit;

  const where: any = {};

  // Single ID lookup
  if (filter.id) {
    const numericId = Number(filter.id);
    if (!isNaN(numericId)) {
      where.OR = [
        { id: numericId },
        { voucherNumber: String(filter.id) },
        { salesVoucherOrders: { some: { id: numericId } } },
        { salesVoucherOrders: { some: { salesOrderNumber: String(filter.id) } } }
      ];
    } else {
      where.OR = [
        { voucherNumber: String(filter.id) },
        { salesVoucherOrders: { some: { salesOrderNumber: String(filter.id) } } }
      ];
    }
  }

  // Status filtering
  if (filter.statusId) {
    where.salesVoucherStatusId = Number(filter.statusId);
  } else if (filter.status) {
    const statusQuery = filter.status.trim().toLowerCase();
    if (statusQuery === "pending") {
      where.salesVoucherStatusId = 1;
    } else if (statusQuery === "paymentsubmitted" || statusQuery === "submitted") {
      where.salesVoucherStatusId = 8;
    } else if (statusQuery === "rejected" || statusQuery === "cancelled") {
      where.salesVoucherStatusId = 7;
    } else if (statusQuery === "confirmed" || statusQuery === "orderconfirmed") {
      where.salesVoucherStatusId = { in: [4, 5, 9] };
    } else if (statusQuery === "delivered") {
      where.salesVoucherStatusId = 6;
    } else {
      where.salesVoucherStatus = {
        description: { contains: filter.status, mode: "insensitive" }
      };
    }
  }

  // Customer filtering
  if (filter.customerId) {
    const numCustId = Number(filter.customerId);
    if (!isNaN(numCustId)) {
      where.customerId = numCustId;
    } else {
      where.customer = {
        customerCode: String(filter.customerId)
      };
    }
  }

  // Delivery type filtering
  if (filter.deliveryType) {
    const dType = filter.deliveryType.toUpperCase();
    if (dType === "DELIVERED") {
      where.isDeliveryInclusive = true;
    } else if (dType === "EXW") {
      where.isDeliveryInclusive = false;
    }
  }

  // Free text search
  if (filter.search && filter.search.trim()) {
    const term = filter.search.trim();
    where.OR = [
      { voucherNumber: { contains: term, mode: "insensitive" } },
      { customerReference: { contains: term, mode: "insensitive" } },
      { localPurchaseOrder: { contains: term, mode: "insensitive" } },
      { comments: { contains: term, mode: "insensitive" } },
      { customer: { customerName: { contains: term, mode: "insensitive" } } },
      { customer: { customerCode: { contains: term, mode: "insensitive" } } },
      { destination: { name: { contains: term, mode: "insensitive" } } },
      { salesVoucherOrders: { some: { salesOrderNumber: { contains: term, mode: "insensitive" } } } }
    ];
  }

  const orderByField = filter.sortBy || "id";
  const orderDirection = filter.sortOrder?.toLowerCase() === "asc" ? "asc" : "desc";

  const [vouchers, total, deliveredCount, exwCount, pendingCount, paymentSubmittedCount, confirmedCount, rejectedCount] =
    await Promise.all([
      prisma.salesVoucher.findMany({
        where,
        include: voucherIncludeGraph,
        skip,
        take: limit,
        orderBy: { [orderByField]: orderDirection }
      }),
      prisma.salesVoucher.count({ where }),
      prisma.salesVoucher.count({ where: { isDeliveryInclusive: true } }),
      prisma.salesVoucher.count({ where: { isDeliveryInclusive: false } }),
      prisma.salesVoucher.count({ where: { salesVoucherStatusId: 1 } }),
      prisma.salesVoucher.count({ where: { salesVoucherStatusId: 8 } }),
      prisma.salesVoucher.count({ where: { salesVoucherStatusId: { in: [4, 5, 9] } } }),
      prisma.salesVoucher.count({ where: { salesVoucherStatusId: 7 } })
    ]);

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    vouchers,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages
    },
    summary: {
      totalVouchers: deliveredCount + exwCount,
      deliveredCount,
      exwCount,
      pendingCount,
      paymentSubmittedCount,
      confirmedCount,
      rejectedCount
    }
  };
}

/**
 * Resolves a Sales Voucher or Order by ID or Voucher number from database.
 */
export async function getSalesVoucherById(id: number | string): Promise<any | null> {
  const numericId = Number(id);
  const whereCondition: any = isNaN(numericId)
    ? {
        OR: [
          { voucherNumber: String(id) },
          { salesVoucherOrders: { some: { salesOrderNumber: String(id) } } }
        ]
      }
    : {
        OR: [
          { id: numericId },
          { voucherNumber: String(id) },
          { salesVoucherOrders: { some: { id: numericId } } },
          { salesVoucherOrders: { some: { salesOrderNumber: String(id) } } }
        ]
      };

  return prisma.salesVoucher.findFirst({
    where: whereCondition,
    include: voucherIncludeGraph
  });
}

/**
 * Evaluates a single sales order using AI vision and multimodal approval rating.
 * Accepts either a frontend-supplied voucher payload OR looks up the record via ID in the database.
 */
export async function evaluateParticularSalesOrder(
  orderIdParam: number | string,
  frontendVoucher?: any,
  accessToken?: string
): Promise<{
  orderSummary: any;
  evaluation: OrderEvaluationResult;
}> {
  let voucherData: any = frontendVoucher;

  // If frontend didn't supply full voucher or supplied partial object, resolve from DB
  if (!voucherData || !voucherData.payments || !voucherData.voucherNumber) {
    const dbVoucher = await getSalesVoucherById(orderIdParam);
    if (dbVoucher) {
      voucherData = { ...dbVoucher, ...(frontendVoucher || {}) };
    }
  }

  if (!voucherData) {
    throw new Error(`Sales Order / Voucher with ID '${orderIdParam}' was not found in the database.`);
  }

  // Extract primary order details
  const numericId = Number(orderIdParam) || voucherData.id || 1052;
  const primaryOrder = voucherData.salesVoucherOrders?.[0];
  const orderNumber = primaryOrder?.salesOrderNumber || voucherData.voucherNumber || `SO-${numericId}`;
  const orderQuote = Number(voucherData.orderQuote || primaryOrder?.amountTotal || 5000);
  const customerId = voucherData.customerId || primaryOrder?.customerId || 107;
  const customerName = voucherData.customer?.customerName || "Enterprise Customer";
  const statusName =
    voucherData.salesVoucherStatus?.description ||
    (voucherData.salesVoucherStatusId === 8 ? "PaymentSubmitted" : "Pending");

  // Determine attached Proof of Payment document path or URL
  const payment = voucherData.payments?.[0];
  const doc = payment?.paymentDocuments?.[0];
  let fileName = doc?.documentName || voucherData.fileName || voucherData.attachment?.fileName;
  let filePath = doc?.documentUrl || voucherData.attachment?.filePath;

  // If path doesn't exist locally, check test-images or resolve
  if (filePath) {
    try {
      await fs.access(path.resolve(filePath));
    } catch {
      // If not accessible directly, fallback to test-images
      if (fileName) {
        const testPath = path.resolve(process.cwd(), "test-images", fileName);
        try {
          await fs.access(testPath);
          filePath = testPath;
        } catch {
          // Keep as is
        }
      }
    }
  } else if (fileName) {
    const testPath = path.resolve(process.cwd(), "test-images", fileName);
    try {
      await fs.access(testPath);
      filePath = testPath;
    } catch {
      filePath = testPath;
    }
  }

  const pendingOrder: PendingSalesOrder = {
    id: numericId,
    salesOrderNumber: orderNumber,
    orderQuote,
    customerId,
    customerName,
    quantity: primaryOrder?.quantity || 50,
    createdAt: voucherData.createdAt ? new Date(voucherData.createdAt).toISOString() : new Date().toISOString(),
    status: statusName,
    attachment: fileName || filePath ? {
      fileName: fileName || "proof_of_payment.jpg",
      filePath
    } : undefined
  };

  // Run AI multimodal vision evaluation and calculate confidence score (0-100%)
  const evaluation: OrderEvaluationResult = await evaluateOrderApproval(pendingOrder, accessToken);

  return {
    orderSummary: {
      id: numericId,
      voucherNumber: voucherData.voucherNumber || orderNumber,
      salesOrderNumber: orderNumber,
      customerName,
      orderQuote,
      status: statusName,
      deliveryType: voucherData.isDeliveryInclusive ? "DELIVERED" : "EXW",
      destination: voucherData.destination?.name || "Direct Factory Pickup (EXW)"
    },
    evaluation
  };
}

/**
 * Validates an uploaded proof of payment image through the multi-stage pipeline:
 * 1. Algorithmic format/dimension pre-screening.
 * 2. Multimodal AI Vision verification (verifies deposit slip/cheque/bank transfer vs logo/selfie).
 * 3. Conditional transcription & database attachment to the specified sales order/voucher.
 */
export async function validateAndAttachPoPImage(
  filePath: string,
  originalFilename: string,
  fileSizeBytes: number,
  mimeType: string,
  targetOrderIdOrVoucherId?: number | string
): Promise<{
  success: boolean;
  passedValidation: boolean;
  step: "PRE_SCREEN" | "AI_VISION" | "ATTACHMENT";
  verificationStatus: "VERIFIED" | "SUSPICIOUS" | "REJECTED";
  rejectionReason?: string;
  transcription?: any;
  attachedTo?: any;
  fileDetails: {
    originalFilename: string;
    storedPath: string;
    fileUrl: string;
    fileSizeBytes: number;
    mimeType: string;
  };
}> {
  const resolvedPath = path.resolve(filePath);

  // 1. Stage 1: Algorithmic Pre-Screening
  const preScreen: EarlyFilterResult = await preScreenImage(resolvedPath);
  if (!preScreen.passed) {
    // Delete invalid file to conserve disk space
    try {
      await fs.unlink(resolvedPath);
    } catch {}

    return {
      success: false,
      passedValidation: false,
      step: "PRE_SCREEN",
      verificationStatus: "REJECTED",
      rejectionReason: preScreen.reason || "Image failed format or integrity pre-screening check.",
      fileDetails: {
        originalFilename,
        storedPath: filePath,
        fileUrl: `/uploads/proof_of_payment/${path.basename(filePath)}`,
        fileSizeBytes,
        mimeType
      }
    };
  }

  // 2. Stage 2: AI Multimodal Vision Validation
  const visionValidation: PaymentValidationResult = await validateProofOfPayment(resolvedPath);
  if (!visionValidation.isProofOfPayment || visionValidation.verificationStatus === "REJECTED") {
    // Quarantine/clean up rejected non-PoP image
    try {
      await fs.unlink(resolvedPath);
    } catch {}

    return {
      success: false,
      passedValidation: false,
      step: "AI_VISION",
      verificationStatus: "REJECTED",
      rejectionReason:
        visionValidation.rejectionReason ||
        "The uploaded image is not a recognized Proof of Payment (deposit slip, bank transfer confirmation, or cheque).",
      fileDetails: {
        originalFilename,
        storedPath: filePath,
        fileUrl: `/uploads/proof_of_payment/${path.basename(filePath)}`,
        fileSizeBytes,
        mimeType
      }
    };
  }

  // 3. Stage 3: Extract Transcription Details
  const numericId = Number(targetOrderIdOrVoucherId) || 0;
  const transcriptionRes = await validateAndTranscribeImage(resolvedPath, numericId);

  let attachedRecordInfo: any = null;

  // 4. Stage 4: Attach to Database if target Sales Voucher/Order provided
  if (targetOrderIdOrVoucherId) {
    try {
      const voucher = await getSalesVoucherById(targetOrderIdOrVoucherId);
      if (voucher) {
        // Ensure Payment record exists
        let payment = voucher.payments?.[0];
        if (!payment) {
          const generatedPaymentRef = `PAY-UP-${Date.now().toString().slice(-6)}`;
          payment = await prisma.payment.create({
            data: {
              salesVoucherId: voucher.id,
              customerId: voucher.customerId,
              paymentReference: generatedPaymentRef,
              amount: voucher.orderQuote || 5000,
              paymentModeId: 1, // Default to Mobile Money / Bank
              paymentStatusId: 1 // Pending
            }
          });
        }

        // Attach PaymentDocument record
        const paymentDoc = await prisma.paymentDocument.create({
          data: {
            paymentId: payment.id,
            documentName: originalFilename,
            documentUrl: filePath
          }
        });

        // Attach PaymentTranscription record if transcription succeeded
        let transcriptionRecord = null;
        if (transcriptionRes.transcription) {
          const t = transcriptionRes.transcription;
          const bankKey = (t.bankOrPlatform || "").toLowerCase().trim();
          const matchedBankId = BANK_ID_MAP[bankKey] || 5;

          transcriptionRecord = await prisma.paymentTranscription.create({
            data: {
              paymentId: payment.id,
              documentTypeId: 1, // E-Payment / Slip
              bankId: matchedBankId,
              amount: t.amount || voucher.orderQuote || payment.amount,
              depositorName: t.senderName || voucher.customer?.customerName || "Depositor",
              depositorContact: t.depositorContact || voucher.customer?.phoneNumber || "+233200000000",
              documentReference: t.transactionReference || `TXN-${Date.now().toString().slice(-6)}`,
              documentDate: t.paymentDate ? new Date(t.paymentDate) : new Date(),
              notes: t.notes || "Uploaded and verified via AI Multimodal Vision Pipeline",
              paymentTranscriptionStatusId: 1
            }
          });
        }

        // Advance voucher status to PaymentSubmitted (8) if it was Pending (1)
        if (voucher.salesVoucherStatusId === 1) {
          await prisma.salesVoucher.update({
            where: { id: voucher.id },
            data: { salesVoucherStatusId: 8 }
          });
        }

        attachedRecordInfo = {
          salesVoucherId: voucher.id,
          voucherNumber: voucher.voucherNumber,
          salesOrderNumber: voucher.salesVoucherOrders?.[0]?.salesOrderNumber,
          paymentId: payment.id,
          paymentDocumentId: paymentDoc.id,
          paymentTranscriptionId: transcriptionRecord?.id ?? null
        };
      }
    } catch (dbErr: any) {
      console.warn("Could not attach document to database record:", dbErr.message);
    }
  }

  return {
    success: true,
    passedValidation: true,
    step: "ATTACHMENT",
    verificationStatus: visionValidation.verificationStatus,
    transcription: transcriptionRes.transcription,
    attachedTo: attachedRecordInfo,
    fileDetails: {
      originalFilename,
      storedPath: filePath,
      fileUrl: `/uploads/proof_of_payment/${path.basename(filePath)}`,
      fileSizeBytes,
      mimeType
    }
  };
}
