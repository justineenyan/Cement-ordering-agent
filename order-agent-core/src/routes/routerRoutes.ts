import { Router } from "express";
import {
  frontendChatController,
  adminChatController,
  routePromptController,
  conversationalChatController,
  karibuGraphQLController,
  analyticsController,
  transcribeImageController,
  validatePaymentImageController,
  orderProcessingController,
  getProductsCatalogController,
  getRouterHealthController,
  auditPendingOrdersController,
  decideOrderApprovalController,
  getSalesVouchersController,
  evaluateParticularOrderController,
  uploadPoPImageController
} from "../controllers/routerController.js";
import { uploadSinglePoP } from "../middleware/uploadMiddleware.js";

const router = Router();

// ============================================================================
// 1. PUBLIC / CUSTOMER ROUTES (Available to all users)
// ============================================================================

/**
 * @route   POST /chat
 * @desc    Customer Chat Orchestrator (cement orders, product catalog, customer FAQ)
 */
router.post("/chat", frontendChatController);
router.post("/", frontendChatController);

/**
 * @route   POST /orders
 * @desc    Dedicated order processing endpoint (available to all)
 */
router.post("/orders", orderProcessingController);

/**
 * @route   GET /products
 * @desc    Verified catalog products & loading points
 */
router.get("/products", getProductsCatalogController);

/**
 * @route   GET /vouchers
 * @desc    Get sales vouchers with filtering, search, pagination, and status summaries.
 *          Query params: id, page, limit, statusId, status, customerId, deliveryType, search, sortBy, sortOrder
 */
router.get("/vouchers", getSalesVouchersController);

/**
 * @route   GET /orders/evaluate
 * @route   POST /orders/evaluate
 * @desc    Evaluates a particular sales order and its attached Proof of Payment.
 *          Pass order ID as query parameter ?id=... (or ?salesOrderId=...).
 *          Frontend can optionally send the sales voucher in request body.
 *          AI vision analyzes PoP authenticity, match, and computes approval rating (0-100%).
 */
router.get("/orders/evaluate", evaluateParticularOrderController);
router.post("/orders/evaluate", evaluateParticularOrderController);

/**
 * @route   POST /payments/upload-pop
 * @route   POST /orders/upload-pop
 * @desc    Uploads a Proof of Payment image from the frontend using Multer.
 *          Runs format pre-screening and multimodal AI vision validation before
 *          attaching the verified document and extracted transcription to the order.
 */
router.post("/payments/upload-pop", uploadSinglePoP, uploadPoPImageController);
router.post("/orders/upload-pop", uploadSinglePoP, uploadPoPImageController);

/**
 * @route   POST /route
 * @desc    Direct evaluation through the main intent routing model
 */
router.post("/route", routePromptController);

/**
 * @route   GET /health
 * @desc    Health check and routing model configuration status
 */
router.get("/health", getRouterHealthController);

// ============================================================================
// 2. ADMIN / STAFF RESTRICTED ROUTES
// ============================================================================

/**
 * @route   POST /chat/admin
 * @desc    Admin Chat Orchestrator (platform analytics, financial metrics, payment verification, order approvals)
 */
router.post("/chat/admin", adminChatController);

/**
 * @route   POST /admin/orders/audit-approvals
 * @desc    Triggers the Order Approval Agent to evaluate all pending sales orders,
 *          validate attached Proof of Payment documents, transcribe details, and
 *          compute approval confidence rates (0-100%) for human administrator sign-off.
 */
router.post("/admin/orders/audit-approvals", auditPendingOrdersController);
router.post("/admin/orders/evaluate-pending", auditPendingOrdersController);
/**
 * Access Control Guard: Restricts legacy un-prefixed endpoints.
 * Complex administrative and BI operations must be run exclusively via the Admin Portal.
 */
function restrictToAdmin(_req: any, res: any): void {
  res.status(403).json({
    success: false,
    error: "Access Denied: This complex administrative task is restricted exclusively to the Admin Portal (/api/admin/... or /api/chat/admin).",
    statusCode: 403,
    timestamp: new Date().toISOString()
  });
}

// Legacy public aliases redirect to 403 Forbidden
router.post("/orders/audit-approvals", restrictToAdmin);
router.post("/analytics", restrictToAdmin);
router.post("/payments/transcribe", restrictToAdmin);
router.post("/payments/validate", restrictToAdmin);
router.post("/graphql", restrictToAdmin);

/**
 * @route   POST /admin/orders/decide
 * @desc    Executes the administrator's final approval or rejection decision.
 */
router.post("/admin/orders/decide", decideOrderApprovalController);
router.post("/admin/orders/approve", (req, res) => {
  req.body.decision = "APPROVE";
  return decideOrderApprovalController(req, res);
});
router.post("/admin/orders/reject", (req, res) => {
  req.body.decision = "REJECT";
  return decideOrderApprovalController(req, res);
});

/**
 * @route   POST /admin/analytics
 * @desc    Direct execution of KARIBU platform analytics & BI queries
 */
router.post("/admin/analytics", analyticsController);

/**
 * @route   POST /admin/payments/transcribe
 * @desc    Transcribes attached proof of payment image for a salesOrderId.
 *          NOTE: Only images that pass validation have their details transcribed.
 */
router.post("/admin/payments/transcribe", transcribeImageController);

/**
 * @route   POST /admin/payments/validate
 * @desc    Validates proof of payment image (pre-screen + multimodal vision)
 */
router.post("/admin/payments/validate", validatePaymentImageController);

/**
 * @route   GET /admin/vouchers
 * @desc    Admin endpoint to get and filter all sales vouchers
 */
router.get("/admin/vouchers", getSalesVouchersController);

/**
 * @route   GET /admin/orders/evaluate
 * @route   POST /admin/orders/evaluate
 * @desc    Admin endpoint to evaluate a particular sales order and proof of payment
 */
router.get("/admin/orders/evaluate", evaluateParticularOrderController);
router.post("/admin/orders/evaluate", evaluateParticularOrderController);

/**
 * @route   POST /admin/payments/upload-pop
 * @desc    Admin endpoint to upload, validate, and attach proof of payment
 */
router.post("/admin/payments/upload-pop", uploadSinglePoP, uploadPoPImageController);

export default router;
