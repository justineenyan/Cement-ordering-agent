import type { Request, Response, NextFunction } from "express";
import { routeUserPrompt, ROUTER_MODEL } from "../services/routerService.js";
import { handleGeneralChat } from "../agents/generalChatAgent.js";
import { handleOrderManagementIntent } from "../agents/orderManagementAgent.js";
import { handleKaribuGraphQLIntent } from "../agents/karibuGraphQLAgent.js";
import { handleAnalyticsIntent } from "../agents/analyticsAgent.js";
import { executeKaribuGraphQL } from "../services/karibuGraphQL.js";
import { validateAndTranscribeImage, resolveImageForSalesOrder } from "../services/imageTranscriptionService.js";
import { validateProofOfPayment } from "../agents/paymentValidatorAgent.js";
import { DEFAULT_PRODUCT_CATALOG, LOADING_POINTS } from "../tools/karibuTools.js";
import { formatKaribuErrorMessage } from "../utils/karibuErrorFormatter.js";
import { normalizeEntityData, type NormalizedDataPayload } from "../utils/dataNormalizer.js";
import {
  auditAllPendingOrders,
  executeOrderApprovalDecision,
  type ApprovalAuditSummary,
  type OrderEvaluationResult
} from "../agents/orderApprovalAgent.js";
import {
  analyzeCustomerIntent,
  getCustomerAccountSummary,
  getCustomerOrders,
  getCustomerPayments,
  getCustomerProductCatalog
} from "../services/customerDataService.js";
import {
  getSalesVouchers,
  getSalesVoucherById,
  evaluateParticularSalesOrder,
  validateAndAttachPoPImage
} from "../services/voucherService.js";
import type {
  FrontendChatRequest,
  FrontendChatResponse,
  ChatSessionContext,
  UiHint,
  RouteType,
  KaribuGraphQLRequestBody,
  RouteErrorResponseBody,
  RouterHealthResponseBody,
  RouteDecision
} from "../types/router.types.js";

const serverStartTime = Date.now();

/**
 * Unified Frontend Chat Orchestrator Controller.
 * Handles the complete conversation lifecycle for aemma-frontend:
 * 1. Accepts message, frontend Redux userContext, and stateless sessionContext.
 * 2. Classifies intent via the main routing model.
 * 3. Enforces domain permission guards (e.g. canCreateOrder).
 * 4. Dispatches to the appropriate specialized agent.
 * 5. Returns a rich, client-friendly FrontendChatResponse with chat text, embedded data,
 *    uiHint (for card/picker rendering), quick-reply suggestions, and updated sessionContext.
 *
 * Endpoint: POST /api/chat
 */
