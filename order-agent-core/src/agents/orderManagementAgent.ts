import Groq from "groq-sdk";
import "dotenv/config";
import { prisma } from "../db/prisma.js";
import {
  createOrUpdateSalesVoucher,
  voidSalesVoucher,
  confirmSalesVoucherQuotation
} from "../services/orderDbService.js";
import { formatKaribuErrorMessage } from "../utils/karibuErrorFormatter.js";

const groq = new Groq({
  apiKey: process.env.ORDER_ROUTER_KEY || process.env.GROQ_API_KEY
});

export interface OrderAgentResponse {
  reply: string;
  action?: "REPLY" | "EXECUTE_MUTATION";
  mutation?: string;
  variables?: Record<string, any>;
  status?: "COLLECTING_INFO" | "AWAITING_CONFIRMATION" | "EXECUTED" | "CANCELLED" | "ERROR";
  data?: any;
  error?: string;
}

/**
 * Full KARIBU Order Management Specification & Business Logic.
 * Derived directly from chatbot-order-assistant-spec.md.
 */
const ORDER_ASSISTANT_SYSTEM_PROMPT = `
You are the KARIBU Order Assistant AI for Heidelberg Materials.
You guide customers through creating, cancelling, amending, and paying for cement orders.

=== OPERATING RULES ===
1. Step order for new orders:
   a. Loading Point (Tema Plant = 12, Takoradi Plant = 13, Kumasi Depot = 14, CIMBENIN = 1).
   b. Delivery Type (DELIVERED or EXW). If DELIVERED, destination is required.
   c. Products & Quantities: You already have the complete product catalog. Map customer product names to catalog IDs internally. Default trucks/sales orders count = 1.
   d. Summarize full order details and get explicit user confirmation ("yes" / "confirm").
   e. When confirmed, output action: "EXECUTE_MUTATION" with upsertSalesVoucher.
2. ABSOLUTELY CRITICAL: NEVER ASK THE CUSTOMER FOR PRODUCT IDS OR DATABASE IDS!
   The customer is an end buyer. They will say things like "CEM I 52.5N" or "42.5 cement" or "Ghacem Extra".
   You must resolve this to the product ID internally (e.g. CEM I 52.5N = ID 23).
   NEVER reply asking "Could you please provide the product ID". Always reply using the product's friendly name and confirm the quantity and loading point.
3. Unit wording: Products in Kg are counted in "bags"; otherwise in "tons".
4. If user wants to cancel an order, check voucher status (void for quotation/pending; request cancellation for SOGenerated).
5. DO NOT call any functions or tools. Output ONLY a raw JSON object string directly starting with { and ending with }.

=== PRODUCT CATALOG (MAP NAMES TO IDS INTERNALLY - NEVER ASK FOR PRODUCT IDS) ===
- ID 23: "CEM II/A-LL 52.5R - SAC" (matches: "CEM I 52.5N", "52.5N", "52.5R", "52.5", "CEM 52.5")
- ID 22: "CEM I 42.5R - SAC" (matches: "CEM I 42.5", "42.5R", "42.5")
- ID 51: "CEM II/B-LL 42.5R - SAC"
- ID 50: "SUPERCPJ45-SAC" / "Super CPJ 45"
- ID 41: "BFORTE CEM II/B-M 42.5N" / "BFORTE"
- ID 40: "BCONSTROI CEM II/B-M 32.5N" / "BCONSTROI"
- ID 33: "GHACEM EXTRA 425N IN BAGS" / "Ghacem Extra"
- ID 34: "SUPER STRONG 425R IN BAGS" / "Super Strong"
- ID 25: "CEM I 42.5N Bagged Ordinary Portland Cement"
- ID 46: "SUPER CPJ 45"
- ID 47: "SUPER CPA 45"
- ID 13: "CEM II/B-LL 42,5 R"
- ID 32: "SUPER RAPID 325R IN BAGS"
(Default to ID 23 for 52.5N; ID 22 for 42.5; ID 41 for general cement).

LOADING POINTS (sourceLocationId):
- Tema Plant: 12
- Takoradi Plant: 13
- Kumasi Depot: 14
- CIMBENIN / Cotonou: 1

=== MUTATIONS & SCHEMAS ===
1. UpsertSalesVoucher:
mutation UpsertSalesVoucher($input: UpsertSalesVoucherInput!) {
  upsertSalesVoucher(input: $input) {
    salesVoucher { id orderQuote voucherNumber }
  }
}

Variables format:
{
  "input": {
    "companyId": 3,
    "sourceLocationId": 12,
    "isDeliveryInclusive": true,
    "localPurchaseOrder": "LPO-001",
    "comments": "Special handling",
    "salesVoucherItemInputs": [
      {
        "productId": 23,
        "quantity": 50,
        "trucksCount": 1,
        "sourceLocationId": 12,
        "isDeliveryInclusive": true,
        "destinationId": 88
      }
    ]
  }
}
NOTE: Use "sourceLocationId" (NEVER "loadingPointId"), "isDeliveryInclusive" boolean (NEVER "deliveryType"), "salesVoucherItemInputs" (NEVER "items").

2. deleteSalesVoucher:
mutation DeleteSalesVoucher($input: VoidSalesVoucherInput!) {
  voidSalesVoucher(input: $input) {
    salesVoucher { id }
  }
}

=== RESPONSE FORMAT ===
Output a JSON object matching this schema:
{
  "action": "REPLY" | "EXECUTE_MUTATION",
  "reply": "natural language response to user",
  "status": "COLLECTING_INFO" | "AWAITING_CONFIRMATION" | "EXECUTED" | "CANCELLED" | "ERROR",
  "mutation": "GraphQL mutation string or null",
  "variables": {}
}
`;

