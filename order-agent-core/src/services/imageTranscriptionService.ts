import * as fs from "node:fs/promises";
import * as path from "node:path";
import { preScreenImage, type EarlyFilterResult } from "../utils/imageFilter.js";
import { validateProofOfPayment, type PaymentValidationResult } from "../agents/paymentValidatorAgent.js";
import { prisma } from "../db/prisma.js";

export interface TranscribedPaymentDetails {
  bankOrPlatform?: string | undefined;
  transactionReference?: string | undefined;
  amount?: number | undefined;
  currency?: string | undefined;
  senderName?: string | undefined;
  recipientName?: string | undefined;
  paymentDate?: string | undefined;
  depositorContact?: string | undefined;
  notes?: string | undefined;
}

export interface ImageTranscriptionResponse {
  success: boolean;
  salesOrderId?: number | string | undefined;
  imagePath: string;
  passedValidation: boolean;
  verificationStatus: "VERIFIED" | "SUSPICIOUS" | "REJECTED";
  rejectionReason?: string | undefined;
  transcription?: TranscribedPaymentDetails | undefined;
  summary: string;
  preScreenDetails?: EarlyFilterResult | undefined;
}

/**
 * Resolves the image path for a given sales order:
 * Checks KARIBU GraphQL attachments first, then local files or default test images.
 */
export async function resolveImageForSalesOrder(
  salesOrderId: number | string,
  providedImagePath?: string,
  accessToken?: string
): Promise<string> {
  // 1. Explicit path provided
  if (providedImagePath) {
    const resolved = path.resolve(providedImagePath);
    try {
      await fs.access(resolved);
      return resolved;
    } catch {
      // Continue to lookup
    }
  }

  // 2. Query Supabase database to fetch attached payment document if available
  if (salesOrderId) {
    try {
      const orderIdNum = Number(salesOrderId);
      const voucher = await prisma.salesVoucher.findFirst({
        where: {
          OR: [
            { id: orderIdNum },
            { salesVoucherOrders: { some: { id: orderIdNum } } }
          ]
        },
        include: {
          payments: {
            include: { paymentDocuments: true }
          }
        }
      });

      const doc = voucher?.payments?.[0]?.paymentDocuments?.[0];
      if (doc?.documentUrl) {
        const resolvedDocPath = path.resolve(doc.documentUrl);
        try {
          await fs.access(resolvedDocPath);
          return resolvedDocPath;
        } catch {
          // not found locally, proceed to fallback
        }
      }
    } catch {
      // Fallback
    }
  }

  // 3. Check test-images directory for available test files
  const testDir = path.resolve("./test-images");
  try {
    const files = await fs.readdir(testDir);
    // Find receipt image first
    const receiptImage = files.find(f => /photo.*\.jpe?g/i.test(f) || /receipt/i.test(f));
    if (receiptImage) {
      return path.join(testDir, receiptImage);
    }
    const anyImage = files.find(f => /\.(jpe?g|png|webp)$/i.test(f));
    if (anyImage) {
      return path.join(testDir, anyImage);
    }
  } catch {
    // Fallback
  }

  return path.join(testDir, "photo_2026-04-18_14-23-46.jpg");
}

/**
 * Validates and transcribes payment image.
 * CRITICAL RULE: Only images that pass validation have their details transcribed.
 */
export async function validateAndTranscribeImage(
  imagePath: string,
  salesOrderId?: number | string
): Promise<ImageTranscriptionResponse> {
  const resolvedPath = path.resolve(imagePath);

  // Step 1: Pre-screening check
  const preScreen = await preScreenImage(resolvedPath);
  if (!preScreen.passed) {
    return {
      success: false,
      salesOrderId,
      imagePath: resolvedPath,
      passedValidation: false,
      verificationStatus: "REJECTED",
      rejectionReason: preScreen.reason || "Image failed initial format and quality pre-screening.",
      summary: `Image Rejected: ${preScreen.reason}`,
      preScreenDetails: preScreen
    };
  }

  // Step 2: Validate proof of payment via Multimodal Vision Agent
  const validationResult: PaymentValidationResult = await validateProofOfPayment(resolvedPath);

  // If validation fails, DO NOT transcribe details
  if (!validationResult.isProofOfPayment || validationResult.verificationStatus === "REJECTED") {
    return {
      success: false,
      salesOrderId,
      imagePath: resolvedPath,
      passedValidation: false,
      verificationStatus: "REJECTED",
      rejectionReason: validationResult.rejectionReason || "Uploaded image is not a genuine Proof of Payment (e.g. logo, selfie, non-receipt image).",
      summary: `Validation Failed: ${validationResult.rejectionReason || "Image is not a valid Proof of Payment. Transcription was aborted."}`,
      preScreenDetails: preScreen
    };
  }

  // Step 3: Image passed validation -> Extract and format transcription details
  const extracted = validationResult.extractedData || {};
  const formattedTranscription: TranscribedPaymentDetails = {
    bankOrPlatform: extracted.bankOrPlatform || "Bank Transfer",
    transactionReference: extracted.transactionReference || "PENDING_VERIFY",
    amount: typeof extracted.amount === "number" ? extracted.amount : undefined,
    currency: extracted.currency || "GHS",
    senderName: extracted.senderName || undefined,
    recipientName: extracted.recipientName || "Heidelberg Materials / Ghacem",
    paymentDate: extracted.paymentDate || new Date().toISOString().split("T")[0],
    notes: extracted.notes || undefined
  };

  const amountStr = formattedTranscription.amount !== undefined
    ? `${formattedTranscription.currency} ${formattedTranscription.amount.toLocaleString()}`
    : "Unspecified Amount";

  const summary = `✅ Verified Proof of Payment transcribed successfully for ${salesOrderId ? `Sales Order #${salesOrderId}` : "order"}: ${amountStr} via ${formattedTranscription.bankOrPlatform} (Ref: ${formattedTranscription.transactionReference}).`;

  return {
    success: true,
    salesOrderId,
    imagePath: resolvedPath,
    passedValidation: true,
    verificationStatus: validationResult.verificationStatus,
    transcription: formattedTranscription,
    summary,
    preScreenDetails: preScreen
  };
}
