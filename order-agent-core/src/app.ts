import express, { type Express, type Request, type Response, type NextFunction } from "express";
import routerRoutes from "./routes/routerRoutes.js";

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // CORS headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Mount router routes
  app.use("/api/router", routerRoutes);
  app.use("/api/v1/router", routerRoutes);
  app.use("/api", routerRoutes);

  // Root endpoint info
  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      service: "KARIBU Order Agent & Intent Routing Engine",
      status: "running",
      endpoints: {
        customerChat: "POST /api/chat",
        customerOrders: "POST /api/orders",
        productCatalog: "GET /api/products",
        adminChat: "POST /api/chat/admin",
        adminOrderApprovalAudit: "POST /api/admin/orders/audit-approvals",
        adminOrderDecision: "POST /api/admin/orders/decide",
        adminAnalytics: "POST /api/admin/analytics",
        adminTranscribePayment: "POST /api/admin/payments/transcribe",
        adminValidatePayment: "POST /api/admin/payments/validate",
        intentRouter: "POST /api/route",
        directGraphQL: "POST /api/graphql",
        healthCheck: "GET /api/health"
      }
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
      statusCode: 404,
      timestamp: new Date().toISOString()
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled Application Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal Server Error",
      statusCode: 500,
      timestamp: new Date().toISOString(),
      details: err.message
    });
  });

  return app;
}

export default createApp();
