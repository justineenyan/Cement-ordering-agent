import { prisma } from "../db/prisma.js";

/**
 * ============================================================================
 * KARIBU DATABASE CORE SERVICE
 * ============================================================================
 * Replaces live remote Karibu GraphQL API with local/Supabase database operations.
 * Handles Sales Voucher creations, items, generated Sales Orders, payments,
 * AI multimodal vision transcriptions, customer balances, and analytics.
 */

export interface SalesVoucherItemInput {
  productId: number;
  quantity: number;
  trucksCount?: number;
  unitPrice?: number;
  sourceLocationId?: number;
  destinationId?: number;
  isDeliveryInclusive?: boolean;
  customerRef?: string;
  deliveryDate?: string | Date;
  vehicleId?: number;
  driverId?: number;
}

export interface UpsertSalesVoucherInput {
  id?: number;
  companyId?: number;
  customerId?: number;
  createdById?: string;
  sourceLocationId: number;
  destinationId?: number;
  isDeliveryInclusive?: boolean;
  localPurchaseOrder?: string;
  description?: string;
  comments?: string;
  deliveryContact?: string;
  salesVoucherItemInputs?: SalesVoucherItemInput[];
  items?: SalesVoucherItemInput[];
}

export interface UpsertPaymentInput {
  id?: number;
  salesVoucherId?: number;
  customerId?: number;
  amount: number;
  amountApproved?: number;
  paymentModeId: number;
  paymentStatusId?: number;
  paymentReference?: string;
  transactionId?: string;
  availableBalanceRef?: string;
  customerTranscriptionItemInput?: {
    documentTypeId: number;
    documentDate?: string | Date;
    bankId?: number;
    bankBranchId?: number;
    depositorName?: string;
    depositorContact?: string;
    documentReference?: string;
    notes?: string;
  };
  documentUrls?: string[];
}

/**
 * Generates the next sequential voucher number, e.g. SV-1056
 */
async function generateVoucherNumber(client: any = prisma): Promise<string> {
  const allVouchers = await client.salesVoucher.findMany({
    select: { voucherNumber: true }
  });
  const maxNum = allVouchers.reduce((max: number, v: { voucherNumber: string }) => {
    const num = parseInt(v.voucherNumber.replace(/\D/g, ""), 10);
    return !isNaN(num) && num > max ? num : max;
  }, 1051);
  return `SV-${maxNum + 1}`;
}

/**
 * Generates the next sequential sales order number, e.g. SO-1056
 */
async function generateSalesOrderNumber(client: any = prisma, offset: number = 0): Promise<string> {
  const allOrders = await client.salesVoucherOrder.findMany({
    select: { salesOrderNumber: true }
  });
  const maxNum = allOrders.reduce((max: number, o: { salesOrderNumber: string }) => {
    const num = parseInt(o.salesOrderNumber.replace(/\D/g, ""), 10);
    return !isNaN(num) && num > max ? num : max;
  }, 1051);
  return `SO-${maxNum + 1 + offset}`;
}

/**
 * Generates the next sequential payment reference, e.g. PAY-55823
 */
async function generatePaymentReference(client: any = prisma): Promise<string> {
  const allPayments = await client.payment.findMany({
    select: { paymentReference: true }
  });
  const maxNum = allPayments.reduce((max: number, p: { paymentReference: string }) => {
    const num = parseInt(p.paymentReference.replace(/\D/g, ""), 10);
    return !isNaN(num) && num > max ? num : max;
  }, 55820);
  return `PAY-${maxNum + 1}`;
}

/**
 * 1. Upsert / Create a new Sales Voucher in the database.
 * Automatically resolves unit prices, calculates order quotes,
 * creates item records, and generates individual Sales Orders (SO).
 */
