import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import "dotenv/config";
import { handleGeneralChat } from "./agents/generalChatAgent.js";
import { validateProofOfPayment } from "./agents/paymentValidatorAgent.js";
import { handleKaribuGraphQLIntent } from "./agents/karibuGraphQLAgent.js";
import { handleOrderManagementIntent } from "./agents/orderManagementAgent.js";
import { handleAnalyticsIntent } from "./agents/analyticsAgent.js";
import { routeUserPrompt } from "./services/routerService.js";
import type { RouteType, SessionContext, RouteDecision } from "./types/router.types.js";

async function handleImageValidationCommand(targetPath: string) {
  console.log(`\n🔍 Evaluating image: ${targetPath}`);
  const startTime = Date.now();
  const result = await validateProofOfPayment(targetPath);
  const latency = Date.now() - startTime;

  console.log("\n==================== IMAGE VALIDATION RESULT ====================");
  console.log(`[Tier 1 Pre-Screening]: ${result.passedPreScreen ? "✅ PASSED" : "❌ FAILED"}`);
  if (result.preScreenDetails) {
    if (result.preScreenDetails.format) console.log(`- Detected Format: ${result.preScreenDetails.format.toUpperCase()}`);
    if (result.preScreenDetails.width && result.preScreenDetails.height) {
      console.log(`- Dimensions: ${result.preScreenDetails.width}x${result.preScreenDetails.height}px (Aspect: ${(result.preScreenDetails.width / result.preScreenDetails.height).toFixed(2)})`);
    }
    if (result.preScreenDetails.fileSizeBytes) {
      console.log(`- File Size: ${(result.preScreenDetails.fileSizeBytes / 1024).toFixed(1)} KB`);
    }
  }

  if (!result.passedPreScreen) {
    console.log(`🛑 Algorithmic Rejection: ${result.rejectionReason}`);
    console.log(`(Early filter prevented unnecessary AI vision API calls - 0 tokens spent)`);
  } else {
    console.log(`\n[Tier 2 Multimodal Agent Evaluation]:`);
    console.log(`- Status: ${result.verificationStatus === "VERIFIED" ? "✅ VERIFIED" : result.verificationStatus === "SUSPICIOUS" ? "⚠️ SUSPICIOUS" : "❌ REJECTED"}`);
    console.log(`- Is Genuine PoP: ${result.isProofOfPayment ? "YES" : "NO"}`);
    console.log(`- Confidence: ${(result.confidence * 100).toFixed(0)}%`);

    if (result.rejectionReason) {
      console.log(`- Rejection Reason: ${result.rejectionReason}`);
    }

    if (!result.isProofOfPayment || result.verificationStatus === "REJECTED") {
      console.log("\n⛔ Transcription Skipped: Document failed payment verification. (Only genuine, verified payment receipts are transcribed).");
    } else if (result.extractedData) {
      console.log("\n📄 Transcribed Transaction Details (Verified Document):");
      console.table(result.extractedData);
    }
  }
  console.log(`⏱️ Total Processing Latency: ${latency}ms`);
  console.log("=================================================================\n");
}

async function runBatchTestImages() {
  const testDir = path.resolve("./test-images");
  try {
    const files = await fs.readdir(testDir);
    const imageFiles = files.filter(f => /\.(jpe?g|png|webp|pdf)$/i.test(f));

    if (imageFiles.length === 0) {
      console.log("\n📁 The './test-images' folder has no images yet. Place some image files there and run 'test-images' again!\n");
      return;
    }

    console.log(`\n📂 Found ${imageFiles.length} image(s) in './test-images'. Running validation pipeline...\n`);
    for (const file of imageFiles) {
      const fullPath = path.join(testDir, file);
      await handleImageValidationCommand(fullPath);
    }
  } catch (err: any) {
    console.error("Error reading test-images directory:", err.message);
  }
}