export interface ResolvedProduct {
  id: number;
  title: string;
}

export const CATALOG_PRODUCTS: ResolvedProduct[] = [
  { id: 23, title: "CEM II/A-LL 52.5R - SAC" },
  { id: 22, title: "CEM I 42.5R - SAC" },
  { id: 51, title: "CEM II/B-LL 42.5R - SAC" },
  { id: 50, title: "SUPERCPJ45-SAC" },
  { id: 41, title: "BFORTE CEM II/B-M 42.5N" },
  { id: 40, title: "BCONSTROI CEM II/B-M 32.5N" },
  { id: 33, title: "GHACEM EXTRA 425N IN BAGS" },
  { id: 34, title: "SUPER STRONG 425R IN BAGS" },
  { id: 25, title: "CEM I 42.5N Bagged Ordinary Portland Cement" },
  { id: 46, title: "SUPER CPJ 45" },
  { id: 47, title: "SUPER CPA 45" },
  { id: 32, title: "SUPER RAPID 325R IN BAGS" }
];

let liveProductsCache: Array<{ id: number; title: string }> = [];

/**
 * Dynamically queries KARIBU GraphQL for products, falling back to static catalog.
 */
export async function queryKaribuProducts(countryId: number = 7, _accessToken?: string): Promise<Array<{ id: number; title: string }>> {
  if (liveProductsCache.length > 0) return liveProductsCache;
  try {
    const products = await prisma.product.findMany({
      where: { company: { countryId } },
      select: { id: true, title: true, itemCode: true },
      take: 50
    });
    if (products && products.length > 0) {
      liveProductsCache = products.map(p => ({ id: p.id, title: p.title }));
      return liveProductsCache;
    }
  } catch {
    // Fallback to static catalog
  }
  return CATALOG_PRODUCTS;
}

/**
 * Resolves natural language trade names (e.g. "CEM I 52.5N", "BFORTE") to exact product catalog entry.
 */
export function resolveProduct(nameOrText: string): ResolvedProduct {
  const lower = String(nameOrText).toLowerCase();
  if (/\b52\.?5\b/i.test(lower)) return CATALOG_PRODUCTS[0]!;
  if (/\b42\.?5\b/i.test(lower)) return CATALOG_PRODUCTS[1]!;
  if (/\b32\.?5\b/i.test(lower)) return CATALOG_PRODUCTS[5]!;
  if (/ghacem\s*extra/i.test(lower)) return CATALOG_PRODUCTS[6]!;
  if (/super\s*strong/i.test(lower)) return CATALOG_PRODUCTS[7]!;
  if (/super\s*cpj/i.test(lower) || /cpj\s*45/i.test(lower)) return CATALOG_PRODUCTS[3]!;
  if (/bforte/i.test(lower)) return CATALOG_PRODUCTS[4]!;
  if (/bconstroi/i.test(lower)) return CATALOG_PRODUCTS[5]!;
  return CATALOG_PRODUCTS[0]!;
}

