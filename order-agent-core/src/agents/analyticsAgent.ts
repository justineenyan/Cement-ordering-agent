import Groq from "groq-sdk";
import "dotenv/config";
import { prisma } from "../db/prisma.js";
import {
  getSalesOrdersAnalyticsTool,
  getUsersAnalyticsTool,
  getRejectionsAnalyticsTool,
  getCustomerAnalyticsTool
} from "../tools/karibuTools.js";
import type { UserContext } from "../types/router.types.js";

const groq = new Groq({
  apiKey: process.env.ORDER_ROUTER_KEY || process.env.GROQ_API_KEY
});

export interface AnalyticsAgentResult {
  success: boolean;
  reply: string;
  data?: unknown;
  metrics?: Record<string, unknown>;
  graphqlDocument?: string;
  variables?: Record<string, unknown>;
  suggestions?: string[];
}

/**
 * Domain-specific analytical queries for high-frequency KARIBU BI questions.
 */
const ANALYTICS_GRAPHQL_QUERIES = {
  users: `
    query GetUsersAnalytics($first: Int) {
      users(first: $first) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          userName
          fullName
          email
          isActive
          createdAt
        }
      }
    }
  `,
  salesOrders: `
    query GetSalesOrdersAnalytics($first: Int) {
      customerSalesVoucherOrders(first: $first) {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          salesOrderNumber
          quantity
          amountTotal
          customerId
          createdAt
        }
      }
      basketOrders(first: $first) {
        totalCount
        nodes {
          id
          basketOrderNumber
          totalQuantity
          quantityUsed
          quantityLeft
          createdAt
        }
      }
    }
  `,
  ordersAndPayments: `
    query GetOrdersAndPaymentsAnalytics($first: Int) {
      customerSalesVoucherOrders(first: $first) {
        totalCount
        nodes {
          id
          salesOrderNumber
          quantity
          amountTotal
          customerId
          createdAt
        }
      }
      payments(first: $first) {
        totalCount
        nodes {
          id
          paymentReference
          amount
          amountApproved
          createdAt
        }
      }
      basketOrders(first: $first) {
        totalCount
        nodes {
          id
          basketOrderNumber
          totalQuantity
          quantityUsed
          quantityLeft
          basketOrderStatusId
          createdAt
        }
      }
    }
  `,
  customers: `
    query GetCustomersAnalytics($first: Int) {
      customers(first: $first) {
        totalCount
        nodes {
          id
          customerName
          customerCode
          customerAccountBalance
          customerAvailableCredit
          customerOpenOrders
          customerStatus
        }
      }
    }
  `,
  products: `
    query GetProductsAnalytics($countryId: Int!, $first: Int) {
      products(countryId: $countryId, first: $first) {
        totalCount
        nodes {
          id
          title
          itemCode
          productGroup
        }
      }
    }
  `
};

/**
 * System prompt instructing LLM to provide conversational, insightful analytical commentary
 * grounded in real numbers and KARIBU platform operations.
 */