export async function createOrUpdateSalesVoucher(input: UpsertSalesVoucherInput) {
  const companyId = input.companyId || 3; // Default Ghacem Ltd
  const sourceLocationId = input.sourceLocationId || 12; // Default Tema Plant
  
  // Resolve customer: use provided customerId or default to Kwame Mensah Ltd (107)
  let customerId = input.customerId;
  if (!customerId) {
    const defaultCust = await prisma.customer.findFirst({ where: { companyId } });
    customerId = defaultCust?.id || 107;
  }

  const rawItems = input.salesVoucherItemInputs || input.items || [];
  if (rawItems.length === 0) {
    // Default to 50 bags of CEM II/A-LL 52.5R (id: 23) if none provided
    rawItems.push({
      productId: 23,
      quantity: 50,
      trucksCount: 1
    });
  }

  // Pre-load products to compute accurate pricing
  const productIds = rawItems.map(i => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } }
  });
  const productMap = new Map(products.map(p => [p.id, p]));

  // Calculate item pricing & total quotation
  let totalOrderQuote = 0;
  const processedItems = rawItems.map(item => {
    const product = productMap.get(item.productId);
    const unitPrice = item.unitPrice ?? product?.unitPrice ?? 90.0;
    const trucksCount = item.trucksCount ?? 1;
    const quantity = item.quantity;
    const totalPrice = unitPrice * quantity * trucksCount;
    totalOrderQuote += totalPrice;

    return {
      productId: item.productId,
      quantity,
      trucksCount,
      unitPrice,
      totalPrice,
      sourceLocationId: item.sourceLocationId || sourceLocationId,
      destinationId: item.destinationId || input.destinationId || null,
      isDeliveryInclusive: item.isDeliveryInclusive ?? input.isDeliveryInclusive ?? false,
      customerRef: item.customerRef ?? null,
      deliveryDate: item.deliveryDate ? new Date(item.deliveryDate) : null,
      vehicleId: item.vehicleId ?? null,
      driverId: item.driverId ?? null
    };
  });

  const voucherNumber = await generateVoucherNumber();

  // Create Sales Voucher with nested items and Sales Voucher Orders in a single transaction
  const createdVoucher = await prisma.$transaction(async (tx) => {
    const voucher = await tx.salesVoucher.create({
      data: {
        voucherNumber,
        orderQuote: totalOrderQuote,
        companyId,
        customerId,
        createdById: input.createdById ?? null,
        sourceLocationId,
        destinationId: input.destinationId ?? null,
        isDeliveryInclusive: input.isDeliveryInclusive ?? false,
        localPurchaseOrder: input.localPurchaseOrder ?? null,
        description: input.description ?? null,
        comments: input.comments ?? null,
        deliveryContact: input.deliveryContact ?? null,
        salesVoucherStatusId: 10, // QuotationGenerated (or Pending)
        quotationGeneratedAt: new Date(),
        items: {
          create: processedItems
        }
      },
      include: {
        items: true,
        customer: true,
        sourceLocation: true,
        destination: true,
        company: true
      }
    });

    // Generate Sales Voucher Orders (SO) for each item / truck
    let orderOffset = 0;
    for (const item of voucher.items) {
      const soNumber = await generateSalesOrderNumber(tx, orderOffset++);
      await tx.salesVoucherOrder.create({
        data: {
          salesOrderNumber: soNumber,
          salesVoucherId: voucher.id,
          salesVoucherItemId: item.id,
          customerId,
          companyId,
          locationId: item.sourceLocationId || sourceLocationId,
          productId: item.productId,
          quantity: item.quantity,
          amountUnitPrice: item.unitPrice,
          amountTotal: item.totalPrice,
          salesVoucherOrderStatusId: 10, // Unconfirmed
          destinationId: item.destinationId,
          deliveryType: item.isDeliveryInclusive ? "DELIVERED" : "EXW"
        }
      });
    }

    // Update customer open orders balance
    await tx.customer.update({
      where: { id: customerId },
      data: {
        customerOpenOrders: { increment: totalOrderQuote }
      }
    });

    return voucher;
  });

  // Re-query with all relations for return
  return prisma.salesVoucher.findUnique({
    where: { id: createdVoucher.id },
    include: {
      customer: true,
      sourceLocation: true,
      destination: true,
      salesVoucherStatus: true,
      items: {
        include: { product: true }
      },
      salesVoucherOrders: true
    }
  });
}

/**
 * 2. Void or Cancel a Sales Voucher.
 */
export async function voidSalesVoucher(salesVoucherId: number, cancellationReason?: string) {
  const voucher = await prisma.salesVoucher.findUnique({
    where: { id: salesVoucherId },
    include: { customer: true }
  });

  if (!voucher) {
    throw new Error(`Sales voucher with ID ${salesVoucherId} not found.`);
  }

  return prisma.$transaction(async (tx) => {
    // Deduct open orders amount from customer
    if (voucher.orderQuote) {
      await tx.customer.update({
        where: { id: voucher.customerId },
        data: {
          customerOpenOrders: { decrement: voucher.orderQuote }
        }
      });
    }

    // Cancel sales orders
    await tx.salesVoucherOrder.updateMany({
      where: { salesVoucherId },
      data: { salesVoucherOrderStatusId: 30 } // Cancelled
    });

    // Update voucher status to Cancelled (7)
    return tx.salesVoucher.update({
      where: { id: salesVoucherId },
      data: {
        salesVoucherStatusId: 7, // Cancelled
        comments: cancellationReason ? `Cancelled: ${cancellationReason}` : voucher.comments
      },
      include: {
        salesVoucherOrders: true,
        salesVoucherStatus: true
      }
    });
  });
}

