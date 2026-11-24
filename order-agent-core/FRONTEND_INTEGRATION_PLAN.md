# KARIBU AI Engine — Frontend Integration Plan & Client Specification

This document outlines the complete integration architecture, typed contracts, API endpoint references, and copy-paste code patterns for merging the **KARIBU AI Engine** backend (`order-agent-core`) with frontend web and mobile applications (e.g. `aemma-frontend` React/Next.js).

A standalone, ready-to-copy TypeScript client is also available directly at [`src/client/karibuApiClient.ts`](file:///c:/Users/Clarence/Documents/hackathon/order-agent-core/src/client/karibuApiClient.ts).

---

## 1. High-Level Architecture

The KARIBU AI Engine uses a **stateless, client-driven session model**:
- **Zero Server-Side Session Caching**: The frontend maintains and echoes `sessionContext` across turns. The backend never stores session state in Redis or memory, making it horizontally scalable and resilient.
- **Client Redux Context Ingestion**: The frontend injects known user credentials, permissions, and location data (`userContext`) directly from its auth store into every request.
- **Live Supabase Mock Database**: Fully seeded with **220+ Sales Vouchers & Orders** and **82 Platform Users** across diverse delivery types (50% DELIVERED, 50% EXW) and lifecycles (`Pending`, `PaymentSubmitted`, `Confirmed`, `Delivered`, `Cancelled/Rejected`).
- **Role-Split Endpoints**:
  - **Customer Chat** (`POST /api/chat`): Open to all buyers/customers. Handles cement purchasing, order amendments, catalog queries, and FAQs.
  - **Admin Chat** (`POST /api/chat/admin`): Restricted to staff/managers. Unlocks platform BI analytics, user counts, financial metrics, and payment verification.
  - **Sales Vouchers** (`GET /api/vouchers`): Full voucher listing, search, filtering, and summary statistics.
  - **Order AI Evaluation** (`GET` / `POST /api/orders/evaluate?id=...`): Evaluates attached Proof of Payment documents, transcribes financial details, and computes an objective **Approval Rating (0–100%)**.
  - **Multer PoP Upload & Validation** (`POST /api/payments/upload-pop`): Multi-tier algorithmic pre-screening and multimodal AI vision check before attaching to vouchers.

```
┌────────────────────────────────────────────────────────┐
│                   Frontend Client                      │
│      (Redux Auth Store + Stateless Session State)      │
└──────────────┬───────────────────────────▲─────────────┘
               │                           │
               │ POST /api/chat            │ Response:
               │ {                         │ {
               │   message,                │   chat,
               │   userContext,            │   data,
               │   sessionContext,         │   uiHint,
               │   accessToken             │   suggestions,
               │ }                         │   sessionContext
               ▼                           │ }
┌──────────────────────────────────────────┴─────────────┐
│                 KARIBU AI Engine                       │
│    (Intent Router + Domain Agent Matrix + Tools)       │
└────────────────────────────────────────────────────────┘
```

---

## 2. TypeScript Contracts (Copy-Paste for Frontend)

Save this file in your frontend project as `src/types/karibuChat.types.ts`:

```typescript
/**
 * UI Rendering hint indicating which interactive component to display.
 */
export type UiHint =
  | "TEXT"               // Standard conversational bubble
  | "PRODUCT_SELECTOR"   // Grid or carousel of cement products
  | "ORDER_SUMMARY"      // Review voucher quote before confirmation
  | "CONFIRMATION"       // Quick action bar (Yes, Confirm / Cancel)
  | "DATA_TABLE"         // Tabular data (sales orders, users, products)
  | "DATA_POINTS"        // Key-value metrics list (e.g. active users count, rejection reasons)
  | "RECEIPT_UPLOAD"     // Drag-and-drop Proof of Payment file picker
  | "ORDER_EVALUATION";  // AI approval rating gauge and confidence breakdown

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

/**
 * Filter parameters for GET /api/vouchers
 */
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

/**
 * Response payload from GET /api/vouchers
 */
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

/**
 * 5-point approval confidence scoring
 */
export interface ConfidenceBreakdown {
  documentAuthenticityScore: number;    // max 30 pts: Image filter + Multimodal PoP classification
  amountMatchScore: number;             // max 35 pts: Transcribed amount vs Order Quote
  referenceValidityScore: number;       // max 15 pts: Slip/Txn reference format & uniqueness
  transcriptionCompletenessScore: number; // max 15 pts: Mandatory fields per documentTypeId
  recipientConsistencyScore: number;    // max 5 pts: Paid to Heidelberg Materials / Ghacem
  notes: string[];
}

/**
 * Response payload from GET /api/orders/evaluate?id=...
 */
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

/**
 * Response payload from POST /api/payments/upload-pop
 */
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
```

---

## 3. API Endpoints Reference

Base URL: `http://localhost:3000` (or `http://localhost:4999` in test mode).

### 3.1. Public / Customer Endpoints

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/chat` | Customer Chat Orchestrator (cement orders, tracking, FAQ) | Optional / Bearer Token |
| `POST` | `/api/orders` | Direct customer order placement & status | Optional / Bearer Token |
| `GET` | `/api/vouchers` | Get sales vouchers with pagination, filters, and summary stats | Optional |
| `GET` | `/api/orders/evaluate` | Evaluates a particular sales order and attached PoP (`?id=...`) | Optional |
| `POST` | `/api/orders/evaluate` | Evaluates order (can accept voucher payload in body + `?id=...`) | Optional |
| `POST` | `/api/payments/upload-pop`| Uploads & validates Proof of Payment via Multer (`?id=...`) | Optional |
| `POST` | `/api/orders/upload-pop` | Alias for Proof of Payment upload | Optional |
| `GET` | `/api/products` | Retrieve active cement catalog & loading points | No |
| `GET` | `/api/health` | Health check & engine status | No |

### 3.2. Admin / Staff Endpoints

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/chat/admin` | Admin Chat Orchestrator (BI, Analytics, Verification, Order Approval) | Recommended |
| `GET` | `/api/admin/vouchers` | Admin voucher query endpoint | Recommended |
| `GET` | `/api/admin/orders/evaluate`| Admin order evaluation endpoint | Recommended |
| `POST` | `/api/admin/orders/evaluate`| Admin order evaluation endpoint (with optional body payload) | Recommended |
| `POST` | `/api/admin/payments/upload-pop` | Admin Proof of Payment upload & validation | Recommended |
| `POST` | `/api/admin/orders/audit-approvals` | Audits all pending orders, validates PoPs, computes confidence rates | Recommended |
| `POST` | `/api/admin/orders/decide` | Executes user/admin's final approval or rejection decision | Recommended |
| `POST` | `/api/admin/analytics` | Direct execution of analytics queries | Recommended |

---

### 3.3. Sales Vouchers API (`GET /api/vouchers`)

#### Querying Vouchers with Pagination & Filters
```http
GET /api/vouchers?page=1&limit=10&deliveryType=DELIVERED&status=PaymentSubmitted
```

*Response:*
```json
{
  "success": true,
  "data": [
    {
      "id": 1052,
      "voucherNumber": "SV-1052",
      "orderQuote": 5500,
      "isDeliveryInclusive": true,
      "customer": {
        "id": 107,
        "customerCode": "CUST-107",
        "customerName": "Kwame Mensah Construction Ltd"
      },
      "salesVoucherStatus": {
        "id": 8,
        "description": "PaymentSubmitted"
      },
      "destination": {
        "name": "Accra Central",
        "region": "Greater Accra"
      },
      "items": [
        {
          "quantity": 50,
          "totalPrice": 5500,
          "product": {
            "title": "CEM II/A-LL 52.5R - SAC",
            "itemCode": "52.5N"
          }
        }
      ],
      "payments": [
        {
          "id": 119,
          "paymentReference": "PAY-55800",
          "amount": 5500,
          "paymentDocuments": [
            {
              "id": 6,
              "documentName": "stanbic_deposit_slip.jpg",
              "documentUrl": "uploads/proof_of_payment/pop_1793086083595_stanbic.jpg"
            }
          ]
        }
      ]
    }
  ],
  "pagination": {
    "total": 220,
    "page": 1,
    "limit": 10,
    "totalPages": 22,
    "hasMore": true
  },
  "summary": {
    "totalVouchers": 220,
    "deliveredCount": 110,
    "exwCount": 110,
    "pendingCount": 0,
    "paymentSubmittedCount": 45,
    "confirmedCount": 42,
    "rejectedCount": 16
  }
}
```

#### Querying a Single Voucher by ID
```http
GET /api/vouchers?id=1052
```

---

### 3.4. Order AI Evaluation API (`GET` & `POST /api/orders/evaluate?id=...`)

The frontend passes the sales order ID as a query parameter. The frontend can optionally pass the sales voucher object in `req.body.salesVoucher`; if not provided, the backend retrieves the voucher and its attached Proof of Payment document from the database.

Multimodal AI vision analyzes the attached image and computes an objective **Approval Rating (0–100%)**.

#### Example Request:
```http
GET /api/orders/evaluate?id=1054
```

#### Example Response (Valid Deposit Slip Analyzed):
```json
{
  "success": true,
  "service": "KARIBU Sales Order Evaluation Agent",
  "salesOrderId": 1054,
  "salesOrderNumber": "SO-1054",
  "approvalRating": 75,
  "approvalRatingPercent": "75%",
  "confidenceTier": "MEDIUM",
  "recommendedAction": "MANUAL_REVIEW",
  "recommendationReason": "Moderate approval confidence (75%). Document is authentic but requires manual review due to partial transcription or slight amount discrepancy.",
  "confidenceBreakdown": {
    "documentAuthenticityScore": 30,
    "amountMatchScore": 10,
    "referenceValidityScore": 15,
    "transcriptionCompletenessScore": 15,
    "recipientConsistencyScore": 5,
    "notes": [
      "✅ Authenticity: Image passed early filter and multimodal vision validation as genuine Proof of Payment.",
      "⚠️ Underpayment Deficit: Slip amount (GHS 5500.00) is less than required Order Quote (GHS 13800.00).",
      "✅ Valid Reference: 'DEP-88291-GH' meets length constraints (<=30 chars) and passed format verification.",
      "✅ Bank/Platform Identified: Stanbic Bank Ghana (Mapped to Bank ID: 5).",
      "✅ Payment Date Extracted: 12 Oct 2023.",
      "✅ Depositor Identified: Kwame Mensah Construction Ltd.",
      "✅ Recipient Consistency: Paid directly to 'Ghacem Limited / Heidelberg Materials'."
    ]
  },
  "transcription": {
    "documentTypeId": 2,
    "documentTypeName": "Cash Deposit Slip",
    "bankOrPlatform": "Stanbic Bank Ghana",
    "bankId": 5,
    "transactionReference": "DEP-88291-GH",
    "amount": 5500,
    "currency": "GHS",
    "depositorName": "Kwame Mensah Construction Ltd",
    "paymentDate": "12 Oct 2023",
    "notes": "Cash Deposit at Tema Main branch. Status: Successful."
  },
  "orderSummary": {
    "id": 1054,
    "voucherNumber": "SV-1054",
    "salesOrderNumber": "SO-1054",
    "customerName": "Kwame Mensah Construction Ltd",
    "orderQuote": 13800,
    "status": "PaymentSubmitted",
    "deliveryType": "DELIVERED",
    "destination": "Accra Central"
  },
  "requiresUserFinalDecision": true,
  "governanceNotice": "Approval confidence rating generated by AI Multimodal Vision. Final approval execution requires administrator authorization via POST /api/admin/orders/decide."
}
```

#### Example Response (When Attachment is an Invalid Image, e.g. Logo/Selfie):
```json
{
  "success": true,
  "salesOrderId": 1052,
  "salesOrderNumber": "SO-1052",
  "approvalRating": 5,
  "approvalRatingPercent": "5%",
  "confidenceTier": "REJECTED",
  "recommendedAction": "REJECT",
  "recommendationReason": "Proof of Payment invalid: The image is a logo or graphic design, not a payment receipt, bank slip, or transaction confirmation.",
  "confidenceBreakdown": {
    "documentAuthenticityScore": 5,
    "amountMatchScore": 0,
    "referenceValidityScore": 0,
    "transcriptionCompletenessScore": 0,
    "recipientConsistencyScore": 0,
    "notes": [
      "❌ Image Validation Rejected: The image is a logo or graphic design, not a payment receipt, bank slip, or transaction confirmation.",
      "⚠️ Per system policy, transcription was aborted for non-payment image."
    ]
  },
  "transcription": null,
  "requiresUserFinalDecision": true
}
```

---

### 3.5. Multer Proof of Payment Upload & Validation API (`POST /api/payments/upload-pop`)

Accepts a multipart file upload (`file`, `image`, or `proofOfPayment`) from the frontend.
Runs multi-tier validation:
1. **Algorithmic Pre-Screening**: Validates magic file bytes (JPEG/PNG/WebP/PDF), minimum size (≥ 2 KB), max size (≤ 15 MB).
2. **Multimodal AI Vision Check**: Determines if the image is a genuine deposit slip, bank transfer screenshot, or cheque.
3. **Attachment**:
   - If validation **FAILS** (e.g. logo, selfie, meme): Returns `422 Unprocessable Entity` with exact rejection reasoning, deletes the file, and **does NOT** attach to the order.
   - If validation **PASSES**: Creates `PaymentDocument`, transcribes details into `PaymentTranscription`, updates voucher status to `PaymentSubmitted` (`8`), and returns `200 OK`.

#### Example Request:
```http
POST /api/payments/upload-pop?id=1054
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="stanbic_deposit_slip.jpg"
Content-Type: image/jpeg

[BINARY_IMAGE_DATA]
------WebKitFormBoundary--
```

#### Success Response (`200 OK`):
```json
{
  "success": true,
  "passedValidation": true,
  "step": "ATTACHMENT",
  "verificationStatus": "VERIFIED",
  "message": "Proof of Payment uploaded, validated by AI Vision, and attached successfully.",
  "file": {
    "originalFilename": "stanbic_deposit_slip.jpg",
    "storedPath": "uploads/proof_of_payment/pop_1793086083595_stanbic.jpg",
    "fileUrl": "/uploads/proof_of_payment/pop_1793086083595_stanbic.jpg",
    "fileSizeBytes": 451200,
    "mimeType": "image/jpeg"
  },
  "attachedTo": {
    "salesVoucherId": 1054,
    "voucherNumber": "SV-1054",
    "salesOrderNumber": "SO-1054",
    "paymentId": 121,
    "paymentDocumentId": 66,
    "paymentTranscriptionId": 68
  },
  "transcription": {
    "bankOrPlatform": "Stanbic Bank Ghana",
    "transactionReference": "DEP-88291-GH",
    "amount": 5500,
    "currency": "GHS",
    "senderName": "Kwame Mensah Construction Ltd",
    "recipientName": "Ghacem Limited / Heidelberg Materials",
    "paymentDate": "12 Oct 2023",
    "notes": "Cash Deposit at Tema Main branch. Status: Successful."
  }
}
```

#### Rejection Response (`422 Unprocessable Entity` for non-receipt / selfie / logo):
```json
{
  "success": false,
  "passedValidation": false,
  "step": "AI_VISION",
  "verificationStatus": "REJECTED",
  "rejectionReason": "The image is a logo or graphic design, not a payment receipt, bank slip, or transaction confirmation.",
  "file": {
    "originalFilename": "HMIcon.png",
    "storedPath": "uploads/proof_of_payment/pop_1793086082_HMIcon.png",
    "fileUrl": "/uploads/proof_of_payment/pop_1793086082_HMIcon.png",
    "fileSizeBytes": 17389,
    "mimeType": "image/png"
  },
  "message": "Image validation failed. The uploaded file was rejected and NOT attached to the sales order."
}
```

---

## 4. Frontend Integration: Quick-Start Client Code

Import [`src/client/karibuApiClient.ts`](file:///c:/Users/Clarence/Documents/hackathon/order-agent-core/src/client/karibuApiClient.ts) into your frontend to interact with all endpoints:

```typescript
import { karibuClient } from "@/services/karibuClient";

// 1. Fetch vouchers list with pagination & filters
const { data, summary, pagination } = await karibuClient.getSalesVouchers({
  page: 1,
  limit: 20,
  deliveryType: "DELIVERED",
  status: "PaymentSubmitted"
});

// 2. Fetch single voucher with complete graph
const voucher = await karibuClient.getSalesVoucherById(1052);

// 3. Upload Proof of Payment (with automated AI validation)
const uploadResult = await karibuClient.uploadProofOfPayment(
  fileSelectedFromInput,
  fileSelectedFromInput.name,
  1054 // voucher or order ID
);

if (!uploadResult.passedValidation) {
  alert(`Upload rejected: ${uploadResult.rejectionReason}`);
} else {
  console.log("Attached to payment ID:", uploadResult.attachedTo?.paymentId);
}

// 4. Evaluate order with AI vision approval rating
const evaluation = await karibuClient.evaluateSalesOrder(1054);
console.log("Approval Rating:", evaluation.approvalRatingPercent); // "75%"
console.log("Recommended Action:", evaluation.recommendedAction); // "MANUAL_REVIEW"

// 5. Administrator decision sign-off
await karibuClient.decideOrderApproval(1054, "APPROVE");
```

---

## 5. React Component Patterns

### 5.1. Order AI Approval Card Component
```tsx
import React, { useState } from "react";
import type { OrderEvaluationResponse } from "@/types/karibuChat.types";
import { karibuClient } from "@/services/karibuClient";

export function OrderEvaluationCard({
  evaluation,
  onDecisionCompleted
}: {
  evaluation: OrderEvaluationResponse;
  onDecisionCompleted?: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "HIGH": return "bg-green-100 text-green-800 border-green-200";
      case "MEDIUM": return "bg-amber-100 text-amber-800 border-amber-200";
      default: return "bg-red-100 text-red-800 border-red-200";
    }
  };

  const handleDecision = async (decision: "APPROVE" | "REJECT") => {
    setSubmitting(true);
    try {
      await karibuClient.decideOrderApproval(evaluation.salesOrderId, decision);
      alert(`Sales Order #${evaluation.salesOrderId} has been ${decision}D!`);
      onDecisionCompleted?.();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border rounded-xl p-5 bg-white shadow-sm space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            Order #{evaluation.salesOrderNumber} AI Evaluation
          </h3>
          <p className="text-sm text-gray-500">
            Customer: {evaluation.orderSummary.customerName} • Quote: GHS {evaluation.orderSummary.orderQuote.toLocaleString()}
          </p>
        </div>
        <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getTierColor(evaluation.confidenceTier)}`}>
          {evaluation.confidenceTier} CONFIDENCE ({evaluation.approvalRatingPercent})
        </span>
      </div>

      {/* 5-Point Confidence Breakdown */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 text-xs">
        <div className="font-semibold text-gray-700">Confidence Breakdown:</div>
        <ul className="space-y-1 text-gray-600">
          {evaluation.confidenceBreakdown.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </div>

      {/* Transcription Summary */}
      {evaluation.transcription && (
        <div className="grid grid-cols-2 gap-2 text-xs bg-blue-50 p-3 rounded-lg border border-blue-100">
          <div><span className="font-medium">Bank/Channel:</span> {evaluation.transcription.bankOrPlatform}</div>
          <div><span className="font-medium">Reference:</span> {evaluation.transcription.transactionReference}</div>
          <div><span className="font-medium">Transcribed Amount:</span> GHS {evaluation.transcription.amount?.toLocaleString()}</div>
          <div><span className="font-medium">Date:</span> {evaluation.transcription.paymentDate}</div>
        </div>
      )}

      {/* Administrator Action Bar */}
      <div className="flex justify-end gap-3 pt-2 border-t">
        <button
          disabled={submitting}
          onClick={() => handleDecision("REJECT")}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition"
        >
          Reject Order
        </button>
        <button
          disabled={submitting}
          onClick={() => handleDecision("APPROVE")}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition shadow-sm"
        >
          Approve Order ({evaluation.approvalRatingPercent})
        </button>
      </div>
    </div>
  );
}
```

---

### 5.2. Proof of Payment Upload Dropzone
```tsx
import React, { useState } from "react";
import { karibuClient } from "@/services/karibuClient";
import type { PoPUploadResponse } from "@/types/karibuChat.types";

export function PaymentReceiptDropzone({
  salesOrderId,
  onUploadSuccess
}: {
  salesOrderId: number;
  onUploadSuccess?: (res: PoPUploadResponse) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);

    try {
      const result = await karibuClient.uploadProofOfPayment(file, file.name, salesOrderId);

      if (!result.passedValidation) {
        setErrorMsg(`❌ Rejected: ${result.rejectionReason}`);
      } else {
        onUploadSuccess?.(result);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-blue-500 transition">
      <input
        type="file"
        id="pop-upload"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <label htmlFor="pop-upload" className="cursor-pointer space-y-2 block">
        <div className="text-3xl">📄</div>
        <div className="text-sm font-medium text-gray-700">
          {isUploading ? "Validating with AI Vision..." : "Upload Bank Deposit Slip or MoMo Receipt"}
        </div>
        <p className="text-xs text-gray-400">JPG, PNG, WEBP, or PDF up to 15 MB</p>
      </label>

      {errorMsg && (
        <div className="mt-3 p-2 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200">
          {errorMsg}
        </div>
      )}
    </div>
  );
}
```

---

## 6. Frontend Merging Steps

1. **Copy API Client & Types**:
   - Copy [`src/client/karibuApiClient.ts`](file:///c:/Users/Clarence/Documents/hackathon/order-agent-core/src/client/karibuApiClient.ts) into your frontend project at `src/services/karibuClient.ts`.
2. **Environment Configuration**:
   - In your frontend `.env.local`, configure:
     ```env
     NEXT_PUBLIC_KARIBU_API_URL=http://localhost:3000
     ```
3. **Wire Vouchers Screen**:
   - Use `karibuClient.getSalesVouchers({ page, limit, deliveryType, status })` to power your vouchers table.
4. **Wire Upload & Evaluation Flow**:
   - Let customers or sales officers upload receipts using `karibuClient.uploadProofOfPayment(file, fileName, voucherId)`.
   - In the Admin Approval portal, call `karibuClient.evaluateSalesOrder(orderId)` to display the AI approval rating badge and confidence breakdown.
   - Execute administrator decisions with `karibuClient.decideOrderApproval(orderId, "APPROVE" | "REJECT")`.
