import Groq from "groq-sdk";
import "dotenv/config";
import { executeKaribuGraphQL, type GraphQLResponse } from "../services/karibuGraphQL.js";
import { formatKaribuErrorMessage } from "../utils/karibuErrorFormatter.js";

const groq = new Groq({
  apiKey: process.env.ORDER_ROUTER_KEY || process.env.GROQ_API_KEY
});

export interface GraphQLAgentResult {
  success: boolean;
  operationType: "QUERY" | "MUTATION";
  graphqlDocument?: string;
  variables?: Record<string, any>;
  data?: any;
  error?: string;
  explanation?: string;
}

/**
 * Validated KARIBU GraphQL Domain Schema & Operation Guidelines.
 * Embedded directly to avoid fragile runtime introspection and cache dependencies.
 */
const KARIBU_SYSTEM_PROMPT = `
You are the KARIBU GraphQL Engineering Agent for Heidelberg Materials (cement distribution & logistics).
Your task is to accurately translate natural language requests into valid, executable GraphQL queries and variables for the KARIBU GraphQL API.

=== VALIDATED KARIBU GRAPHQL SCHEMA SPECIFICATION ===

1. ROOT QUERY OPERATIONS:
   - basketOrdersByCustomer(customerId: Int!, first: Int, after: String, where: BasketFilterInput): BasketOrdersByCustomerConnection
   - basketOrders(first: Int, after: String, where: BasketFilterInput): BasketOrdersConnection
   - customerBasketOrders(first: Int, after: String, where: BasketFilterInput): CustomerBasketOrdersConnection
   - customerSalesVoucherOrders(startDate: DateTime, endDate: DateTime, first: Int, where: SalesVoucherOrderFilterInput): CustomerSalesVoucherOrdersConnection
   - salesVoucherOrders(first: Int, where: SalesVoucherOrderFilterInput): SalesVoucherOrdersConnection
   - users(first: Int, after: String, where: UserFilterInput): UsersConnection
   - userById(id: Int!): User
   - userByEmail(email: String!): User
   - userProfile: User
   - customers(first: Int, after: String, where: CustomerFilterInput): CustomersConnection
   - customerById(id: String!): Customer
   - products(countryId: Int!, first: Int, after: String, where: ProductFilterInput): ProductsConnection
   - payments(first: Int, after: String, where: PaymentFilterInput): PaymentsConnection
   - userPayments(first: Int, where: PaymentFilterInput): UserPaymentsConnection
   - userTransactions(startDate: DateTime, endDate: DateTime, first: Int): UserTransactionsConnection
   - countries(where: CountryFilterInput): [Country!]! (Direct list, not connection)
   - languages: [Language!]! (Direct list, not connection)
   - companies(countryId: Int!, first: Int, after: String): CompaniesConnection

2. OBJECT TYPES & EXACT FIELD NAMES:
   - User:
     * id: String!
     * userName: String!  <-- NOTE: CamelCase "userName", NEVER "username"!
     * fullName: String
     * email: String
     * phoneNumber: String
     * isActive: Boolean
     * createdAt: DateTime
   - Basket (Basket Orders):
     * id: Int!
     * basketOrderNumber: String!
     * totalQuantity: Decimal!
     * quantityUsed: Decimal!
     * quantityLeft: Decimal!
     * salesVoucherCount: Int!
     * customerId: Int!
     * companyId: Int!
     * basketOrderStatusId: Int!
     * createdAt: DateTime
   - SalesVoucherOrder:
     * id: Int!
     * salesOrderNumber: String
     * quantity: Decimal
     * amountTotal: Decimal
     * customerId: Int
     * salesOrderCreated: DateTime
     * createdAt: DateTime
   - Customer:
     * id: Int!
     * customerName: String!
     * customerCode: String!
     * email: String
     * phoneNumber: String
     * customerAccountBalance: Decimal
     * customerAvailableCredit: Decimal
     * customerOpenOrders: Int
     * customerStatus: String
   - Product:
     * id: Int!
     * title: String!
     * itemCode: String!
     * productGroup: String
     * description: String
   - Payment:
     * id: Int!
     * paymentReference: String!
     * amount: Decimal!
     * amountApproved: Decimal
     * transactionId: String
     * createdAt: DateTime
   - Country:
     * id: Int!
     * name: String!
     * alpha2: String!
     * alpha3: String!
     * callingCode: String
   - Language:
     * id: Int!
     * lang: String!
     * code: String!

=== CRITICAL HOTCHOCOLATE & RELAY RULES ===

1. RELAY CONNECTION NAVIGATION:
   - If an operation returns a type ending in "Connection" (e.g. UsersConnection, BasketOrdersByCustomerConnection, ProductsConnection, CustomersConnection):
     You MUST query the entity fields inside "nodes { ... }", and ALWAYS include "pageInfo { hasNextPage endCursor }".
     NEVER query fields directly on the connection root!
     
     CORRECT:
     query GetUsers($first: Int, $after: String) {
       users(first: $first, after: $after) {
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
         }
       }
     }

     WRONG:
     users(first: 5) { userName }  <-- WILL FAIL WITH "Field does not exist on UsersConnection"

2. DIRECT LIST NAVIGATION:
   - For queries returning a direct list like "countries" or "languages", do NOT use nodes:
     query { countries { id name alpha2 alpha3 } }
     query { languages { id lang code } }

3. USER & ENTITY SEARCH (NAME vs EMAIL):
   - ONLY use "userByEmail" when an actual email address containing "@" is explicitly provided (e.g. "bismark.owusu.ext@heidelbergmaterials.com").
   - To find or search a user by NAME or keyword (e.g. "find a user called Bismark", "search user Clarence"):
     There is NO "userByName" root query! You MUST use the "users" query with a "where" filter on "fullName" and "userName":
     query SearchUsers($where: UserFilterInput, $first: Int) {
       users(where: $where, first: $first) {
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
           phoneNumber
           isActive
         }
       }
     }
     Variables:
     {
       "where": {
         "or": [
           { "fullName": { "contains": "Bismark" } },
           { "userName": { "contains": "Bismark" } }
         ]
       },
       "first": 5
     }

4. RELAY PAGINATION & "NEXT" RESULTS:
   - When a user asks for "next 5", "next page", "more", or "page 2":
     Use the "after" argument with the cursor provided in CONTEXT:
     query GetNextPage($first: Int, $after: String) {
       users(first: $first, after: $after) {
         pageInfo {
           hasNextPage
           endCursor
         }
         nodes {
           id
           userName
           fullName
         }
       }
     }
     Variables:
     {
       "first": 5,
       "after": "<CURSOR_FROM_CONTEXT>"
     }

5. SALES ORDERS & FILTERING RULES:
   - "customerSalesVoucherOrders" accepts: (startDate: DateTime, endDate: DateTime, first: Int, where: SalesVoucherOrderFilterInput).
   - "SalesVoucherOrderFilterInput" ONLY supports:
     * customerId (Int, e.g. { eq: 107 })
     * id (Int, e.g. { eq: 50 })
     * salesOrderNumber (String, e.g. { contains: "SO-" })
     * createdAt / salesOrderCreated (DateTime)
   - NEVER query or filter by "customerName", "userName", or "fullName" inside customerSalesVoucherOrders! Those fields DO NOT exist on SalesVoucherOrderFilterInput or SalesVoucherOrder.
   - When a user asks for "sales orders for <PersonName>" (e.g. "show 5 sales orders for Kwache"):
     If customerId is not a numeric integer, DO NOT invent customerName!
     Query customerSalesVoucherOrders(first: $first) with:
     query GetSalesOrders($first: Int) {
       customerSalesVoucherOrders(first: $first) {
         totalCount
         pageInfo { hasNextPage endCursor }
         nodes {
           id
           salesOrderNumber
           quantity
           amountTotal
           customerId
           createdAt
         }
       }
     }

6. NATURAL LANGUAGE PARAMETER MATCHING:
   - "first 5", "first 5 names", "top 5" -> extract { "first": 5 }. Default to { "first": 10 } if not specified.
   - "customerId 107", "customer #107" -> extract customerId as an integer: 107 (type Int!).
   - "countryId 7", "country 7" -> extract countryId as an integer: 7 (type Int! - NEVER String!).
   - In GraphQL variables, pass countryId as an integer number (e.g. 7), NOT a string ("7").
   - "January 2026", "since last week", etc. -> convert to ISO 8601 string: "2026-01-01T00:00:00Z".
   - HotChocolate filtering syntax:
     where: { createdAt: { gte: "2026-01-01T00:00:00Z" } }
     where: { customerId: { eq: 107 } }

7. NEVER INVENT ROOT FIELDS:
   - Root field "orders" DOES NOT EXIST. Use "basketOrdersByCustomer", "basketOrders", or "customerSalesVoucherOrders".
   - Root field "userByName" DOES NOT EXIST. Use "users(where: { fullName: { contains: ... } })".

OUTPUT FORMAT:
Respond ONLY with a valid JSON object matching:
{
  "operationType": "QUERY" | "MUTATION",
  "query": "complete valid GraphQL query string",
  "variables": {},
  "explanation": "brief 1-sentence note of how natural language parameters were mapped"
}
`;