export async function frontendChatController(
  req: Request<Record<string, never>, FrontendChatResponse | RouteErrorResponseBody, FrontendChatRequest>,
  res: Response<FrontendChatResponse | RouteErrorResponseBody>,
  _next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  try {
    const body = req.body;

    if (!body || typeof body !== "object") {
      res.status(400).json({
        success: false,
        error: "Invalid request payload. Expected a JSON object.",
        statusCode: 400,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const rawMessage = body.message ?? body.prompt;

    if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'message' must be a non-empty string.",
        statusCode: 400,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const trimmedMessage = rawMessage.trim();
    const userContext = body.userContext;
    const sessionContext = body.sessionContext;
    const accessToken = body.accessToken;

    // Resolve customer ID strictly from authenticated context (defaults to Kwame Mensah 107)
    const effectiveCustomerId = Number(userContext?.customerId) || 107;

    // STEP 1: Strict User Boundary & Intent Analysis
    // In Customer Chat: ONLY cement ordering and that particular user's data are permitted.
    // All administrative tasks, PoP verification, and platform-wide analytics are restricted.
    const analysis = analyzeCustomerIntent(trimmedMessage);

    let chatResponseText = "";
    let embeddedData: unknown = null;
    let uiHint: UiHint = "TEXT";
    let suggestions: string[] = [];
    let responseType: RouteType = "ORDER_MANAGEMENT";
    let routeReason = "Customer operation processed";

    // Fast-path 1: Block Administrative commands & Platform Analytics
    if (analysis.intent === "RESTRICTED_ADMIN") {
      chatResponseText =
        "🔒 Administrative commands, platform-wide analytics, and audit tasks are restricted to the Admin Portal (`POST /api/chat/admin`). In this customer chat, you can place cement orders, browse products and prices, or enquire about your own account and orders.";
      uiHint = "TEXT";
      suggestions = [
        "I want to buy cement",
        "What is my account balance?",
        "Show my recent orders",
        "View cement catalog"
      ];
      responseType = "GENERAL_CHAT";
      routeReason = "Administrative/analytics task blocked in customer chat";

      const latencyMs = Date.now() - startTime;
      res.status(200).json({
        success: true,
        responseType,
        chat: chatResponseText,
        data: null,
        uiHint,
        suggestions,
        sessionContext: {
          lastRoute: responseType,
          lastUserPrompt: trimmedMessage,
          conversationId: sessionContext?.conversationId
        },
        debug: {
          route: responseType,
          confidence: 1.0,
          latencyMs,
          reason: routeReason
        }
      });
      return;
    }

    // Fast-path 2: Customer Enquiring about their own Account Balance & Credit Limit
    if (analysis.intent === "OWN_BALANCE") {
      const summary = await getCustomerAccountSummary(effectiveCustomerId);
      chatResponseText = summary.reply;
      embeddedData = summary.data;
      uiHint = "DATA_POINTS";
      suggestions = summary.suggestions;
      responseType = "ORDER_MANAGEMENT";
      routeReason = `Customer balance queried for customerId ${effectiveCustomerId}`;

      const latencyMs = Date.now() - startTime;
      res.status(200).json({
        success: true,
        responseType,
        chat: chatResponseText,
        data: embeddedData,
        uiHint,
        suggestions,
        sessionContext: {
          lastRoute: responseType,
          lastUserPrompt: trimmedMessage,
          conversationId: sessionContext?.conversationId
        },
        debug: {
          route: responseType,
          confidence: 1.0,
          latencyMs,
          reason: routeReason
        }
      });
      return;
    }

    // Fast-path 3: Customer Enquiring about their own Orders
    if (analysis.intent === "OWN_ORDERS") {
      const orderRes = await getCustomerOrders(effectiveCustomerId, analysis.specificRef);
      chatResponseText = orderRes.reply;
      embeddedData = orderRes.data;
      uiHint = orderRes.uiHint;
      suggestions = orderRes.suggestions;
      responseType = "ORDER_MANAGEMENT";
      routeReason = `Customer orders queried for customerId ${effectiveCustomerId}${analysis.specificRef ? ` (ref: ${analysis.specificRef})` : ""}`;

      const latencyMs = Date.now() - startTime;
      res.status(200).json({
        success: true,
        responseType,
        chat: chatResponseText,
        data: embeddedData,
        uiHint,
        suggestions,
        sessionContext: {
          lastRoute: responseType,
          lastUserPrompt: trimmedMessage,
          conversationId: sessionContext?.conversationId
        },
        debug: {
          route: responseType,
          confidence: 1.0,
          latencyMs,
          reason: routeReason
        }
      });
      return;
    }

    // Fast-path 4: Customer Enquiring about their own Payments
    if (analysis.intent === "OWN_PAYMENTS") {
      const paymentRes = await getCustomerPayments(effectiveCustomerId);
      chatResponseText = paymentRes.reply;
      embeddedData = paymentRes.data;
      uiHint = "DATA_TABLE";
      suggestions = paymentRes.suggestions;
      responseType = "ORDER_MANAGEMENT";
      routeReason = `Customer payments queried for customerId ${effectiveCustomerId}`;

      const latencyMs = Date.now() - startTime;
      res.status(200).json({
        success: true,
        responseType,
        chat: chatResponseText,
        data: embeddedData,
        uiHint,
        suggestions,
        sessionContext: {
          lastRoute: responseType,
          lastUserPrompt: trimmedMessage,
          conversationId: sessionContext?.conversationId
        },
        debug: {
          route: responseType,
          confidence: 1.0,
          latencyMs,
          reason: routeReason
        }
      });
      return;
    }

    // Fast-path 5: Customer Inquiring about Product Catalog & Pricing
    if (analysis.intent === "PRODUCT_CATALOG") {
      const catalogRes = getCustomerProductCatalog();
      chatResponseText = catalogRes.reply;
      embeddedData = catalogRes.data;
      uiHint = "PRODUCT_SELECTOR";
      suggestions = catalogRes.suggestions;
      responseType = "ORDER_MANAGEMENT";
      routeReason = "Customer viewed cement catalog and loading points";

      const latencyMs = Date.now() - startTime;
      res.status(200).json({
        success: true,
        responseType,
        chat: chatResponseText,
        data: embeddedData,
        uiHint,
        suggestions,
        sessionContext: {
          lastRoute: responseType,
          lastUserPrompt: trimmedMessage,
          conversationId: sessionContext?.conversationId
        },
        debug: {
          route: responseType,
          confidence: 1.0,
          latencyMs,
          reason: routeReason
        }
      });
      return;
    }

    // Fast-path 6: Customer Ordering Cement
    if (analysis.intent === "ORDER_MANAGEMENT") {
      if (userContext?.canCreateOrder === false) {
        chatResponseText =
          "Your account does not have permission to create or amend orders on KARIBU. Please contact your organization administrator.";
        uiHint = "TEXT";
        suggestions = ["Check pending orders", "Contact support", "View products"];
      } else {
        const result = await handleOrderManagementIntent(trimmedMessage, accessToken);
        chatResponseText = result.reply;
        embeddedData = result.data ? normalizeEntityData(result.data) : null;

        if (result.action === "EXECUTE_MUTATION") {
          uiHint = "ORDER_SUMMARY";
          suggestions = ["Confirm quotation", "Make payment", "View my orders"];
        } else if (result.status === "AWAITING_CONFIRMATION") {
          uiHint = "CONFIRMATION";
          suggestions = ["Yes, confirm", "Change quantity", "Cancel order creation"];
        } else {
          uiHint = "PRODUCT_SELECTOR";
          suggestions = ["Tema Plant", "Takoradi Plant", "Buy Dangote 3X", "Buy Lafarge Elephant"];
        }
      }
      responseType = "ORDER_MANAGEMENT";
      routeReason = "Cement ordering flow handled by Order Management Agent";

      const latencyMs = Date.now() - startTime;
      res.status(200).json({
        success: true,
        responseType,
        chat: chatResponseText,
        data: embeddedData,
        uiHint,
        suggestions,
        sessionContext: {
          lastRoute: responseType,
          lastUserPrompt: trimmedMessage,
          conversationId: sessionContext?.conversationId,
          ...(sessionContext?.orderState !== undefined ? { orderState: sessionContext.orderState } : {})
        },
        debug: {
          route: responseType,
          confidence: 1.0,
          latencyMs,
          reason: routeReason
        }
      });
      return;
    }

    // Step 7: General FAQ / Unknown handling
    // If it is general chat or unknown:
    const decision = await routeUserPrompt(trimmedMessage, sessionContext);
    if (decision.route === "ANALYTICS" || decision.route === "KARIBU_GRAPHQL") {
      // In User Chat, direct database queries and analytics are restricted!
      chatResponseText =
        "🔒 Administrative commands, platform-wide analytics, and audit tasks are restricted to the Admin Portal (`POST /api/chat/admin`). In this customer chat, you can place cement orders, browse products and prices, or enquire about your own account and orders.";
      uiHint = "TEXT";
      suggestions = ["I want to buy cement", "What is my account balance?", "Show my recent orders"];
      responseType = "GENERAL_CHAT";
      routeReason = "Restricted route blocked for customer chat";
    } else if (decision.route === "ORDER_MANAGEMENT") {
      const result = await handleOrderManagementIntent(trimmedMessage, accessToken);
      chatResponseText = result.reply;
      embeddedData = result.data ? normalizeEntityData(result.data) : null;
      uiHint = result.action === "EXECUTE_MUTATION" ? "ORDER_SUMMARY" : "PRODUCT_SELECTOR";
      suggestions = ["Buy cement", "View my orders", "What is my balance?"];
      responseType = "ORDER_MANAGEMENT";
      routeReason = "Order intent handled by Order Management Agent";
    } else {
      chatResponseText = await handleGeneralChat(trimmedMessage);
      uiHint = "TEXT";
      suggestions = ["I want to buy cement", "What is my account balance?", "Track my order"];
      responseType = "GENERAL_CHAT";
      routeReason = "General customer assistance conversation";
    }

    const latencyMs = Date.now() - startTime;
    res.status(200).json({
      success: true,
      responseType,
      chat: chatResponseText,
      data: embeddedData,
      uiHint,
      suggestions,
      sessionContext: {
        lastRoute: responseType,
        lastUserPrompt: trimmedMessage,
        conversationId: sessionContext?.conversationId
      },
      debug: {
        route: responseType,
        confidence: decision.confidence,
        latencyMs,
        reason: routeReason
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error processing chat request";
    console.error("Error in frontendChatController:", error);

    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      details: message
    });
  }
}

/**
 * Direct route model classification controller (for testing or debugging).
 * Endpoint: POST /api/router/route
 */
export async function routePromptController(
  req: Request<Record<string, never>, FrontendChatResponse<RouteDecision> | RouteErrorResponseBody, FrontendChatRequest>,
  res: Response<FrontendChatResponse<RouteDecision> | RouteErrorResponseBody>,
  _next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  try {
    const body = req.body;
    const rawPrompt = body.message ?? body.prompt;

    if (typeof rawPrompt !== "string" || rawPrompt.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'message' (or 'prompt') must be a non-empty string.",
        statusCode: 400,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const trimmedPrompt = rawPrompt.trim();
    const decision = await routeUserPrompt(trimmedPrompt, body.sessionContext);
    const latencyMs = Date.now() - startTime;

    res.status(200).json({
      success: true,
      responseType: decision.route,
      chat: decision.reason,
      data: decision,
      uiHint: "TEXT",
      sessionContext: {
        lastRoute: decision.route,
        lastUserPrompt: trimmedPrompt
      },
      debug: {
        route: decision.route,
        confidence: decision.confidence,
        latencyMs,
        reason: decision.reason
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Routing error";
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      details: message
    });
  }
}

/**
 * Direct conversational assistant controller.
 * Endpoint: POST /api/router/chat
 */
export async function conversationalChatController(
  req: Request<Record<string, never>, FrontendChatResponse<null> | RouteErrorResponseBody, FrontendChatRequest>,
  res: Response<FrontendChatResponse<null> | RouteErrorResponseBody>,
  _next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  try {
    const body = req.body;
    const rawMessage = body.message ?? body.prompt;

    if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'message' must be a non-empty string.",
        statusCode: 400,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const trimmed = rawMessage.trim();
    const reply = await handleGeneralChat(trimmed);
    const latencyMs = Date.now() - startTime;

    res.status(200).json({
      success: true,
      responseType: "GENERAL_CHAT",
      chat: reply,
      data: null,
      uiHint: "TEXT",
      suggestions: ["Buy cement", "Check order status", "Help"],
      sessionContext: {
        lastRoute: "GENERAL_CHAT",
        lastUserPrompt: trimmed
      },
      debug: {
        route: "GENERAL_CHAT",
        confidence: 1.0,
        latencyMs
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Conversational error";
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      details: message
    });
  }
}

/**
 * Direct KARIBU GraphQL execution controller.
 * Endpoint: POST /api/router/graphql
 */
export async function karibuGraphQLController<TData = unknown>(
  req: Request<Record<string, never>, FrontendChatResponse<TData> | RouteErrorResponseBody, KaribuGraphQLRequestBody>,
  res: Response<FrontendChatResponse<TData> | RouteErrorResponseBody>,
  _next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  try {
    const body = req.body;
    const accessToken = body?.accessToken;

    if (typeof body?.query === "string" && body.query.trim().length > 0) {
      const rawQuery = body.query.trim();
      const variables = body.variables ?? {};
      const gqlResult = await executeKaribuGraphQL<TData>(rawQuery, variables, accessToken);
      const latencyMs = Date.now() - startTime;
      const hasErrors = Array.isArray(gqlResult.errors) && gqlResult.errors.length > 0;
      const errorMsg = hasErrors ? gqlResult.errors?.map(e => e.message).join("; ") : undefined;

      res.status(200).json({
        success: !hasErrors,
        responseType: "KARIBU_GRAPHQL",
        chat: hasErrors ? `Errors: ${errorMsg}` : "GraphQL query executed successfully.",
        data: normalizeEntityData(gqlResult.data) as any,
        uiHint: "DATA_TABLE",
        sessionContext: body.sessionContext,
        debug: {
          route: "KARIBU_GRAPHQL",
          confidence: 1.0,
          latencyMs
        },
        ...(errorMsg !== undefined ? { error: errorMsg } : {})
      });
      return;
    }

    if (typeof body?.prompt === "string" && body.prompt.trim().length > 0) {
      const trimmedPrompt = body.prompt.trim();
      const agentResult = await handleKaribuGraphQLIntent(trimmedPrompt, accessToken);
      const latencyMs = Date.now() - startTime;

      res.status(200).json({
        success: agentResult.success,
        responseType: "KARIBU_GRAPHQL",
        chat: agentResult.explanation || "GraphQL query completed.",
        data: normalizeEntityData(agentResult.data) as any,
        uiHint: "DATA_TABLE",
        sessionContext: {
          lastRoute: "KARIBU_GRAPHQL",
          lastUserPrompt: trimmedPrompt
        },
        debug: {
          route: "KARIBU_GRAPHQL",
          confidence: 1.0,
          latencyMs
        },
        ...(agentResult.error !== undefined ? { error: agentResult.error } : {})
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: "Validation failed: You must provide either 'prompt' or 'query'.",
      statusCode: 400,
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "GraphQL operation error";
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      details: message
    });
  }
}

/**
 * Dedicated Analytics query controller.
 * Endpoint: POST /api/analytics
 */
export async function analyticsController(
  req: Request<Record<string, never>, FrontendChatResponse | RouteErrorResponseBody, FrontendChatRequest>,
  res: Response<FrontendChatResponse | RouteErrorResponseBody>,
  _next: NextFunction
): Promise<void> {
  const startTime = Date.now();
  try {
    const body = req.body;
    const rawPrompt = body.message ?? body.prompt;

    if (typeof rawPrompt !== "string" || rawPrompt.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'message' (or 'prompt') must be a non-empty string.",
        statusCode: 400,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const trimmedPrompt = rawPrompt.trim();
    const result = await handleAnalyticsIntent(trimmedPrompt, body.userContext, body.accessToken);
    const latencyMs = Date.now() - startTime;

    res.status(200).json({
      success: result.success,
      responseType: "ANALYTICS",
      chat: result.reply,
      data: result.data ?? result.metrics ?? null,
      uiHint: "DATA_TABLE",
      suggestions: result.suggestions,
      sessionContext: {
        lastRoute: "ANALYTICS",
        lastUserPrompt: trimmedPrompt
      },
      debug: {
        route: "ANALYTICS",
        confidence: 1.0,
        latencyMs
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analytics processing error";
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      details: message
    });
  }
}

/**
 * Health check controller.
 * Endpoint: GET /api/router/health
 */
export function getRouterHealthController(
  _req: Request,
  res: Response<RouterHealthResponseBody>
): void {
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);

  res.status(200).json({
    status: "healthy",
    service: "karibu-order-routing-engine",
    version: "1.0.0",
    defaultModel: ROUTER_MODEL,
    timestamp: new Date().toISOString(),
    uptimeSeconds
  });
}

/**
 * Admin Chat Orchestrator Controller.
 * Restricted to administrative staff, support, and finance managers:
 * - Grants full access to ANALYTICS (business intelligence, active users, rejection metrics).
 * - Grants full access to PAYMENT_VALIDATION & APPROVAL.
 * - Grants access to ORDER_MANAGEMENT and KARIBU_GRAPHQL.
 *
 * Endpoint: POST /api/chat/admin
 */
export async function adminChatController(
  req: Request<Record<string, never>, FrontendChatResponse | RouteErrorResponseBody, FrontendChatRequest>,
  res: Response<FrontendChatResponse | RouteErrorResponseBody>,
  _next: NextFunction
): Promise<void> {
  const startTime = Date.now();
  try {
    const body = req.body;
    const rawMessage = body.message ?? body.prompt;

    if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'message' must be a non-empty string.",
        statusCode: 400,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const trimmed = rawMessage.trim();
    const sessionContext = body.sessionContext;
    const accessToken = body.accessToken;
    const userContext = body.userContext;

    let chatResponseText = "";
    let embeddedData: unknown = null;
    let uiHint: UiHint = "TEXT";
    let suggestions: string[] = [];

    // Fast-path: Check for Order Approval & PoP Audit intent in Admin Portal
    const isApprovalAudit =
      /\b(audit|evaluate|check|verify|review)\b.*\b(approval|pending|proof of payment|payments?|receipts?|sales orders?)\b/i.test(trimmed) ||
      /\b(order approval agent|approve sales orders?|pending sales orders?|check pending orders|audit approvals)\b/i.test(trimmed);

    const decisionMatch = trimmed.match(/^\s*(approve|reject)\s+(?:sales\s+)?order\s*#?(\d+)\s*$/i);

    if (decisionMatch && decisionMatch[1] && decisionMatch[2]) {
      const action = decisionMatch[1].toUpperCase() as "APPROVE" | "REJECT";
      const targetOrderId = parseInt(decisionMatch[2], 10);
      const resDecision = await executeOrderApprovalDecision(targetOrderId, action, undefined, accessToken);

      res.status(200).json({
        success: resDecision.success,
        responseType: "ORDER_MANAGEMENT",
        chat: resDecision.message,
        data: (resDecision.data ? normalizeEntityData(resDecision.data) : null) as any,
        uiHint: "CONFIRMATION",
        suggestions: ["Audit pending orders", "Check sales orders", "Show platform analytics"],
        sessionContext: {
          lastRoute: "ORDER_MANAGEMENT",
          lastUserPrompt: trimmed,
          conversationId: sessionContext?.conversationId
        },
        debug: {
          route: "ORDER_MANAGEMENT",
          confidence: 1.0,
          latencyMs: Date.now() - startTime,
          reason: `[Admin Portal] Final order approval decision executed by administrator`
        }
      });
      return;
    }

    if (isApprovalAudit) {
      const auditSummary = await auditAllPendingOrders(10, accessToken);
      chatResponseText = `### 📋 KARIBU Sales Order Approval & PoP Audit Report\n\n` +
        `The Order Approval Agent has audited **${auditSummary.totalPendingOrders} pending sales orders** awaiting payment verification:\n\n` +
        `* 🟢 **Recommended for Approval:** ${auditSummary.recommendedForApproval} order(s)\n` +
        `* 🟡 **Requiring Manual Review:** ${auditSummary.requiringManualReview} order(s)\n` +
        `* 🔴 **Recommended for Rejection:** ${auditSummary.recommendedForRejection} order(s)\n` +
        `* 💰 **Total Pending Value:** GHS ${auditSummary.totalPendingValueGHS.toLocaleString()}\n\n` +
        `> **Administrator Decision Authority:** The agent provides objective confidence rates and pre-filled approval parameters, leaving final sign-off to you. Select an order below to execute the approval.`;

      embeddedData = {
        entityType: "salesOrders",
        totalCount: auditSummary.orders.length,
        items: auditSummary.orders.map(o => ({
          salesOrderId: o.salesOrderId,
          salesOrderNumber: o.salesOrderNumber,
          orderAmount: `GHS ${o.orderAmount.toFixed(2)}`,
          status: o.status,
          hasProofOfPayment: o.hasProofOfPayment ? "Yes (Attached)" : "No (Missing)",
          confidenceRate: `${o.confidenceRate}%`,
          confidenceTier: o.confidenceTier,
          recommendedAction: o.recommendedAction,
          bankOrPlatform: o.transcription?.bankOrPlatform || "N/A",
          reference: o.transcription?.transactionReference || "N/A",
          recommendation: o.recommendationReason
        })),
        metrics: {
          recommendedForApproval: auditSummary.recommendedForApproval,
          requiringManualReview: auditSummary.requiringManualReview,
          recommendedForRejection: auditSummary.recommendedForRejection,
          totalPendingValue: auditSummary.totalPendingValueGHS
        },
        raw: auditSummary
      };
      uiHint = "DATA_TABLE";
      suggestions = [
        ...auditSummary.orders.slice(0, 2).map(o => `${o.recommendedAction === "APPROVE" ? "Approve" : "Review"} Order #${o.salesOrderId}`),
        "Audit pending orders again",
        "Show platform analytics"
      ];

      res.status(200).json({
        success: true,
        responseType: "ANALYTICS",
        chat: chatResponseText,
        data: embeddedData as any,
        uiHint,
        suggestions,
        sessionContext: {
          lastRoute: "ANALYTICS",
          lastUserPrompt: trimmed,
          conversationId: sessionContext?.conversationId
        },
        debug: {
          route: "ANALYTICS",
          confidence: 1.0,
          latencyMs: Date.now() - startTime,
          reason: `[Admin Portal] Order Approval Agent batch evaluation completed`
        }
      });
      return;
    }

    const decision = await routeUserPrompt(trimmed, sessionContext);
    const effectiveRoute = decision.confidence < 0.6 ? "UNKNOWN" : decision.route;

    switch (effectiveRoute) {
      case "ANALYTICS": {
        const result = await handleAnalyticsIntent(trimmed, userContext, accessToken);
        chatResponseText = result.reply;
        embeddedData = normalizeEntityData(result.data, result.metrics);
        const normalized = embeddedData as NormalizedDataPayload;
        // Definitive UI Hint: if key-value data points, render data points list; else table
        uiHint = normalized?.entityType === "dataPoints" ? "DATA_POINTS" : "DATA_TABLE";
        suggestions = result.suggestions || ["Show active users", "Order rejection reasons", "Payment approval status"];
        break;
      }

      case "ORDER_MANAGEMENT": {
        const result = await handleOrderManagementIntent(trimmed, accessToken);
        chatResponseText = result.reply;
        embeddedData = result.data ? normalizeEntityData(result.data) : null;
        if (result.action === "EXECUTE_MUTATION") {
          uiHint = "ORDER_SUMMARY";
          suggestions = ["Confirm quotation", "Make payment", "View orders"];
        } else if (result.status === "AWAITING_CONFIRMATION") {
          uiHint = "CONFIRMATION";
          suggestions = ["Yes, confirm", "Change quantity", "Cancel order creation"];
        } else {
          uiHint = "PRODUCT_SELECTOR";
          suggestions = ["Tema Plant", "Takoradi Plant", "CEM I 52.5N", "BFORTE"];
        }
        break;
      }

      case "KARIBU_GRAPHQL": {
        const result = await handleKaribuGraphQLIntent(trimmed, accessToken);
        if (result.success && result.data) {
          embeddedData = normalizeEntityData(result.data);
          const normalized = embeddedData as NormalizedDataPayload;
          const entityType = normalized?.entityType;
          if (entityType === "products") {
            uiHint = "PRODUCT_SELECTOR";
            suggestions = ["I want to buy cement", "Check inventory", "Show pricing"];
          } else {
            uiHint = "DATA_TABLE";
            suggestions = ["Show products", "List users", "Check orders"];
          }
          chatResponseText = result.explanation || "Here are the records matching your request:";
        } else {
          embeddedData = null;
          chatResponseText = result.error
            ? formatKaribuErrorMessage(result.error).friendlyMessage
            : "No matching records were found for your query.";
          uiHint = "TEXT";
          suggestions = ["Show products", "Find orders", "Need help?"];
        }
        break;
      }

      case "GENERAL_CHAT": {
        chatResponseText = await handleGeneralChat(trimmed);
        uiHint = "TEXT";
        suggestions = ["Show platform analytics", "Verify payment receipt", "Check sales orders"];
        break;
      }

      case "UNKNOWN":
      default: {
        chatResponseText = await handleGeneralChat(trimmed, { isUnknown: true });
        uiHint = "TEXT";
        suggestions = ["Show platform analytics", "Verify payment receipt", "Check sales orders"];
        break;
      }
    }

    const latencyMs = Date.now() - startTime;
    const updatedSessionContext: ChatSessionContext = {
      lastRoute: decision.route,
      lastUserPrompt: trimmed,
      conversationId: sessionContext?.conversationId
    };

    res.status(200).json({
      success: true,
      responseType: decision.route,
      chat: chatResponseText,
      data: embeddedData,
      uiHint,
      suggestions,
      sessionContext: updatedSessionContext,
      debug: {
        route: decision.route,
        confidence: decision.confidence,
        latencyMs,
        reason: `[Admin Portal] ${decision.reason}`
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Admin Chat processing error";
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      details: message
    });
  }
}

/**
 * Controller: Transcribe Proof of Payment Image by salesOrderId.
 * Rule: Only images that pass validation have their details transcribed.
 * Endpoint: POST /api/admin/payments/transcribe
 */
export async function transcribeImageController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { salesOrderId, imagePath, accessToken } = req.body;

    if (!salesOrderId && !imagePath) {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'salesOrderId' or 'imagePath' is required.",
        statusCode: 400
      });
      return;
    }

    // Resolve the image file path
    const resolvedPath = await resolveImageForSalesOrder(salesOrderId, imagePath, accessToken);

    // Execute validation & conditional transcription
    const result = await validateAndTranscribeImage(resolvedPath, salesOrderId);

    if (!result.passedValidation) {
      res.status(422).json({
        success: false,
        salesOrderId,
        passedValidation: false,
        verificationStatus: result.verificationStatus,
        rejectionReason: result.rejectionReason,
        summary: result.summary,
        transcription: null,
        message: "Image validation failed. Transcription was aborted in accordance with verification policy."
      });
      return;
    }

    res.status(200).json({
      success: true,
      salesOrderId,
      passedValidation: true,
      verificationStatus: result.verificationStatus,
      transcription: result.transcription,
      summary: result.summary
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Image transcription failed",
      details: err.message
    });
  }
}

/**
 * Controller: Validate payment image directly.
 * Endpoint: POST /api/admin/payments/validate
 */
export async function validatePaymentImageController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { filePath, imagePath, salesOrderId } = req.body;
    const targetPath = filePath || imagePath || (await resolveImageForSalesOrder(salesOrderId));

    const result = await validateProofOfPayment(targetPath);

    res.status(200).json({
      success: true,
      salesOrderId,
      targetPath,
      result
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Payment image validation failed",
      details: err.message
    });
  }
}

/**
 * Controller: Customer Order Processing (Available to all users).
 * Endpoint: POST /api/orders
 */
export async function orderProcessingController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { message, prompt, accessToken } = req.body;
    const inputPrompt = message || prompt;

    if (!inputPrompt || typeof inputPrompt !== "string") {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'message' is required."
      });
      return;
    }

    const result = await handleOrderManagementIntent(inputPrompt.trim(), accessToken);

    res.status(200).json({
      success: result.status !== "ERROR",
      reply: result.reply,
      status: result.status,
      action: result.action,
      data: result.data ?? null,
      mutation: result.mutation ?? null,
      variables: result.variables ?? null
    });
  } catch (err: any) {
    const formatted = formatKaribuErrorMessage(err.message);
    res.status(500).json({
      success: false,
      error: formatted.friendlyMessage,
      details: err.message
    });
  }
}

/**
 * Controller: Get Verified Product Catalog & Loading Points (Available to all).
 * Endpoint: GET /api/products
 */
export function getProductsCatalogController(
  _req: Request,
  res: Response
): void {
  res.status(200).json({
    success: true,
    products: DEFAULT_PRODUCT_CATALOG,
    loadingPoints: LOADING_POINTS,
    timestamp: new Date().toISOString()
  });
}

/**
 * Controller: Audit all pending sales orders & validate attached Proof of Payment.
 * Generates an objective confidence rate (0-100%) and proposed approval parameters,
 * leaving the final decision to the human administrator.
 * Endpoint: POST /api/admin/orders/audit-approvals
 */
export async function auditPendingOrdersController(
  req: Request,
  res: Response
): Promise<void> {
  const startTime = Date.now();
  try {
    const { limit, accessToken } = req.body || {};
    const effectiveLimit = typeof limit === "number" && limit > 0 ? limit : 20;

    const summary = await auditAllPendingOrders(effectiveLimit, accessToken);
    const latencyMs = Date.now() - startTime;

    res.status(200).json({
      success: true,
      service: "KARIBU Order Approval Agent",
      message: `Audited ${summary.totalPendingOrders} pending orders: ${summary.recommendedForApproval} recommended for approval, ${summary.requiringManualReview} requiring review, ${summary.recommendedForRejection} rejected.`,
      summary: {
        timestamp: summary.timestamp,
        totalPendingOrders: summary.totalPendingOrders,
        ordersEvaluated: summary.ordersEvaluated,
        recommendedForApproval: summary.recommendedForApproval,
        requiringManualReview: summary.requiringManualReview,
        recommendedForRejection: summary.recommendedForRejection,
        totalPendingValueGHS: summary.totalPendingValueGHS
      },
      orders: summary.orders,
      governanceNotice: "Per financial governance policy, final approval authority remains with the administrator. Review the confidence scores and execute the decision via POST /api/admin/orders/decide.",
      debug: {
        latencyMs
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Order approval audit failed",
      details: err.message
    });
  }
}

/**
 * Controller: Execute administrator's final approval or rejection decision.
 * Endpoint: POST /api/admin/orders/decide
 */
export async function decideOrderApprovalController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { salesOrderId, decision, approvalInput, accessToken } = req.body || {};

    if (!salesOrderId || typeof salesOrderId !== "number") {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'salesOrderId' (number) is required."
      });
      return;
    }

    if (!decision || (decision !== "APPROVE" && decision !== "REJECT")) {
      res.status(400).json({
        success: false,
        error: "Validation failed: 'decision' must be either 'APPROVE' or 'REJECT'."
      });
      return;
    }

    const result = await executeOrderApprovalDecision(salesOrderId, decision, approvalInput, accessToken);

    res.status(result.success ? 200 : 422).json({
      success: result.success,
      salesOrderId,
      decision,
      message: result.message,
      data: result.data ?? null,
      ...(result.error ? { error: result.error } : {})
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Failed to execute order approval decision",
      details: err.message
    });
  }
}

