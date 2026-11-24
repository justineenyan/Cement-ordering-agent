/**
 * ============================================================================
 * KARIBU AI Engine — Frontend Integration Client
 * ============================================================================
 * 
 * Drop this file into your React / Next.js frontend project (e.g., `src/services/karibuClient.ts`).
 * Zero external dependencies (uses native `fetch` and `FormData`).
 */

export type UiHint =
  | "TEXT"
  | "PRODUCT_SELECTOR"
  | "ORDER_SUMMARY"
  | "CONFIRMATION"
  | "DATA_TABLE"
  | "DATA_POINTS"
  | "RECEIPT_UPLOAD"
  | "ORDER_EVALUATION";

export type RouteType =
  | "ORDER_MANAGEMENT"
  | "KARIBU_GRAPHQL"
  | "ANALYTICS"
  | "GENERAL_CHAT"
  | "UNKNOWN";

export interface UserContext {
  userId?: string;
  customerId?: number | string;
  companyId?: string;
  countryId?: number;
  locationId?: string;
  canCreateOrder?: boolean;
}

export interface ChatSessionContext {
  lastRoute?: RouteType | null;
  lastUserPrompt?: string | null;
  conversationId?: string;
  orderState?: Record<string, unknown>;
}

export interface FrontendChatRequest {
  message: string;
  userContext?: UserContext;
  sessionContext?: ChatSessionContext;
  accessToken?: string;
}

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

export interface FrontendChatResponse<TData = NormalizedDataPayload> {
  success: boolean;
  responseType: RouteType;
  chat: string;
  data: TData | null;
  uiHint: UiHint;
  suggestions: string[];
  sessionContext: ChatSessionContext;
  debug?: {
    route: RouteType;
    confidence: number;
    latencyMs: number;
    reason: string;
  };
}

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

export interface VoucherListResponse {
  success: boolean;
  data: any[];
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

export interface ConfidenceBreakdown {
  documentAuthenticityScore: number;
  amountMatchScore: number;
  referenceValidityScore: number;
  transcriptionCompletenessScore: number;
  recipientConsistencyScore: number;
  notes: string[];
}

export interface OrderEvaluationResponse {
  success: boolean;
  service: string;
  salesOrderId: number;
  salesOrderNumber: string;
  approvalRating: number; // 0 - 100
  approvalRatingPercent: string; // e.g. "95%"
  confidenceTier: "HIGH" | "MEDIUM" | "LOW" | "REJECTED";
  recommendedAction: "APPROVE" | "MANUAL_REVIEW" | "REJECT";
  recommendationReason: string;
  confidenceBreakdown: ConfidenceBreakdown;
  validationResult?: {
    passedPreScreen: boolean;
    isProofOfPayment: boolean;
    verificationStatus: "VERIFIED" | "SUSPICIOUS" | "REJECTED";
    rejectionReason?: string;
  };
  transcription?: {
    documentTypeId: number;
    documentTypeName: string;
    bankOrPlatform?: string;
    bankId?: number;
    transactionReference?: string;
    amount?: number;
    currency?: string;
    depositorName?: string;
    depositorContact?: string;
    paymentDate?: string;
    notes?: string;
  } | null;
  proposedApprovalPayload?: {
    mutation: string;
    variables: Record<string, any>;
  };
  orderSummary: {
    id: number;
    voucherNumber: string;
    salesOrderNumber: string;
    customerName: string;
    orderQuote: number;
    status: string;
    deliveryType: "DELIVERED" | "EXW";
    destination: string;
  };
  requiresUserFinalDecision: boolean;
  governanceNotice: string;
}

export interface PoPUploadResponse {
  success: boolean;
  passedValidation: boolean;
  step: "PRE_SCREEN" | "AI_VISION" | "ATTACHMENT";
  verificationStatus: "VERIFIED" | "SUSPICIOUS" | "REJECTED";
  rejectionReason?: string;
  message: string;
  file?: {
    originalFilename: string;
    storedPath: string;
    fileUrl: string;
    fileSizeBytes: number;
    mimeType: string;
  };
  attachedTo?: {
    salesVoucherId: number;
    voucherNumber: string;
    salesOrderNumber: string;
    paymentId: number;
    paymentDocumentId: number;
    paymentTranscriptionId?: number | null;
  };
  transcription?: {
    bankOrPlatform?: string;
    transactionReference?: string;
    amount?: number;
    currency?: string;
    senderName?: string;
    recipientName?: string;
    paymentDate?: string;
    notes?: string;
  };
}

/**
 * Frontend Client configuration options
 */
export interface KaribuClientConfig {
  baseUrl?: string;
  accessToken?: string;
  isAdmin?: boolean;
}

export class KaribuClient {
  private baseUrl: string;
  private accessToken?: string;