function resolveProductIdByName(nameOrText: string): number {
  return resolveProduct(nameOrText).id;
}

interface OrderHistoryMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

let orderConversationHistory: OrderHistoryMessage[] = [
  { role: "system", content: ORDER_ASSISTANT_SYSTEM_PROMPT }
];

export function resetOrderConversation() {
  orderConversationHistory = [
    { role: "system", content: ORDER_ASSISTANT_SYSTEM_PROMPT }
  ];
}

/**
 * Automatically sanitizes and maps legacy or misnamed LLM fields into
 * strict HotChocolate GraphQL UpsertSalesVoucherInput schema.
 */
function sanitizeMutationVariables(mutation: string, variables: any): any {
  if (!variables || typeof variables !== "object") return variables;

  if (/upsertSalesVoucher/i.test(mutation)) {
    const rawInput = variables.input || variables;
    const cleanInput: Record<string, any> = { ...rawInput };

    // 1. Map loadingPointId -> sourceLocationId
    if (cleanInput.loadingPointId !== undefined && cleanInput.sourceLocationId === undefined) {
      cleanInput.sourceLocationId = typeof cleanInput.loadingPointId === "number"
        ? cleanInput.loadingPointId
        : parseInt(String(cleanInput.loadingPointId), 10) || 1;
    }
    delete cleanInput.loadingPointId;

    if (cleanInput.sourceLocationId === undefined) {
      cleanInput.sourceLocationId = 1;
    } else if (typeof cleanInput.sourceLocationId === "string") {
      cleanInput.sourceLocationId = parseInt(cleanInput.sourceLocationId, 10) || 1;
    }

    // 2. Map deliveryType -> isDeliveryInclusive (Boolean)
    if (cleanInput.deliveryType !== undefined && cleanInput.isDeliveryInclusive === undefined) {
      if (typeof cleanInput.deliveryType === "boolean") {
        cleanInput.isDeliveryInclusive = cleanInput.deliveryType;
      } else if (typeof cleanInput.deliveryType === "string") {
        cleanInput.isDeliveryInclusive = /delivered/i.test(cleanInput.deliveryType);
      }
    }
    delete cleanInput.deliveryType;

    if (cleanInput.isDeliveryInclusive === undefined) {
      cleanInput.isDeliveryInclusive = true;
    }

    // 3. Ensure companyId
    if (cleanInput.companyId === undefined) {
      cleanInput.companyId = 3;
    } else if (typeof cleanInput.companyId === "string") {
      cleanInput.companyId = parseInt(cleanInput.companyId, 10) || 3;
    }

    // 4. Map items -> salesVoucherItemInputs
    const rawItems = cleanInput.salesVoucherItemInputs || cleanInput.items || [];
    delete cleanInput.items;

    cleanInput.salesVoucherItemInputs = (Array.isArray(rawItems) ? rawItems : [rawItems]).map((item: any) => {
      const cleanItem: Record<string, any> = { ...item };

      // productId: ensure valid integer; auto-resolve if missing or name
      if (cleanItem.productId !== undefined) {
        if (typeof cleanItem.productId === "number" && !isNaN(cleanItem.productId)) {
          // valid
        } else if (typeof cleanItem.productId === "string") {
          const parsedId = parseInt(cleanItem.productId, 10);
          cleanItem.productId = !isNaN(parsedId) ? parsedId : resolveProductIdByName(cleanItem.productId);
        } else {
          cleanItem.productId = 23;
        }
      } else {
        cleanItem.productId = resolveProductIdByName(JSON.stringify(rawInput));
      }

      // quantity
      if (cleanItem.quantity !== undefined) {
        cleanItem.quantity = typeof cleanItem.quantity === "number"
          ? cleanItem.quantity
          : parseFloat(String(cleanItem.quantity)) || 50;
      } else {
        cleanItem.quantity = 50;
      }

      // trucksCount
      if (cleanItem.trucksCount === undefined) {
        cleanItem.trucksCount = cleanItem.trucks || cleanItem.truckCount || cleanItem.numberOfSalesOrders || 1;
      }
      if (typeof cleanItem.trucksCount === "string") {
        cleanItem.trucksCount = parseInt(cleanItem.trucksCount, 10) || 1;
      }

      // sourceLocationId
      if (cleanItem.sourceLocationId === undefined && cleanInput.sourceLocationId !== undefined) {
        cleanItem.sourceLocationId = cleanInput.sourceLocationId;
      }

      // isDeliveryInclusive
      if (cleanItem.isDeliveryInclusive === undefined && cleanInput.isDeliveryInclusive !== undefined) {
        cleanItem.isDeliveryInclusive = cleanInput.isDeliveryInclusive;
      }

      // Remove non-existent fields on SalesVoucherItemInput
      delete cleanItem.trucks;
      delete cleanItem.truckCount;
      delete cleanItem.numberOfSalesOrders;
      delete cleanItem.deliveryType;
      delete cleanItem.loadingPointId;

      return cleanItem;
    });

    return { ...variables, input: cleanInput };
  }

  return variables;
}