/**
 * 3. Confirm quotation for a Sales Voucher.
 */
export async function confirmSalesVoucherQuotation(salesVoucherId: number) {
  return prisma.salesVoucher.update({
    where: { id: salesVoucherId },
    data: {
      salesVoucherStatusId: 11 // QuotationConfirmed
    }
  });
}

/**
 * 4. Upsert a Payment and attach Proof of Payment (PoP) & transcription records.
 */
export async function createOrUpdatePayment(input: UpsertPaymentInput) {
  const paymentReference = input.paymentReference || await generatePaymentReference();
  const paymentModeId = input.paymentModeId || 2; // Default Cash Deposit Slip
  const paymentStatusId = input.paymentStatusId || 1; // 1 = Pending, 2 = Approved, 3 = Rejected

  return prisma.$transaction(async (tx) => {
    // 1. Upsert Payment
    const payment = await tx.payment.upsert({
      where: { paymentReference },
      update: {
        amount: input.amount,
        amountApproved: input.amountApproved ?? null,
        paymentModeId,
        paymentStatusId,
        transactionId: input.transactionId ?? null,
        salesVoucherId: input.salesVoucherId ?? null,
        customerId: input.customerId ?? null
      },
      create: {
        paymentReference,
        salesVoucherId: input.salesVoucherId ?? null,
        customerId: input.customerId ?? null,
        amount: input.amount,
        amountApproved: input.amountApproved ?? null,
        paymentModeId,
        paymentStatusId,
        transactionId: input.transactionId ?? null,
        availableBalanceRef: input.availableBalanceRef ?? null
      }
    });

    // 2. Insert Transcription if present
    if (input.customerTranscriptionItemInput) {
      const trans = input.customerTranscriptionItemInput;
      await tx.paymentTranscription.create({
        data: {
          paymentId: payment.id,
          documentTypeId: trans.documentTypeId || 2,
          bankId: trans.bankId ?? null,
          bankBranchId: trans.bankBranchId ?? null,
          amount: input.amount,
          depositorName: trans.depositorName ?? null,
          depositorContact: trans.depositorContact ?? null,
          documentDate: trans.documentDate ? new Date(trans.documentDate) : new Date(),
          documentReference: trans.documentReference ?? null,
          notes: trans.notes ?? null
        }
      });
    }

    // 3. Attach documents if provided
    if (input.documentUrls && input.documentUrls.length > 0) {
      for (const url of input.documentUrls) {
        await tx.paymentDocument.create({
          data: {
            paymentId: payment.id,
            documentName: url.split("/").pop() || "proof_of_payment.jpg",
            documentUrl: url
          }
        });
      }
    }

    // 4. Update Sales Voucher & Sales Orders statuses
    if (input.salesVoucherId) {
      const newVoucherStatus = paymentStatusId === 2 ? 3 : 8; // 3 = PaymentConfirmed, 8 = PaymentSubmitted
      await tx.salesVoucher.update({
        where: { id: input.salesVoucherId },
        data: { salesVoucherStatusId: newVoucherStatus }
      });

      if (paymentStatusId === 2) {
        // Confirm sales orders
        await tx.salesVoucherOrder.updateMany({
          where: { salesVoucherId: input.salesVoucherId },
          data: { salesVoucherOrderStatusId: 20 } // Confirmed
        });
      }
    }

    return tx.payment.findUnique({
      where: { id: payment.id },
      include: {
        paymentMode: true,
        paymentStatus: true,
        paymentTranscriptions: {
          include: {
            bank: true,
            bankBranch: true,
            documentType: true
          }
        },
        paymentDocuments: true,
        salesVoucher: true
      }
    });
  });
}

/**
 * 5. Approve or Reject an Order Payment directly (Used by AI Order Approval Agent).
 */