/**
 * Controller: Get Sales Vouchers.
 * Endpoints: GET /api/vouchers, GET /api/admin/vouchers
 * Supports query params: id, page, limit, statusId, status, customerId, deliveryType, search, sortBy, sortOrder
 */
export async function getSalesVouchersController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const {
      id,
      page,
      limit,
      statusId,
      status,
      customerId,
      deliveryType,
      search,
      sortBy,
      sortOrder
    } = req.query;

    // Single Voucher by ID
    if (id) {
      const voucher = await getSalesVoucherById(id as string);
      if (!voucher) {
        res.status(404).json({
          success: false,
          error: `Sales Voucher with ID '${id}' was not found.`,
          statusCode: 404
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: voucher
      });
      return;
    }

    const result = await getSalesVouchers({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      statusId: statusId ? Number(statusId) : undefined,
      status: status ? String(status) : undefined,
      customerId: customerId ? String(customerId) : undefined,
      deliveryType: deliveryType ? (String(deliveryType).toUpperCase() as any) : undefined,
      search: search ? String(search) : undefined,
      sortBy: sortBy ? (String(sortBy) as any) : undefined,
      sortOrder: sortOrder ? (String(sortOrder).toLowerCase() as any) : undefined
    });

    res.status(200).json({
      success: true,
      data: result.vouchers,
      pagination: result.pagination,
      summary: result.summary
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Failed to retrieve sales vouchers",
      details: err.message
    });
  }
}