/**
 * Tracks the last pagination cursor for multi-turn requests like "next 5"
 */
let lastPaginationCursor: string | null = null;
let lastCollectionQueried: string | null = null;

export function resetPaginationState() {
  lastPaginationCursor = null;
  lastCollectionQueried = null;
}

/**
 * Maps natural language to an exact GraphQL operation, variables, and executes against KARIBU.
 */
export async function handleKaribuGraphQLIntent(
  userPrompt: string,
  accessToken?: string
): Promise<GraphQLAgentResult> {
  try {
    // 0. Smart Entity Resolution: Check if user asks for sales orders for a specific person/customer name
    const namedOrderMatch = userPrompt.match(/(?:sales\s*orders?|orders?|vouchers?)\s+for\s+([a-zA-Z\s]+?)(?:\s+in|\s+at|\s+since|\s+from|$)/i);
    if (namedOrderMatch && namedOrderMatch[1] && !/\b\d+\b/.test(namedOrderMatch[1])) {
      const targetName = namedOrderMatch[1].trim();
      const limitMatch = userPrompt.match(/\b(?:first|show|top|get)\s*(\d+)\b/i) || userPrompt.match(/\b(\d+)\s*(?:sales\s*orders?|orders?)\b/i);
      const limit = limitMatch && limitMatch[1] ? parseInt(limitMatch[1], 10) : 5;

      try {
        // Resolve user or customer ID by name
        const lookup = await executeKaribuGraphQL(`
          query ResolveCustomer($name: String!) {
            users(where: { or: [{ fullName: { contains: $name } }, { userName: { contains: $name } }] }, first: 1) {
              nodes { id fullName userName }
            }
            customers(where: { customerName: { contains: $name } }, first: 1) {
              nodes { id customerName }
            }
          }
        `, { name: targetName }, accessToken);

        const matchedUser = lookup.data?.users?.nodes?.[0];
        const matchedCustomer = lookup.data?.customers?.nodes?.[0];
        const resolvedId = matchedCustomer?.id ?? matchedUser?.id;
        const resolvedDisplayName = matchedCustomer?.customerName ?? matchedUser?.fullName ?? matchedUser?.userName ?? targetName;

        if (resolvedId) {
          const ordersRes = await executeKaribuGraphQL(`
            query GetCustomerOrders($customerId: Int!, $first: Int) {
              customerSalesVoucherOrders(where: { customerId: { eq: $customerId } }, first: $first) {
                totalCount
                pageInfo { hasNextPage endCursor }
                nodes {
                  id
                  salesOrderNumber
                  quantity
                  amountTotal
                  customerId
                  createdAt
                }
              }
            }
          `, { customerId: Number(resolvedId), first: limit }, accessToken);

          const orderNodes = ordersRes.data?.customerSalesVoucherOrders?.nodes || [];
          if (orderNodes.length > 0) {
            return {
              success: true,
              operationType: "QUERY",
              data: ordersRes.data,
              explanation: `Found ${orderNodes.length} sales order(s) for ${resolvedDisplayName} (ID: ${resolvedId}):`
            };
          }

          // If this customer has 0 orders, fetch platform recent orders as helpful context
          const recentOrders = await executeKaribuGraphQL(`
            query GetRecentOrders($first: Int) {
              customerSalesVoucherOrders(first: $first) {
                totalCount
                pageInfo { hasNextPage endCursor }
                nodes {
                  id
                  salesOrderNumber
                  quantity
                  amountTotal
                  customerId
                  createdAt
                }
              }
            }
          `, { first: limit }, accessToken);

          return {
            success: true,
            operationType: "QUERY",
            data: recentOrders.data || { customerSalesVoucherOrders: { totalCount: 0, nodes: [] } },
            explanation: `${resolvedDisplayName} (ID: ${resolvedId}) currently has 0 sales orders on file. Showing recent platform orders:`
          };
        }
      } catch {
        // Fall back to standard LLM generation
      }
    }

    const isPaginating = /\b(next|more|page\s*2|after|continue)\b/i.test(userPrompt);
    const paginationContext = (isPaginating && lastPaginationCursor)
      ? `\nPAGINATION CONTEXT: The user is requesting the next page. Previous collection was "${lastCollectionQueried}". Use 'after: "${lastPaginationCursor}"' in variables and query arguments.`
      : "";

    // Fast-path: Common direct queries executed directly without LLM token consumption
    if (!isPaginating) {
      const lower = userPrompt.trim().toLowerCase();
      let directQuery: string | null = null;
      let directExplanation: string = "";

      if (/^(show|list|get|find|all|view)?\s*(all\s+)?users\b/i.test(lower) || lower === "users") {
        directQuery = `query GetUsers { users(first: 25) { totalCount nodes { id userName fullName email isActive createdAt } } }`;
        directExplanation = "Here are the registered platform users from the database:";
      } else if (/^(show|list|get|find|all|view)?\s*(all\s+)?(products|cement|catalog|prices|pricing)\b/i.test(lower) || lower === "products") {
        directQuery = `query GetProducts { products(first: 50) { totalCount nodes { id title itemCode productGroup standardUnit } } }`;
        directExplanation = "Here are the available products in the catalog:";
      } else if (/^(show|list|get|find|all|view|recent)?\s*(all\s+)?(sales\s*orders?|orders?|vouchers?)\b/i.test(lower) || lower === "orders" || lower === "sales orders") {
        directQuery = `query GetOrders { customerSalesVoucherOrders(first: 25) { totalCount nodes { id salesOrderNumber quantity amountTotal customerId createdAt } } }`;
        directExplanation = "Here are the most recent sales orders from the database:";
      } else if (/^(show|list|get|find|all|view)?\s*(all\s+)?basket\s*orders?\b/i.test(lower) || lower === "baskets" || lower === "basket orders") {
        directQuery = `query GetBaskets { basketOrders(first: 25) { totalCount nodes { id basketOrderNumber totalQuantity quantityUsed quantityLeft createdAt } } }`;
        directExplanation = "Here are the basket orders on file:";
      } else if (/^(show|list|get|find|all|view)?\s*(all\s+)?payments?\b/i.test(lower) || lower === "payments") {
        directQuery = `query GetPayments { payments(first: 25) { totalCount nodes { id paymentReference amount amountApproved salesVoucherId paymentStatusId createdAt } } }`;
        directExplanation = "Here are the recent payment records:";
      } else if (/^(show|list|get|find|all|view)?\s*(all\s+)?countries\b/i.test(lower) || lower === "countries") {
        directQuery = `query GetCountries { countries { id code name currency } }`;
        directExplanation = "Here are the operational countries:";
      } else if (/^(show|list|get|find|all|view)?\s*(all\s+)?(locations|plants|depots|loading\s+points)\b/i.test(lower)) {
        directQuery = `query GetLocations { locations { id name code type } }`;
        directExplanation = "Here are the plant and depot loading points:";
      }

      if (directQuery) {
        const directRes = await executeKaribuGraphQL(directQuery, {}, accessToken);
        return {
          success: true,
          operationType: "QUERY",
          graphqlDocument: directQuery,
          variables: {},
          explanation: directExplanation,
          data: directRes.data
        };
      }
    }

    // 1. Generate GraphQL operation and variables from natural language with rate limit retry
    const model = process.env.ORDER_ROUTER_MODEL || "openai/gpt-oss-20b";
    let completion: any;
    let attempts = 0;
    while (attempts < 2) {
      try {
        completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: "system", content: KARIBU_SYSTEM_PROMPT + paginationContext },
            { role: "user", content: `Process this request and map to the Karibu GraphQL endpoint: "${userPrompt}"` }
          ],
          temperature: 0.0,
          response_format: { type: "json_object" }
        });
        break;
      } catch (err: any) {
        attempts++;
        const isRateLimit = err?.status === 429 || String(err?.message).includes("429") || String(err?.message).includes("rate_limit");
        if (isRateLimit && attempts < 2) {
          await new Promise(r => setTimeout(r, 1200));
          continue;
        }
        throw err;
      }
    }

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return {
        success: false,
        operationType: "QUERY",
        error: "Failed to generate GraphQL query from prompt."
      };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return {
        success: false,
        operationType: "QUERY",
        error: "LLM produced invalid JSON format."
      };
    }

    let query = parsed.query;
    let variables = parsed.variables || {};

    if (!query) {
      return {
        success: false,
        operationType: "QUERY",
        error: "No GraphQL query was generated."
      };
    }

    // 2. Execute against KARIBU endpoint
    let response: GraphQLResponse = await executeKaribuGraphQL(query, variables, accessToken);

    // 3. Self-healing / Error correction retry if schema reported an issue
    if (response.errors && response.errors.length > 0) {
      const errorMsg = response.errors.map(e => e.message).join("; ");
      
      // If error is an authorization/authentication issue, return immediately with friendly wording
      const formattedAuth = formatKaribuErrorMessage(errorMsg);
      if (formattedAuth.isAuthError || formattedAuth.isPermissionError) {
        return {
          success: false,
          operationType: parsed.operationType || "QUERY",
          graphqlDocument: query,
          variables,
          explanation: formattedAuth.friendlyMessage,
          error: formattedAuth.friendlyMessage
        };
      }

      // If it's a GraphQL schema error (e.g. wrong field or variable), try 1 quick self-correction
      try {
        const retryCompletion = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            { role: "system", content: KARIBU_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Original Request: "${userPrompt}"
Previous Query:
${query}
Variables: ${JSON.stringify(variables)}

GraphQL Server returned this error:
"${errorMsg}"

Fix the query and variables according to the KARIBU HotChocolate schema rules.`
            }
          ],
          temperature: 0.0,
          response_format: { type: "json_object" }
        });

        const retryContent = retryCompletion.choices[0]?.message?.content?.trim();
        if (retryContent) {
          const retryParsed = JSON.parse(retryContent);
          if (retryParsed.query && retryParsed.query !== query) {
            query = retryParsed.query;
            variables = retryParsed.variables || {};
            response = await executeKaribuGraphQL(query, variables, accessToken);
          }
        }
      } catch {
        // Fall back to original error
      }
    }

    if (response.errors && response.errors.length > 0) {
      const rawError = response.errors.map(e => e.message).join("; ");
      const formatted = formatKaribuErrorMessage(rawError);
      return {
        success: false,
        operationType: parsed.operationType || "QUERY",
        graphqlDocument: query,
        variables,
        explanation: formatted.friendlyMessage,
        error: formatted.friendlyMessage
      };
    }

    // Track cursor if response has Relay pageInfo
    if (response.data && typeof response.data === "object") {
      for (const [key, val] of Object.entries(response.data)) {
        if (val && typeof val === "object" && (val as any).pageInfo) {
          const pi = (val as any).pageInfo;
          if (pi.endCursor) {
            lastPaginationCursor = pi.endCursor;
            lastCollectionQueried = key;
          }
        }
      }
    }

    return {
      success: true,
      operationType: parsed.operationType || "QUERY",
      graphqlDocument: query,
      variables,
      explanation: parsed.explanation,
      data: response.data
    };
  } catch (err: any) {
    const formatted = formatKaribuErrorMessage(err.message || String(err));
    return {
      success: false,
      operationType: "QUERY",
      error: formatted.friendlyMessage
    };
  }
}
