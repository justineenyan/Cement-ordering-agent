import "dotenv/config";
import app from "./app.js";

const PORT = parseInt(process.env.PORT || "3000", 10);

const server = app.listen(PORT, () => {
  console.log("\n==================================================");
  console.log(` 🚀 KARIBU AI Engine Server running on PORT: ${PORT}`);
  console.log(` 🌐 Base URL: http://localhost:${PORT}`);
  console.log("--------------------------------------------------");
  console.log(` 💬 Customer Chat:      POST http://localhost:${PORT}/api/chat`);
  console.log(` 📦 Customer Orders:    POST http://localhost:${PORT}/api/orders`);
  console.log(` 🧱 Product Catalog:    GET  http://localhost:${PORT}/api/products`);
  console.log(` 🛡️ Admin Chat:         POST http://localhost:${PORT}/api/chat/admin`);
  console.log(` 📊 Admin Analytics:    POST http://localhost:${PORT}/api/admin/analytics`);
  console.log(` 📄 Payment Transcribe: POST http://localhost:${PORT}/api/admin/payments/transcribe`);
  console.log(` 🩺 Health Check:       GET  http://localhost:${PORT}/api/health`);
  console.log("==================================================\n");
});

function handleShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed. Exiting process.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

export default server;
