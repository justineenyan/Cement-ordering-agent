import { prisma } from "../db/prisma.js";
import { DEFAULT_PRODUCT_CATALOG, LOADING_POINTS } from "../tools/supabaseDbTools.js";
import type { UiHint } from "../types/router.types.js";

/**
 * ============================================================================
 * CUSTOMER DATA & SECURITY ACCESS CONTROL SERVICE
 * ============================================================================
 * Enforces strict boundary between Customer Chat and Admin Chat:
 * - In User Chat: Users can ONLY:
 *   1. Order cement (catalog, pricing, loading points, quotation & order flow).
 *   2. Enquire about that particular user's data (their own account balance/credit,
 *      their own orders/vouchers, and their own payments).
 *   3. General cement purchasing FAQs and basic help.
 * - All other commands, administrative operations, platform-wide analytics,
 *   and cross-customer enquiries are strictly restricted to the Admin Portal.
 */

export type CustomerIntentType =
  | "RESTRICTED_ADMIN"
  | "OWN_BALANCE"
  | "OWN_ORDERS"
  | "OWN_PAYMENTS"
  | "PRODUCT_CATALOG"
  | "ORDER_MANAGEMENT"
  | "GENERAL";

export interface CustomerIntentAnalysis {
  intent: CustomerIntentType;
  specificRef?: string;
  reason?: string;
}

/**
 * Detects if the prompt contains administrative commands, platform-wide analytics,
 * or queries attempting to access system entities or other customers' records.
 */