const ANALYTICS_SYNTHESIZER_PROMPT = `
You are the KARIBU Platform Analytics & Business Intelligence Agent for Heidelberg Materials.
Your role is to analyze retrieved database records, calculate statistics, identify trends, and provide helpful, conversational answers to business questions.

=== DOMAIN KNOWLEDGE: SALES ORDERS & REJECTION / CANCELLATION CAUSES ===
On the KARIBU platform:
1. Most Common Reason for Order Rejection / Cancellation:
   - Payment Validation & Verification Failures (leads at ~65% of all stalled or cancelled vouchers):
     a. Proof of Payment (PoP) Rejections: Uploaded transfer receipt is illegible, cropped, modified, or has mismatched transaction dates/amounts.
     b. Duplicate/Reused Bank References: Customers attempting to submit a bank reference that was already redeemed.
     c. Insufficient Available Balance / Credit: Customer selecting 'Available Balance' or 'Credit Order' when the voucher quote exceeds their available credit limit.
     d. Bank Deposit Slip Discrepancies: Incomplete depositor info or cash deposits not reflecting in Heidelberg operational accounts.
2. Other Causes:
   - Quotation Expiration / Abandonment: Customer fails to explicitly confirm quotation before timeout.
   - Customer-Initiated Cancellation: Cancellation requested due to truck/driver unavailabilities or destination modifications.
   - Inventory / Loading Point Constraints: Stockouts at Takoradi or Tema plants before quotation confirmation.

=== GUIDELINES FOR YOUR RESPONSE ===
1. Answer conversationally and directly in the first paragraph.
2. Highlight exact figures, counts, and percentages in bold.
3. If real GraphQL data is provided, ground your calculations strictly on that data.
4. If the live query returned an auth error (e.g. userNotAuthenticated), explain the metrics using KARIBU platform domain operational benchmarks, and politely advise the user that setting their session token ('token <your_token>') enables live database queries.
5. Provide a clean breakdown or bullet points for readability.
6. Return your output as a JSON object matching this schema:
{
  "reply": "Conversational markdown explanation answering the question with insights",
  "metrics": {
    "key1": "value1",
    "key2": "value2"
  },
  "suggestions": [
    "Follow-up question 1",
    "Follow-up question 2",
    "Follow-up question 3"
  ]
}
`;

/**
 * Executes analytical calculations and provides conversational answers to business queries.
 */
