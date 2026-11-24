/**
 * Type definitions for the KARIBU AI Engine.
 * Tailored for a stateless, frontend-driven chat architecture (aemma-frontend):
 * - Frontend passes Redux user state (countryId, customerId, companyId, etc.)
 * - Frontend manages & echoes sessionContext (stateless backend)
 * - Response provides natural language `chat`, embedded `data`, `uiHint` for rich widgets,
 *   and suggested action chips for UX.
 */

// ============================================================================
// 1. Common Route & Session Types
// ============================================================================

export type RouteType =
  | "KARIBU_GRAPHQL"
  | "ORDER_MANAGEMENT"
  | "GENERAL_CHAT"
  | "ANALYTICS"
  | "UNKNOWN";

/**
 * Known user, company, and location context loaded from frontend Redux auth store.
 * Eliminates LLM guesswork for customer IDs, company configurations, and country scoping.
 */
export interface UserContext {
  userId?: string | undefined;
  customerId?: number | string | undefined;
  companyId?: string | undefined;
  countryId?: number | undefined;
  locationId?: string | undefined;
  canCreateOrder?: boolean | undefined;
}

/**
 * Stateful conversational context managed by the frontend across chat turns.
 * The backend updates and returns this, and the frontend echoes it back on the next turn.
 */
export interface ChatSessionContext {
  lastRoute?: RouteType | null | undefined;
  lastUserPrompt?: string | null | undefined;
  conversationId?: string | undefined;
  /** Active order creation state-machine slots (cart items, selected plant, delivery type, etc.) */
  orderState?: Record<string, unknown> | undefined;
}

// Backward-compatible alias for SessionContext
export type SessionContext = ChatSessionContext;

/**
 * UI Rendering hint indicating to the frontend chat widget what interactive
 * component or card to render alongside the text message.
 */
export type UiHint =
  | "TEXT"
  | "PRODUCT_SELECTOR"
  | "ORDER_SUMMARY"
  | "RECEIPT_UPLOAD"
  | "DATA_TABLE"
  | "DATA_POINTS"
  | "CONFIRMATION";

/**
 * Output produced by the intent routing model.
 */
export interface RouteDecision {
  route: RouteType;
  confidence: number;
  reason: string;
}

/**
 * Standardized, normalized entity data payload for frontend UI components.
 * Eliminates entity-specific wrappers like data.users.nodes or data.products.nodes.
 */
export interface NormalizedDataPayload<T = Record<string, unknown>> {
  entityType: string;
  totalCount: number;
  items: T[];
  record?: T | null;
  pageInfo?: {
    hasNextPage: boolean;
    hasPreviousPage?: boolean;
    endCursor?: string | null;
    startCursor?: string | null;
  };
  metrics?: Record<string, unknown>;
  raw?: unknown;
}

// ============================================================================
// 2. Primary Frontend Chat Request & Response Bodies
// ============================================================================

/**
 * Primary request body submitted by the frontend chat widget (POST /api/chat).
 */
export interface FrontendChatRequest {
  /**
   * The message typed by the user.
   */
  message: string;

  /**
   * Alias for `message` to support legacy prompt payloads.
   */
  prompt?: string | undefined;

  /**
   * User profile & company context from frontend Redux (`state.auth.user`).
   */
  userContext?: UserContext | undefined;

  /**
   * Stateful continuity context echoed back by the frontend from prior turns.
   */
  sessionContext?: ChatSessionContext | undefined;

  /**
   * Optional Bearer access token for authenticated KARIBU GraphQL operations.
   */
  accessToken?: string | undefined;
}

// Alias for generic request
export type ConversationalRequestBody = FrontendChatRequest;
export type RouteRequestBody = FrontendChatRequest;

/**
 * Primary unified response returned to the frontend chat widget.
 * Parameterized with `<TData = unknown>` for complete type safety over embedded entities.
 */
export interface FrontendChatResponse<TData = NormalizedDataPayload | unknown> {
  success: boolean;

  /**
   * High-level response/route classification type.
   */
  responseType: RouteType;

  /**
   * Primary dialogue string to render inside the chat bubble (Markdown supported).
   */
  chat: string;

  /**
   * Embedded entity data:
   * - `null` for conversational chat or FAQs
   * - GraphQL entity records (e.g. `{ products: [...] }` or `{ countries: [...] }`)
   * - Quotation / order details for order management
   */
  data?: TData | null | undefined;

  /**
   * Tells the frontend what custom component to render alongside the chat text.
   */
  uiHint?: UiHint | undefined;

  /**
   * Suggested quick-reply button chips for the user to click next.
   */
  suggestions?: string[] | undefined;

  /**
   * Updated session context that the frontend saves and echoes in the next request turn.
   */
  sessionContext?: ChatSessionContext | undefined;

  /**
   * Debug & telemetry metadata (can be hidden in production or shown in dev tools).
   */
  debug?: {
    route: RouteType;
    confidence: number;
    latencyMs: number;
    reason?: string | undefined;
  } | undefined;

  /**
   * Error message if the operation failed.
   */
  error?: string | null | undefined;
}

// ============================================================================
// 3. Generic Response Type Aliases for Backward Compatibility
// ============================================================================

export type GenericResponse<TData = unknown, TType extends string = RouteType> =
  FrontendChatResponse<TData> & { responseType: TType };

export type ApiResponse<TData = unknown, TType extends string = RouteType> = GenericResponse<TData, TType>;
export type KaribuGraphQLGenericResponse<TData = unknown> = GenericResponse<TData, "KARIBU_GRAPHQL">;
export type ConversationalGenericResponse = GenericResponse<null, "GENERAL_CHAT">;
export type RouteDecisionGenericResponse = GenericResponse<RouteDecision, RouteType>;

export type RouteResponseBody = RouteDecisionGenericResponse;
export type ConversationalResponseBody = ConversationalGenericResponse;
export type KaribuGraphQLResponseBody<TData = unknown> = KaribuGraphQLGenericResponse<TData>;
export type AnalyticsGenericResponse<TData = unknown> = GenericResponse<TData, "ANALYTICS">;
export type AnalyticsResponseBody<TData = unknown> = AnalyticsGenericResponse<TData>;

// ============================================================================
// 4. Specialized Endpoint Payloads
// ============================================================================

export interface KaribuGraphQLRequestBody<TVariables = Record<string, unknown>> {
  prompt?: string | undefined;
  query?: string | undefined;
  variables?: TVariables | undefined;
  userContext?: UserContext | undefined;
  accessToken?: string | undefined;
  sessionContext?: ChatSessionContext | undefined;
}

export interface GraphQLErrorLocation {
  line: number;
  column: number;
}

export interface GraphQLErrorDetail {
  message: string;
  locations?: GraphQLErrorLocation[] | undefined;
  path?: Array<string | number> | undefined;
  extensions?: Record<string, unknown> | undefined;
}

export interface GenericGraphQLResponse<TData = unknown> {
  data?: TData | undefined;
  errors?: GraphQLErrorDetail[] | undefined;
}

export interface RouteErrorResponseBody {
  success: false;
  error: string;
  statusCode: number;
  timestamp: string;
  details?: string | undefined;
}

export interface RouterHealthResponseBody {
  status: "healthy" | "degraded";
  service: string;
  version: string;
  defaultModel: string;
  timestamp: string;
  uptimeSeconds: number;
}