export function isRestrictedAdminOrAnalyticsQuery(message: string): boolean {
  const text = message.toLowerCase().trim();

  // 1. Administrative Approval, Rejection, and Sign-off Commands
  const adminActionPattern =
    /\b(approve|reject|decide|sign[- ]off)\b.*\b(sales\s+order|order|payment|voucher|invoice)\b/i;
  const directDecisionPattern =
    /^\s*(approve|reject)\s+(?:sales\s+)?order\s*#?\d+\s*$/i;

  if (adminActionPattern.test(text) || directDecisionPattern.test(text)) {
    return true;
  }

  // 2. Audit, Multi-modal Vision transcription & PoP verification
  const auditPattern =
    /\b(audit|evaluate|check\s+pending\s+approvals|review\s+pending|pending\s+sales\s+orders?|audit\s+approvals?|transcribe|validate\s+(proof\s+of\s+payment|pop|receipt|image)|order\s+approval\s+agent)\b/i;
  if (auditPattern.test(text)) {
    return true;
  }

  // 3. Platform-wide Analytics, Aggregations & Business Intelligence
  const platformAnalyticsPattern =
    /\b(analytics|bi\s+report|rejection\s*rate|rejection\s*causes?|rejection\s*reasons?|why\s+are\s+orders\s+rejected|why\s+are\s+payments\s+rejected|platform\s*stats|system\s*metrics|overall\s+sales|total\s+sales\s+(across|all|platform)|top\s+customers|customer\s+rankings)\b/i;
  if (platformAnalyticsPattern.test(text)) {
    return true;
  }

  // 4. System-wide User & Entity Browsing
  const systemBrowsingPattern =
    /\b(list\s+(all\s+)?users|show\s+(all\s+)?users|active\s+users|how\s+many\s+users|total\s+users|all\s+customers|list\s+(all\s+)?customers|show\s+all\s+customer\s+balances|all\s+payments|list\s+all\s+payments|show\s+database|database\s+schema|migrations?|sql|graphql\s+query)\b/i;
  if (systemBrowsingPattern.test(text)) {
    return true;
  }

  // 5. Cross-Customer / Other Users' Data Snooping
  // e.g. "orders for customer 2", "balance of Dangote Ltd", "orders of John Doe", "customer #105"
  const crossCustomerPattern =
    /\b(orders?\s+(of|for)\s+(customer\s*#?\s*\d+|other|[a-z]+(?:\s+[a-z]+)*)|balance\s+(of|for)\s+(customer\s*#?\s*\d+|other|[a-z]+(?:\s+[a-z]+)*))\b/i;
  // Make sure it doesn't match "orders for me", "orders for my account", "my orders"
  if (crossCustomerPattern.test(text) && !/\b(me|my|mine|my\s+account|myself)\b/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Analyzes customer message to determine whether it maps to their own data,
 * cement catalog, cement ordering, or general conversation.
 */
export function analyzeCustomerIntent(message: string): CustomerIntentAnalysis {
  const text = message.toLowerCase().trim();

  // 1. Restricted check
  if (isRestrictedAdminOrAnalyticsQuery(message)) {
    return {
      intent: "RESTRICTED_ADMIN",
      reason: "Administrative actions, platform-wide analytics, and audit tasks are restricted to Admin Chat."
    };
  }

  // 2. Customer's Own Account Balance & Credit Limit
  const balancePattern =
    /\b(my\s+)?(balance|account\s+balance|credit\s+limit|available\s+credit|credit\s+status|open\s+orders|financial\s+status|how\s+much\s+(do\s+i\s+owe|credit|money)|my\s+account\s+details|check\s+my\s+credit)\b/i;
  if (balancePattern.test(text)) {
    return { intent: "OWN_BALANCE" };
  }

  // 3. Customer's Own Orders & Order Tracking
  // Specific order reference detection: e.g. "SO-1052", "SV-1052", "order 1052", "order #1052"
  const orderRefMatch = text.match(/\b(?:so|sv)[- ]?(\d+)\b/i) || text.match(/\border\s*#?\s*(\d+)\b/i);
  const isOrderQuery =
    /\b(my\s+)?(orders?|sales\s*orders?|purchases?|vouchers?|order\s+history|recent\s+orders?|track(ing)?\s+(my\s+)?order|status\s+of\s+my\s+order)\b/i.test(text) ||
    Boolean(orderRefMatch);

  // If order query is detected and it is NOT an order placement command (e.g. "order 50 bags")
  const isPurchaseQuantity = /\b\d+\s*(?:bags?|ton(?:ne)?s?|sac|trucks?)\b/i.test(text) || /\b(?:buy|purchase|place\s+order)\b/i.test(text);

  if (isOrderQuery && !isPurchaseQuantity) {
    return {
      intent: "OWN_ORDERS",
      specificRef: orderRefMatch && orderRefMatch[1] ? orderRefMatch[1] : undefined
    };
  }

  // 4. Customer's Own Payments & Receipts
  const paymentPattern =
    /\b(my\s+)?(payments?|receipts?|payment\s+history|payment\s+status|did\s+my\s+payment\s+go\s+through|check\s+my\s+payment)\b/i;
  if (paymentPattern.test(text)) {
    return { intent: "OWN_PAYMENTS" };
  }

  // 5. Product Catalog & Pricing
  const catalogPattern =
    /\b(products?|catalog|cement\s*types?|cement\s*brands?|prices?|pricing|how\s*much\s*is|plants?|loading\s*points?|depots?|factory)\b/i;
  if (catalogPattern.test(text) && !isPurchaseQuantity) {
    return { intent: "PRODUCT_CATALOG" };
  }

  // 6. Ordering Cement (hand off to Order Management Agent)
  if (isPurchaseQuantity || /\b(confirm\s+(quotation|quote|order)|cancel\s+(quotation|quote|order)|buy\s+cement)\b/i.test(text)) {
    return { intent: "ORDER_MANAGEMENT" };
  }

  // 7. General Chat fallback
  return { intent: "GENERAL" };
}

/**
 * 1. Fetches and formats that particular user's Account Balance & Credit Limit.
 * Strictly scoped to customerId. Consumes 0 Groq tokens.
 */
export async function getCustomerAccountSummary(customerId: number): Promise<{
  reply: string;
  data: any;
  suggestions: string[];
}> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    });

    if (!customer) {
      return {
        reply: `⚠️ Customer account record (#${customerId}) could not be located in our system. Please check with your representative or contact support.`,
        data: null,
        suggestions: ["I want to buy cement", "View product catalog", "Contact support"]
      };
    }

    const currency = customer.customerCurrency || "GHS";
    const balance = customer.customerAccountBalance || 0;
    const availableCredit = customer.customerAvailableCredit || 0;
    const creditLimit = customer.customerCrLimit || 0;
    const openOrders = customer.customerOpenOrders || 0;
    const status = customer.customerStatusDesc || (customer.active ? "Active" : "Inactive");

    const reply =
      `### 💼 Your Account & Credit Overview\n\n` +
      `Here is the current financial status for **${customer.customerName}** (\`${customer.customerCode}\`):\n\n` +
      `* 💰 **Account Balance:** ${currency} ${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `* 💳 **Available Credit:** ${currency} ${availableCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `* 📈 **Credit Limit:** ${currency} ${creditLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `* 📦 **Current Open Orders:** ${currency} ${openOrders.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
      `* 🟢 **Account Status:** ${status}\n\n` +
      `You are in good standing! Would you like to create a new cement quotation or review your recent orders?`;

    const data = {
      entityType: "dataPoints",
      customer: {
        id: customer.id,
        name: customer.customerName,
        code: customer.customerCode,
        currency,
        accountBalance: balance,
        availableCredit,
        creditLimit,
        openOrders,
        status
      },
      items: [
        { label: "Customer Name", value: customer.customerName },
        { label: "Account Code", value: customer.customerCode },
        { label: "Account Balance", value: `${currency} ${balance.toLocaleString()}` },
        { label: "Available Credit", value: `${currency} ${availableCredit.toLocaleString()}` },
        { label: "Credit Limit", value: `${currency} ${creditLimit.toLocaleString()}` },
        { label: "Open Orders", value: `${currency} ${openOrders.toLocaleString()}` },
        { label: "Status", value: status }
      ]
    };

    return {
      reply,
      data,
      suggestions: [
        "I want to buy cement",
        "Show my recent orders",
        "View cement pricing"
      ]
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error retrieving customer account summary:", err);
    return {
      reply: "We encountered a temporary issue retrieving your account details. Please try again shortly.",
      data: null,
      suggestions: ["Buy cement", "View product catalog"]
    };
  }
}

/**
 * 2. Fetches and formats that particular user's Orders.
 * Strictly scoped to customerId. Enforces tenant isolation.
 */
export async function getCustomerOrders(
  customerId: number,
  specificOrderRef?: string
): Promise<{
  reply: string;
  data: any;
  suggestions: string[];
  uiHint: UiHint;
}> {
  try {
    // If specific order number/id was queried:
    if (specificOrderRef) {
      const orderNum = `SO-${specificOrderRef.replace(/\D/g, "")}`;
      const voucherNum = `SV-${specificOrderRef.replace(/\D/g, "")}`;
      const numericId = parseInt(specificOrderRef.replace(/\D/g, ""), 10);

      // Verify if order exists and belongs to this customer
      const targetOrder = await prisma.salesVoucherOrder.findFirst({
        where: {
          OR: [
            { salesOrderNumber: orderNum },
            { salesOrderNumber: specificOrderRef.toUpperCase() },
            { salesVoucher: { voucherNumber: voucherNum } },
            ...(!isNaN(numericId) ? [{ id: numericId }, { salesVoucherId: numericId }] : [])
          ]
        },
        include: {
          product: true,
          location: true,
          destination: true,
          salesVoucherOrderStatus: true,
          salesVoucher: {
            include: { salesVoucherStatus: true }
          }
        }
      });

      if (!targetOrder) {
        return {
          reply: `Order **#${specificOrderRef}** was not found in your account records. Please check the order reference or view your full order history.`,
          data: null,
          suggestions: ["Show all my orders", "What is my account balance?", "Buy cement"],
          uiHint: "TEXT"
        };
      }

      // STRICT TENANT ISOLATION CHECK:
      if (targetOrder.customerId !== customerId) {
        return {
          reply: `🔒 **Access Denied:** Order **#${specificOrderRef}** belongs to another organization. For privacy and security, you can only view orders placed under your account.`,
          data: null,
          suggestions: ["Show my recent orders", "What is my balance?", "Buy cement"],
          uiHint: "TEXT"
        };
      }

      const statusDesc = targetOrder.salesVoucherOrderStatus?.description || "In Progress";
      const totalAmount = targetOrder.amountTotal || (targetOrder.quantity * (targetOrder.amountUnitPrice || 90));
      const plantName = targetOrder.location?.name || "Tema Plant";
      const destName = targetOrder.destination?.name || "Direct Customer Site";

      const reply =
        `### 📦 Order Details: ${targetOrder.salesOrderNumber}\n\n` +
        `* 🏷️ **Product:** ${targetOrder.product?.title || "Cement"}\n` +
        `* 🔢 **Quantity:** ${targetOrder.quantity} bags (50kg)\n` +
        `* 💵 **Total Amount:** GHS ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n` +
        `* 🏭 **Loading Point:** ${plantName}\n` +
        `* 🚚 **Delivery Type:** ${targetOrder.deliveryType || "EXW"} (${destName})\n` +
        `* 📋 **Order Status:** **${statusDesc}**\n` +
        `* 📅 **Created Date:** ${new Date(targetOrder.createdAt).toLocaleDateString()}\n\n` +
        `Need anything else regarding this order?`;

      return {
        reply,
        data: {
          entityType: "salesOrders",
          totalCount: 1,
          items: [{
            salesOrderId: targetOrder.id,
            salesOrderNumber: targetOrder.salesOrderNumber,
            product: targetOrder.product?.title,
            quantity: `${targetOrder.quantity} bags`,
            amountTotal: `GHS ${totalAmount.toFixed(2)}`,
            status: statusDesc,
            location: plantName,
            destination: destName,
            deliveryType: targetOrder.deliveryType,
            date: new Date(targetOrder.createdAt).toLocaleDateString()
          }]
        },
        suggestions: ["Show all my orders", "Buy cement", "What is my balance?"],
        uiHint: "DATA_TABLE"
      };
    }

    // Otherwise, retrieve all recent orders for this customer (up to 10)
    const orders = await prisma.salesVoucherOrder.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        product: true,
        location: true,
        destination: true,
        salesVoucherOrderStatus: true,
        salesVoucher: {
          include: { salesVoucherStatus: true }
        }
      }
    });

    if (orders.length === 0) {
      return {
        reply: `You currently have no orders recorded on your account. Would you like to place your first cement order now?`,
        data: null,
        suggestions: ["I want to buy cement", "View cement pricing", "What is my balance?"],
        uiHint: "TEXT"
      };
    }

    const items = orders.map((o) => {
      const statusDesc = o.salesVoucherOrderStatus?.description || o.salesVoucher?.salesVoucherStatus?.description || "In Progress";
      const total = o.amountTotal || (o.quantity * (o.amountUnitPrice || 90));
      return {
        salesOrderId: o.id,
        salesOrderNumber: o.salesOrderNumber,
        product: o.product?.title || "Cement",
        quantity: `${o.quantity} bags`,
        unitPrice: `GHS ${(o.amountUnitPrice || 90).toFixed(2)}`,
        totalAmount: `GHS ${total.toFixed(2)}`,
        status: statusDesc,
        loadingPoint: o.location?.name || "Tema Plant",
        date: new Date(o.createdAt).toLocaleDateString()
      };
    });

    let reply = `### 📋 Your Recent Cement Orders (${orders.length})\n\n`;
    reply += `Here are the latest orders placed under your account:\n\n`;
    reply += `| Order # | Product | Quantity | Total | Status | Date |\n`;
    reply += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const item of items.slice(0, 5)) {
      reply += `| **${item.salesOrderNumber}** | ${item.product} | ${item.quantity} | ${item.totalAmount} | \`${item.status}\` | ${item.date} |\n`;
    }
    reply += `\nSelect an order to view details or click below to buy more cement.`;

    return {
      reply,
      data: {
        entityType: "salesOrders",
        totalCount: orders.length,
        items
      },
      suggestions: [
        `Check order #${orders[0]?.salesOrderNumber || "1052"}`,
        "I want to buy cement",
        "What is my balance?"
      ],
      uiHint: "DATA_TABLE"
    };
  } catch (err: unknown) {
    console.error("Error retrieving customer orders:", err);
    return {
      reply: "We encountered an issue looking up your orders. Please try again in a moment.",
      data: null,
      suggestions: ["Buy cement", "View product catalog"],
      uiHint: "TEXT"
    };
  }
}