async function run() {
  const rl = readline.createInterface({ input, output, terminal: true });
  let currentAccessToken: string | undefined = process.env.KARIBU_ACCESS_TOKEN;
  let sessionContext: SessionContext = { lastRoute: null, lastUserPrompt: null };

  console.log("\n==================================================");
  console.log(" 🚀 KARIBU Multi-Model AI Engine Ready");
  console.log(" - Type your prompt to interact (e.g. 'Fetch pending orders for account #991')");
  console.log(" - Type 'token <your_token>' to attach your access token to this session");
  console.log(" - Type 'schema' to introspect KARIBU GraphQL queries & mutations");
  console.log(" - Type 'validate <path-to-image>' to verify a receipt");
  console.log(" - Type 'test-images' to validate all images in ./test-images");
  console.log(" - Type 'exit' to quit");
  console.log("==================================================\n");

  try {
    while (true) {
      const prompt = await rl.question("\nEnter prompt > ");
      const trimmed = prompt.trim();

      if (!trimmed) continue;
      if (trimmed.toLowerCase() === "exit") {
        console.log("Exiting KARIBU. Goodbye!");
        break;
      }

      // Check for token commands
      if (trimmed.toLowerCase().startsWith("token ") || trimmed.toLowerCase().startsWith("set-token ")) {
        const rawToken = trimmed.replace(/^(set-)?token\s+/i, "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
        if (rawToken) {
          currentAccessToken = rawToken;
          const masked = rawToken.length > 10 ? `${rawToken.substring(0, 6)}...${rawToken.substring(rawToken.length - 4)}` : "***";
          console.log(`\n🔑 Access Token set for this session: ${masked}\n`);
        } else {
          console.log("\n⚠️ Please provide a token: token <your_token>\n");
        }
        continue;
      }

      if (trimmed.toLowerCase() === "token") {
        if (currentAccessToken) {
          const masked = currentAccessToken.length > 10 ? `${currentAccessToken.substring(0, 6)}...${currentAccessToken.substring(currentAccessToken.length - 4)}` : "***";
          console.log(`\n🔑 Current Session Token: ${masked}\n`);
        } else {
          console.log("\nℹ️ No token currently set for this session. Use: token <your_token>\n");
        }
        continue;
      }

      // Check for image validation commands
      if (trimmed.toLowerCase() === "test-images") {
        await runBatchTestImages();
        continue;
      }

      if (trimmed.toLowerCase().startsWith("validate ")) {
        const filePath = trimmed.substring(9).trim().replace(/^["']|["']$/g, "");
        await handleImageValidationCommand(filePath);
        continue;
      }

      // Direct image file path detection
      if (/\.(jpe?g|png|webp|pdf)$/i.test(trimmed) && !trimmed.includes(" ")) {
        const filePath = trimmed.replace(/^["']|["']$/g, "");
        await handleImageValidationCommand(filePath);
        continue;
      }

      // Check for schema command
      if (trimmed.toLowerCase() === "schema") {
        console.log(`\n📘 KARIBU GraphQL Core Operations & Entities:`);
        console.log(`- basketOrdersByCustomer(customerId: Int!, first: Int, where: BasketFilterInput)`);
        console.log(`- customerSalesVoucherOrders(startDate: DateTime, endDate: DateTime, first: Int)`);
        console.log(`- basketOrders(first: Int, where: BasketFilterInput)`);
        console.log(`- users(first: Int) -> nodes { id userName fullName email phoneNumber }`);
        console.log(`- userProfile -> { id userName fullName email phoneNumber }`);
        console.log(`- customers(first: Int) -> nodes { id customerName customerCode customerAccountBalance }`);
        console.log(`- products(first: Int) -> nodes { id title itemCode productGroup }`);
        console.log(`- payments(first: Int) -> nodes { id paymentReference amount amountApproved }`);
        console.log(`- countries -> [ { id name alpha2 alpha3 } ]`);
        console.log(`- languages -> [ { id lang code } ]\n`);
        continue;
      }

      const startTime = Date.now();
      const decision = await routeUserPrompt(trimmed, sessionContext);
      const latency = Date.now() - startTime;

      console.log("\n--- Routing Decision ---");
      console.log(decision);
      console.log(`⏱️ Latency: ${latency}ms`);

      // Dispatch to the respective agent via switch case
      const route = (!decision || decision.confidence < 0.6) ? "UNKNOWN" : decision.route;

      if (route === "KARIBU_GRAPHQL" || route === "ORDER_MANAGEMENT" || route === "GENERAL_CHAT" || route === "ANALYTICS") {
        sessionContext.lastRoute = route;
        sessionContext.lastUserPrompt = trimmed;
      }

      switch (route) {
        case "GENERAL_CHAT": {
          console.log("\n🤖 [Conversational Agent]:");
          const reply = await handleGeneralChat(trimmed);
          console.log(reply);
          break;
        }

        case "ORDER_MANAGEMENT": {
          console.log("\n📦 [KARIBU Order Management Agent]:");
          if (currentAccessToken) {
            const masked = currentAccessToken.length > 10 ? `${currentAccessToken.substring(0, 6)}...${currentAccessToken.substring(currentAccessToken.length - 4)}` : "***";
            console.log(`🔑 Authorization: Bearer ${masked}`);
          } else {
            console.log(`⚠️ Authorization: None (Attach with 'token <your_token>' if required)`);
          }

          const result = await handleOrderManagementIntent(trimmed, currentAccessToken);

          console.log(`\n💬 Assistant: ${result.reply}`);

          if (result.action === "EXECUTE_MUTATION" && result.mutation) {
            console.log("\n⚡ Executed Mutation:");
            console.log(result.mutation);
            if (result.variables && Object.keys(result.variables).length > 0) {
              console.log("Variables:", JSON.stringify(result.variables, null, 2));
            }
            if (result.data) {
              console.log("✅ Result Data:", JSON.stringify(result.data, null, 2));
            }
          }
          break;
        }

        case "KARIBU_GRAPHQL": {
          console.log("\n📦 [Supabase Database Agent]:");
          console.log(`Target: Supabase PostgreSQL Database (Prisma ORM)`);
          if (currentAccessToken) {
            const masked = currentAccessToken.length > 10 ? `${currentAccessToken.substring(0, 6)}...${currentAccessToken.substring(currentAccessToken.length - 4)}` : "***";
            console.log(`🔐 Authorization: Bearer ${masked}`);
          } else {
            console.log(`⚠️ Authorization: None (Attach with 'token <your_token>' if needed)`);
          }

          const result = await handleKaribuGraphQLIntent(trimmed, currentAccessToken);

          if (result.explanation) {
            console.log(`💡 Mapping: ${result.explanation}`);
          }
          
          if (result.graphqlDocument) {
            console.log("\n📄 Generated GraphQL Document:");
            console.log(result.graphqlDocument);
          }

          if (result.variables && Object.keys(result.variables).length > 0) {
            console.log("\n⚙️ Query Variables:");
            console.log(JSON.stringify(result.variables, null, 2));
          }

          if (result.success) {
            console.log("\n✅ GraphQL Response Data:");
            console.dir(result.data, { depth: null });
          } else {
            console.log("\n⚠️ GraphQL Execution Result / Error:");
            console.log(result.error);
            if (!currentAccessToken) {
              console.log("💡 Tip: Attach your token with 'token <your_token>' if this requires authentication.");
            }
          }
          break;
        }

        case "ANALYTICS": {
          console.log("\n📊 [KARIBU Platform Analytics & BI Agent]:");
          if (currentAccessToken) {
            const masked = currentAccessToken.length > 10 ? `${currentAccessToken.substring(0, 6)}...${currentAccessToken.substring(currentAccessToken.length - 4)}` : "***";
            console.log(`🔐 Authorization: Bearer ${masked}`);
          }
          const result = await handleAnalyticsIntent(trimmed, undefined, currentAccessToken);
          console.log(`\n💬 Analysis:\n${result.reply}`);
          if (result.metrics && Object.keys(result.metrics).length > 0) {
            console.log("\n📈 Key Metrics:");
            console.table(result.metrics);
          }
          if (result.suggestions && result.suggestions.length > 0) {
            console.log("\n💡 Suggested Inquiries:");
            result.suggestions.forEach(s => console.log(` - ${s}`));
          }
          break;
        }

        case "UNKNOWN":
        default: {
          console.log("\n🤖 [Conversational / Fallback Agent]:");
          const reply = await handleGeneralChat(trimmed, { isUnknown: true });
          console.log(reply);
          break;
        }
      }
    }
  } catch (err: any) {
    if (err?.code !== "ABORT_ERR") {
      console.error("Unexpected error:", err);
    }
  } finally {
    rl.close();
  }
}

run();