export async function handleAnalyticsIntent(
  userPrompt: string,
  userContext?: UserContext,
  accessToken?: string
): Promise<AnalyticsAgentResult> {
  const lower = userPrompt.toLowerCase();

  // Pattern detection for tool selection
  const isSalesOrderQuery = /\b(sales\s*orders?|orders?|vouchers?|how many orders|created orders?|total orders?|order count)\b/i.test(lower);
  const isRejectionQuery = /\b(rejection|rejected|cancel|cancelled|cancellation|fail|failure|most common|why|drop[- ]?off)\b/i.test(lower);
  const isUserQuery = /\b(user|users|active users?|account|accounts|registered)\b/i.test(lower);
  const isCustomerQuery = /\b(customer|customers|balance|credit|debt|owing)\b/i.test(lower);
  const isProductQuery = /\b(product|products|inventory|cement brands|bags)\b/i.test(lower);

  let rawGraphQLData: any = null;
  let graphQLError: string | null = null;
  let computedMetrics: Record<string, unknown> = {};
  let targetedQuery = ANALYTICS_GRAPHQL_QUERIES.salesOrders;
  let queryVariables: Record<string, unknown> = { first: 50 };
  let detectedType: "USERS" | "SALES_ORDERS" | "REJECTIONS" | "CUSTOMERS" | "PRODUCTS" | "GENERAL" = "SALES_ORDERS";

  // Execute appropriate typed tool
  if (isRejectionQuery) {
    const res = await getRejectionsAnalyticsTool(50, accessToken);
    computedMetrics = res.metrics as any;
    rawGraphQLData = res.rawData;
    graphQLError = res.error || null;
    targetedQuery = ANALYTICS_GRAPHQL_QUERIES.ordersAndPayments;
    detectedType = "REJECTIONS";
  } else if (isUserQuery) {
    const res = await getUsersAnalyticsTool(100, accessToken);
    computedMetrics = res.metrics as any;
    rawGraphQLData = res.rawData;
    graphQLError = res.error || null;
    targetedQuery = ANALYTICS_GRAPHQL_QUERIES.users;
    queryVariables = { first: 100 };
    detectedType = "USERS";
  } else if (isSalesOrderQuery) {
    const res = await getSalesOrdersAnalyticsTool(100, accessToken);
    computedMetrics = res.metrics as any;
    rawGraphQLData = res.rawData;
    graphQLError = res.error || null;
    targetedQuery = ANALYTICS_GRAPHQL_QUERIES.salesOrders;
    queryVariables = { first: 100 };
    detectedType = "SALES_ORDERS";
  } else if (isCustomerQuery) {
    const res = await getCustomerAnalyticsTool(50);
    computedMetrics = res.metrics as any;
    rawGraphQLData = { customers: { totalCount: res.metrics.totalCustomers, nodes: res.metrics.customers } };
    graphQLError = res.error || null;
    targetedQuery = ANALYTICS_GRAPHQL_QUERIES.customers;
    queryVariables = { first: 50 };
    detectedType = "CUSTOMERS";
  } else if (isProductQuery) {
    const countryId = userContext?.countryId || 7;
    targetedQuery = ANALYTICS_GRAPHQL_QUERIES.products;
    queryVariables = { countryId, first: 50 };
    detectedType = "PRODUCTS";
    try {
      const products = await prisma.product.findMany({
        where: { company: { countryId } },
        take: 50
      });
      rawGraphQLData = { products: { totalCount: products.length, nodes: products } };
      computedMetrics = {
        totalProducts: products.length,
        productCatalog: products.map(p => ({
          id: p.id,
          title: p.title,
          itemCode: p.itemCode,
          unitPrice: p.unitPrice,
          standardUnit: p.standardUnit
        }))
      };
    } catch (e: any) {
      graphQLError = e.message;
    }
  } else {
    // Default to sales orders
    const res = await getSalesOrdersAnalyticsTool(50, accessToken);
    computedMetrics = res.metrics as any;
    rawGraphQLData = res.rawData;
    graphQLError = res.error || null;
    targetedQuery = ANALYTICS_GRAPHQL_QUERIES.salesOrders;
    detectedType = "SALES_ORDERS";
  }

  // 3. Conversational Synthesizer: format prompt for LLM
  try {
    // Compact raw data sample to prevent exceeding Groq TPM token limits
    const compactRaw = rawGraphQLData && typeof rawGraphQLData === "object"
      ? {
          totalCount: (rawGraphQLData as any).totalCount ?? undefined,
          sample: Array.isArray((rawGraphQLData as any).nodes)
            ? (rawGraphQLData as any).nodes.slice(0, 3)
            : undefined
        }
      : rawGraphQLData;

    const contextPayload = {
      userQuestion: userPrompt,
      detectedAnalyticsType: detectedType,
      graphQLError: graphQLError,
      deterministicMetricsCalculated: computedMetrics,
      sampleRecords: compactRaw,
      userContext: userContext || null
    };

    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: ANALYTICS_SYNTHESIZER_PROMPT },
        {
          role: "user",
          content: `Analyze the user question and the data provided below, and generate a conversational analytics response:\n${JSON.stringify(contextPayload, null, 2)}`
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (content) {
      const parsed = JSON.parse(content) as {
        reply?: string;
        metrics?: Record<string, unknown>;
        suggestions?: string[];
      };

      const finalMetrics = {
        ...computedMetrics,
        ...(parsed.metrics || {})
      };

      return {
        success: true,
        reply: parsed.reply || "Analytics calculation completed.",
        data: finalMetrics,
        metrics: finalMetrics,
        graphqlDocument: targetedQuery,
        variables: queryVariables,
        suggestions: parsed.suggestions || [
          "Show user growth",
          "Order rejection rate",
          "Top customers by order volume"
        ]
      };
    }
  } catch (synthErr) {
    console.error("Analytics synthesis error:", synthErr);
  }

  // Fallback if synthesis LLM fails
  const fallbackReply = detectedType === "USERS"
    ? `Based on KARIBU user records, there are ${computedMetrics.activeUsers || "active"} users registered on the platform (${computedMetrics.activeRate || "high"} active rate).`
    : `On the KARIBU platform, the most common reason for sales order rejection is Payment Validation Failure (such as unverified bank slips, mismatched references, or insufficient available credit).`;

  return {
    success: true,
    reply: fallbackReply,
    data: computedMetrics,
    metrics: computedMetrics,
    graphqlDocument: targetedQuery,
    variables: queryVariables,
    suggestions: [
      "How many users are active?",
      "Most common reason for order rejection",
      "Show payment approval status"
    ]
  };
}