/**
 * 3. Fetches and formats that particular user's Payments & Receipts.
 * Strictly scoped to customerId.
 */
export async function getCustomerPayments(customerId: number): Promise<{
  reply: string;
  data: any;
  suggestions: string[];
}> {
  try {
    const payments = await prisma.payment.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        paymentMode: true,
        paymentStatus: true,
        salesVoucher: true
      }
    });

    if (payments.length === 0) {
      return {
        reply: "You currently have no payment transactions recorded under your account.",
        data: null,
        suggestions: ["What is my balance?", "I want to buy cement", "Show my orders"]
      };
    }

    const items = payments.map((p) => ({
      paymentId: p.id,
      paymentReference: p.paymentReference,
      amount: `GHS ${p.amount.toFixed(2)}`,
      status: p.paymentStatus?.description || "Pending",
      paymentMode: p.paymentMode?.name || "Bank Deposit",
      voucherNumber: p.salesVoucher?.voucherNumber || "N/A",
      date: new Date(p.createdAt).toLocaleDateString(),
      notes: p.rejectionComment || undefined
    }));

    let reply = `### 💳 Your Recent Payments & Deposits (${payments.length})\n\n`;
    reply += `| Payment Ref | Amount | Mode | Status | Voucher | Date |\n`;
    reply += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const item of items.slice(0, 5)) {
      reply += `| **${item.paymentReference}** | ${item.amount} | ${item.paymentMode} | \`${item.status}\` | ${item.voucherNumber} | ${item.date} |\n`;
    }
    reply += `\nAll payments are verified against official bank deposit slips by administrative staff before dispatch.`;

    return {
      reply,
      data: {
        entityType: "payments",
        totalCount: payments.length,
        items
      },
      suggestions: ["What is my balance?", "Show my orders", "I want to buy cement"]
    };
  } catch (err: unknown) {
    console.error("Error retrieving customer payments:", err);
    return {
      reply: "We encountered an issue looking up your payments. Please try again shortly.",
      data: null,
      suggestions: ["What is my balance?", "Buy cement"]
    };
  }
}