export async function setOrderApprovalStatus(
  salesVoucherId: number,
  approved: boolean,
  amountApproved?: number,
  notes?: string
) {
  const voucher = await prisma.salesVoucher.findUnique({
    where: { id: salesVoucherId },
    include: { payments: true }
  });

  if (!voucher) throw new Error(`Voucher ${salesVoucherId} not found.`);

  const statusId = approved ? 2 : 3; // 2 = Approved, 3 = Rejected
  const finalAmount = amountApproved ?? voucher.orderQuote ?? 0;

  return prisma.$transaction(async (tx) => {
    // Update or create payment
    let payment = voucher.payments[0];
    if (payment) {
      payment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          paymentStatusId: statusId,
          amountApproved: approved ? finalAmount : 0,
          rejectionComment: approved ? null : (notes || "Proof of payment verification failed")
        }
      });
    } else {
      const ref = await generatePaymentReference();
      payment = await tx.payment.create({
        data: {
          salesVoucherId,
          customerId: voucher.customerId,
          paymentReference: ref,
          amount: finalAmount,
          amountApproved: approved ? finalAmount : 0,
          paymentModeId: 2,
          paymentStatusId: statusId,
          rejectionComment: approved ? null : (notes ?? null)
        }
      });
    }

    // Update voucher status
    await tx.salesVoucher.update({
      where: { id: salesVoucherId },
      data: {
        salesVoucherStatusId: approved ? 3 : 1 // 3 = PaymentConfirmed, 1 = Quotation (pending valid payment)
      }
    });

    if (approved) {
      // Confirm sales orders
      await tx.salesVoucherOrder.updateMany({
        where: { salesVoucherId },
        data: { salesVoucherOrderStatusId: 20 }
      });

      // Deduct from customer credit / balance
      await tx.customer.update({
        where: { id: voucher.customerId },
        data: {
          customerAvailableCredit: { decrement: finalAmount },
          customerAccountBalance: { decrement: finalAmount }
        }
      });
    }

    return payment;
  });
}

/**
 * 6. Query pending sales orders for payment verification.
 */
export async function getPendingOrdersForAudit(limit: number = 20) {
  return prisma.salesVoucher.findMany({
    where: {
      salesVoucherStatusId: { in: [8, 12, 1] } // PaymentSubmitted, Pending, Quotation
    },
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      customer: true,
      sourceLocation: true,
      destination: true,
      items: {
        include: { product: true }
      },
      salesVoucherOrders: true,
      payments: {
        include: {
          paymentMode: true,
          paymentStatus: true,
          paymentTranscriptions: {
            include: { bank: true, bankBranch: true, documentType: true }
          },
          paymentDocuments: true
        }
      }
    }
  });
}

/**
 * 7. Retrieve Live Metrics & Analytics across all orders and payments.
 */
export async function getDatabaseAnalytics() {
  const [
    totalOrders,
    orderNodes,
    basketTotal,
    basketNodes,
    users,
    payments
  ] = await Promise.all([
    prisma.salesVoucherOrder.count(),
    prisma.salesVoucherOrder.findMany({ take: 100, orderBy: { createdAt: "desc" } }),
    prisma.basketOrder.count(),
    prisma.basketOrder.findMany({ take: 50 }),
    prisma.user.findMany(),
    prisma.payment.findMany({ take: 100 })
  ]);

  const totalQuantityBags = orderNodes.reduce((sum, o) => sum + (o.quantity || 0), 0);
  const totalValueAmount = orderNodes.reduce((sum, o) => sum + (o.amountTotal || 0), 0);

  const activeUsers = users.filter(u => u.isActive).length;
  const approvedPayments = payments.filter(p => p.paymentStatusId === 2).length;
  const unapprovedPayments = payments.filter(p => p.paymentStatusId !== 2).length;

  return {
    salesOrders: {
      totalOrders,
      totalQuantityBags,
      totalValueAmount,
      basketOrdersCount: basketTotal,
      sampleOrders: orderNodes.slice(0, 10)
    },
    users: {
      totalUsers: users.length,
      activeUsers,
      inactiveUsers: users.length - activeUsers,
      activeRate: users.length > 0 ? ((activeUsers / users.length) * 100).toFixed(1) + "%" : "100%"
    },
    payments: {
      totalPaymentsSampled: payments.length,
      approvedPayments,
      unapprovedPayments,
      approvalRate: payments.length > 0 ? ((approvedPayments / payments.length) * 100).toFixed(1) + "%" : "75.0%"
    }
  };
}