  constructor(config: KaribuClientConfig = {}) {
    this.baseUrl = config.baseUrl || "http://localhost:3000";
    this.accessToken = config.accessToken;
  }

  public setAccessToken(token?: string): void {
    this.accessToken = token;
  }

  private getHeaders(isJson = true): HeadersInit {
    const headers: Record<string, string> = {};
    if (isJson) {
      headers["Content-Type"] = "application/json";
    }
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  /**
   * 1. Send chat message to Customer or Admin assistant
   */
  public async sendChatMessage(
    message: string,
    options: {
      isAdmin?: boolean;
      userContext?: UserContext;
      sessionContext?: ChatSessionContext;
    } = {}
  ): Promise<FrontendChatResponse> {
    const endpoint = options.isAdmin
      ? `${this.baseUrl}/api/chat/admin`
      : `${this.baseUrl}/api/chat`;

    const body: FrontendChatRequest = {
      message,
      userContext: options.userContext,
      sessionContext: options.sessionContext,
      accessToken: this.accessToken
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed with status ${res.status}`);
    }

    return res.json();
  }

  /**
   * 2. Query Sales Vouchers with filtering, pagination, and delivery/status summaries
   */
  public async getSalesVouchers(filters: VoucherQueryFilter = {}): Promise<VoucherListResponse> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") {
        params.append(key, String(val));
      }
    });

    const url = `${this.baseUrl}/api/vouchers${params.toString() ? `?${params.toString()}` : ""}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(true)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch vouchers (${res.status})`);
    }

    return res.json();
  }

  /**
   * 3. Fetch single Sales Voucher with full relational graph by ID
   */
  public async getSalesVoucherById(id: number | string): Promise<any> {
    const url = `${this.baseUrl}/api/vouchers?id=${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(true)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to fetch voucher ${id} (${res.status})`);
    }

    const data = await res.json();
    return data.data;
  }

  /**
   * 4. Evaluate a particular sales order and its attached Proof of Payment.
   * AI analyzes deposit slip/transfer authenticity, matches amounts, and returns approval rating.
   */
  public async evaluateSalesOrder(
    orderId: number | string,
    frontendVoucher?: any
  ): Promise<OrderEvaluationResponse> {
    const url = `${this.baseUrl}/api/orders/evaluate?id=${encodeURIComponent(orderId)}`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(true),
      body: frontendVoucher ? JSON.stringify({ salesVoucher: frontendVoucher }) : JSON.stringify({})
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to evaluate order ${orderId} (${res.status})`);
    }

    return res.json();
  }

  /**
   * 5. Upload Proof of Payment image with multi-stage validation:
   * Stage 1: Algorithmic format/dimension pre-screening
   * Stage 2: Multimodal AI Vision validation (validates deposit slip vs logo/selfie)
   * Stage 3: Auto-transcription & DB attachment to sales voucher
   */
  public async uploadProofOfPayment(
    file: File | Blob,
    fileName: string,
    targetOrderIdOrVoucherId?: number | string
  ): Promise<PoPUploadResponse> {
    const formData = new FormData();
    formData.append("file", file, fileName);

    const params = new URLSearchParams();
    if (targetOrderIdOrVoucherId) {
      params.append("id", String(targetOrderIdOrVoucherId));
    }

    const url = `${this.baseUrl}/api/payments/upload-pop${params.toString() ? `?${params.toString()}` : ""}`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(false), // Do not set Content-Type header so browser adds multipart boundary
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      // 422 Unprocessable Entity indicates image validation failure (e.g. non-receipt logo/selfie)
      if (res.status === 422) {
        return data as PoPUploadResponse;
      }
      throw new Error(data.error || data.message || `Upload failed with status ${res.status}`);
    }

    return data as PoPUploadResponse;
  }

  /**
   * 6. Execute Administrator's final approval decision (Sign-off)
   */
  public async decideOrderApproval(
    salesOrderId: number,
    decision: "APPROVE" | "REJECT",
    approvalInput?: Record<string, any>
  ): Promise<{ success: boolean; message: string; salesOrderId: number; decision: string }> {
    const url = `${this.baseUrl}/api/admin/orders/decide`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(true),
      body: JSON.stringify({
        salesOrderId,
        decision,
        approvalInput
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Decision failed with status ${res.status}`);
    }

    return data;
  }

  /**
   * 7. Fetch active cement catalog & loading points
   */
  public async getProductCatalog(): Promise<{
    success: boolean;
    products: any[];
    loadingPoints: any[];
  }> {
    const url = `${this.baseUrl}/api/products`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(true)
    });
    return res.json();
  }
}

/**
 * Singleton client instance ready to import
 */
export const karibuClient = new KaribuClient();