/**
 * 4. Returns verified cement product catalog and current price estimates.
 */
export function getCustomerProductCatalog(): {
  reply: string;
  data: any;
  suggestions: string[];
} {
  const reply =
    `### 🧱 KARIBU Cement Product Catalog & Pricing\n\n` +
    `We provide top-grade construction cement sourced directly from verified manufacturing plants:\n\n` +
    `* 🏆 **CEM II/A-LL 52.5R - SAC** (\`52.5N\`) — High early-strength structural cement | **GHS 110.00** / bag\n` +
    `* 🏗️ **CEM I 42.5R - SAC** (\`42.5R\`) — Standard structural engineering & multi-storey construction | **GHS 95.00** / bag\n` +
    `* 🧱 **BCONSTROI CEM II/B-M 32.5N** (\`32.5N\`) — General purpose masonry, plastering & block work | **GHS 85.00** / bag\n` +
    `* 🛡️ **GHACEM EXTRA 425N IN BAGS** (\`EXTRA\`) — High durability commercial grade | **GHS 98.00** / bag\n` +
    `* ⚡ **SUPER STRONG 425R IN BAGS** (\`SUPER_STRONG\`) — Heavy-load infrastructure grade | **GHS 102.00** / bag\n\n` +
    `**Loading Points Available:**\n` +
    `* 📍 **Tema Plant** (Greater Accra)\n` +
    `* 📍 **Takoradi Plant** (Western Region)\n` +
    `* 📍 **Kumasi Depot** (Ashanti Region)\n\n` +
    `Which cement type and quantity would you like to order today?`;

  const data = {
    entityType: "products",
    totalCount: DEFAULT_PRODUCT_CATALOG.length,
    items: DEFAULT_PRODUCT_CATALOG.map((p) => ({
      id: p.id,
      title: p.title,
      itemCode: p.itemCode,
      unit: p.standardUnit,
      estimatedPriceGHS: p.itemCode === "52.5N" ? 110 : p.itemCode === "42.5R" ? 95 : 85
    })),
    loadingPoints: LOADING_POINTS
  };

  return {
    reply,
    data,
    suggestions: [
      "Buy 50 bags of 52.5N",
      "Buy 100 bags of 42.5R",
      "Tema Plant",
      "Takoradi Plant"
    ]
  };
}