/**
 * Controller: Evaluate a particular sales order.
 * Query parameter: ?id=... (or ?salesOrderId=... or ?salesVoucherId=...)
 * Request body: optionally includes sales voucher object or fields sent from frontend.
 * Evaluates attached proof of payment with AI vision and returns approval rating & breakdown.
 * Endpoints: GET /api/orders/evaluate, POST /api/orders/evaluate,
 *            GET /api/admin/orders/evaluate, POST /api/admin/orders/evaluate
 */
export async function evaluateParticularOrderController(
  req: Request,
  res: Response
): Promise<void> {
  const startTime = Date.now();
  try {
    const targetId =
      req.query.id ||
      req.query.salesOrderId ||
      req.query.salesVoucherId ||
      req.query.orderId ||
      req.body?.id ||
      req.body?.salesOrderId ||
      req.body?.salesVoucherId;

    if (!targetId) {
      res.status(400).json({
        success: false,
        error: "Missing required query parameter 'id'. Example: /api/orders/evaluate?id=1052"
      });
      return;
    }

    // Extract frontend-sent sales voucher if provided in body
    const frontendVoucher =
      req.body?.salesVoucher ||
      req.body?.voucher ||
      (req.body && Object.keys(req.body).length > 0 && req.body.voucherNumber ? req.body : undefined);

    const accessToken = req.body?.accessToken || (req.headers.authorization?.replace(/^Bearer\s+/i, ""));

    const { orderSummary, evaluation } = await evaluateParticularSalesOrder(
      targetId as string,
      frontendVoucher,
      accessToken
    );

    const latencyMs = Date.now() - startTime;

    res.status(200).json({
      success: true,
      service: "KARIBU Sales Order Evaluation Agent",
      salesOrderId: orderSummary.id,
      salesOrderNumber: orderSummary.salesOrderNumber,
      approvalRating: evaluation.confidenceRate, // 0 - 100%
      approvalRatingPercent: `${evaluation.confidenceRate}%`,
      confidenceTier: evaluation.confidenceTier, // HIGH, MEDIUM, LOW, REJECTED
      recommendedAction: evaluation.recommendedAction, // APPROVE, MANUAL_REVIEW, REJECT
      recommendationReason: evaluation.recommendationReason,
      confidenceBreakdown: evaluation.confidenceBreakdown,
      validationResult: evaluation.validationResult,
      transcription: evaluation.transcription,
      proposedApprovalPayload: evaluation.proposedApprovalPayload,
      orderSummary,
      requiresUserFinalDecision: true,
      governanceNotice:
        "Approval confidence rating generated by AI Multimodal Vision. Final approval execution requires administrator authorization via POST /api/admin/orders/decide.",
      debug: {
        latencyMs
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Failed to evaluate sales order",
      details: err.message
    });
  }
}

/**
 * Controller: Upload Proof of Payment image with multi-stage validation.
 * Endpoints: POST /api/payments/upload-pop, POST /api/orders/upload-pop, POST /api/admin/payments/upload-pop
 * Middleware: Multer single/field upload
 * Pipeline: Pre-screen check -> AI Multimodal Vision validation -> attach to order & transcribe
 */
export async function uploadPoPImageController(
  req: Request,
  res: Response
): Promise<void> {
  const startTime = Date.now();
  try {
    // Resolve uploaded file from multer
    const file =
      req.file ||
      (req.files as any)?.file?.[0] ||
      (req.files as any)?.image?.[0] ||
      (req.files as any)?.proofOfPayment?.[0];

    if (!file) {
      res.status(400).json({
        success: false,
        error: "No file was uploaded. Send image file in form-data with key 'file', 'image', or 'proofOfPayment'."
      });
      return;
    }

    const targetOrderId =
      req.query.id ||
      req.query.salesOrderId ||
      req.query.salesVoucherId ||
      req.body?.salesOrderId ||
      req.body?.salesVoucherId ||
      req.body?.id;

    const validationResult = await validateAndAttachPoPImage(
      file.path,
      file.originalname,
      file.size,
      file.mimetype,
      targetOrderId as string
    );

    const latencyMs = Date.now() - startTime;

    if (!validationResult.passedValidation) {
      res.status(422).json({
        success: false,
        passedValidation: false,
        step: validationResult.step,
        verificationStatus: validationResult.verificationStatus,
        rejectionReason: validationResult.rejectionReason,
        file: validationResult.fileDetails,
        message: "Image validation failed. The uploaded file was rejected and NOT attached to the sales order.",
        debug: { latencyMs }
      });
      return;
    }

    res.status(200).json({
      success: true,
      passedValidation: true,
      step: validationResult.step,
      verificationStatus: validationResult.verificationStatus,
      message: "Proof of Payment uploaded, validated by AI Vision, and attached successfully.",
      file: validationResult.fileDetails,
      attachedTo: validationResult.attachedTo,
      transcription: validationResult.transcription,
      debug: { latencyMs }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Proof of payment upload and validation failed",
      details: err.message
    });
  }
}