/**
 * Order Management Agent: Guides customer through creating, amending, cancelling, or paying for orders.
 */
export async function handleOrderManagementIntent(
  userPrompt: string,
  accessToken?: string
): Promise<OrderAgentResponse> {
  try {
    // Check for conversational reset
    if (/^(start over|reset order|new order|restart)$/i.test(userPrompt.trim())) {
      resetOrderConversation();
      return {
        reply: "Order session has been reset. How can I help you? (e.g., 'I want to buy cement', 'Cancel order SV-101', 'Change delivery date', 'Make a payment')",
        status: "COLLECTING_INFO"
      };
    }

    orderConversationHistory.push({ role: "user", content: userPrompt });

    // Keep context window bounded
    if (orderConversationHistory.length > 20) {
      orderConversationHistory.splice(1, orderConversationHistory.length - 19);
    }

    // Attempt to warm products catalog from KARIBU GraphQL
    queryKaribuProducts(7, accessToken).catch(() => {});

    // Resolve product from user request
    const matchedProduct = resolveProduct(userPrompt);

    // Provide immediate turn context so model never asks for product ID and never emits tool call
    const dynamicTurnContext = {
      role: "system" as const,
      content: `CURRENT REQUEST CONTEXT:
- Detected product in user request: "${matchedProduct.title}" (Product ID: ${matchedProduct.id}).
- NEVER ask the customer for a product ID or database ID. The customer is a buyer; product IDs are resolved internally.
- DO NOT invoke tools or emit tool calls (do NOT output {"name": "assistant", ...}). Output ONLY a raw JSON object string directly.`
    };

    const messagesToSend = [...orderConversationHistory, dynamicTurnContext];

    let content: string | undefined;

    const model = process.env.ORDER_ROUTER_MODEL || "openai/gpt-oss-20b";
    let attempts = 0;
    while (attempts < 2) {
      try {
        const response = await groq.chat.completions.create({
          model,
          messages: messagesToSend,
          temperature: 0.1,
          response_format: { type: "json_object" }
        });

        content = response.choices[0]?.message?.content?.trim();
        break;
      } catch (apiErr: any) {
        attempts++;
        const isRateLimit = apiErr?.status === 429 || String(apiErr?.message).includes("429") || String(apiErr?.message).includes("rate_limit");
        if (isRateLimit && attempts < 2) {
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }

        // Handle Groq tool_use_failed: extract generated payload from failed_generation
      const failedGen =
        apiErr?.error?.error?.failed_generation ||
        apiErr?.error?.failed_generation ||
        apiErr?.failed_generation;

      if (failedGen) {
        try {
          const parsedTool = typeof failedGen === "string" ? JSON.parse(failedGen) : failedGen;
          if (parsedTool.arguments) {
            content = typeof parsedTool.arguments === "string"
              ? parsedTool.arguments
              : JSON.stringify(parsedTool.arguments);
          } else {
            content = typeof failedGen === "string" ? failedGen : JSON.stringify(failedGen);
          }
        } catch {
          const match = String(failedGen).match(/\{[\s\S]*"action"[\s\S]*\}/);
          if (match) {
            content = match[0];
          } else {
            throw apiErr;
          }
        }
      } else {
        throw apiErr;
      }
    }
    }
    if (!content) {
      return {
        reply: "I encountered an issue processing your order request. Please try again.",
        status: "ERROR"
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        reply: content,
        status: "COLLECTING_INFO"
      };
    }

    // Intercept and strictly forbid asking the customer for product IDs
    if (parsed.reply && /\b(?:provide|enter|give|what is|need)\s+(?:the\s+)?product\s*id\b/i.test(parsed.reply)) {
      parsed.reply = `I have matched your request to ${matchedProduct.title} (Product ID: ${matchedProduct.id}). Which loading point would you prefer (Tema Plant, Takoradi Plant, or Kumasi Depot), and will this be delivered or pickup (EXW)?`;
      parsed.status = "COLLECTING_INFO";
    } else if (parsed.reply && /product\s*id\s*for/i.test(parsed.reply)) {
      parsed.reply = `I have selected ${matchedProduct.title} for your order. Which loading point would you like to use (Tema Plant, Takoradi Plant, or Kumasi Depot), and should this be delivered or self-pickup?`;
      parsed.status = "COLLECTING_INFO";
    }

    // If the agent decided to execute an order mutation after user confirmation
    if (parsed.action === "EXECUTE_MUTATION" && parsed.mutation) {
      const mutation = parsed.mutation;
      const rawVariables = parsed.variables || {};
      const variables = sanitizeMutationVariables(mutation, rawVariables);

      try {
        let resultData: any;
        if (/upsertSalesVoucher/i.test(mutation)) {
          const voucher = await createOrUpdateSalesVoucher(variables.input);
          resultData = {
            upsertSalesVoucher: {
              salesVoucher: {
                id: voucher?.id,
                orderQuote: voucher?.orderQuote,
                voucherNumber: voucher?.voucherNumber,
                salesVoucherStatusId: voucher?.salesVoucherStatusId,
                salesVoucherOrders: voucher?.salesVoucherOrders
              }
            }
          };
        } else if (/voidSalesVoucher|deleteSalesVoucher/i.test(mutation)) {
          const voucherId = variables.input?.salesVoucherId || variables.input?.id;
          const cancelled = await voidSalesVoucher(voucherId, variables.input?.cancellationReason);
          resultData = {
            voidSalesVoucher: {
              salesVoucher: {
                id: cancelled.id,
                salesVoucherStatusId: cancelled.salesVoucherStatusId
              }
            }
          };
        } else if (/confirmSalesVoucherQuotation|ConfirmQuotation/i.test(mutation)) {
          const voucherId = variables.input?.id || variables.input?.salesVoucherId;
          await confirmSalesVoucherQuotation(voucherId);
          resultData = {
            confirmSalesVoucherQuotation: {
              boolean: true
            }
          };
        } else {
          const voucher = await createOrUpdateSalesVoucher(variables.input);
          resultData = { upsertSalesVoucher: { salesVoucher: voucher } };
        }

        const successReply = parsed.reply || "Your order request has been successfully created in the Supabase database!";
        orderConversationHistory.push({
          role: "assistant",
          content: JSON.stringify({
            action: "REPLY",
            reply: successReply,
            status: "EXECUTED"
          })
        });

        return {
          reply: successReply,
          status: "EXECUTED",
          action: "EXECUTE_MUTATION",
          mutation,
          variables,
          data: resultData
        };
      } catch (err: any) {
        const errorMsg = err.message || "Failed to execute order in Supabase database";
        const formatted = formatKaribuErrorMessage(errorMsg);
        const failureReply = formatted.friendlyMessage;

        orderConversationHistory.push({
          role: "assistant",
          content: JSON.stringify({
            action: "REPLY",
            reply: failureReply,
            status: "ERROR"
          })
        });

        return {
          reply: failureReply,
          status: "ERROR",
          mutation,
          variables,
          error: errorMsg
        };
      }
    }

    // Normal conversational reply / info gathering
    const reply = parsed.reply || "Could you please provide more details for your order?";
    orderConversationHistory.push({
      role: "assistant",
      content: JSON.stringify(parsed)
    });

    return {
      reply,
      status: parsed.status || "COLLECTING_INFO",
      action: "REPLY"
    };

  } catch (err: any) {
    console.error("Order Management Agent error:", err);
    const formatted = formatKaribuErrorMessage(err.message || String(err));
    return {
      reply: formatted.friendlyMessage,
      status: "ERROR",
      error: formatted.friendlyMessage
    };
  }
}
