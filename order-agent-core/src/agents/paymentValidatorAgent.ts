import * as fs from "node:fs/promises";
import * as path from "node:path";
import Groq from "groq-sdk";
import "dotenv/config";
import { preScreenImage, type EarlyFilterResult } from "../utils/imageFilter.js";

const groq = new Groq({
  apiKey: process.env.ORDER_ROUTER_KEY || process.env.GROQ_API_KEY
});

export interface PaymentValidationResult {
  passedPreScreen: boolean;
  preScreenDetails?: EarlyFilterResult;
  isProofOfPayment: boolean;
  confidence: number;
  verificationStatus: "VERIFIED" | "SUSPICIOUS" | "REJECTED";
  rejectionReason?: string;
  extractedData?: {
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

const VISION_SYSTEM_PROMPT = `
You are the KARIBU Financial Document Verification Agent.
Your job is to examine an uploaded image and verify if it is an authentic Proof of Payment (PoP) for a construction material/cement order.

Proof of Payment includes:
- Mobile banking transfer receipts / screenshots
- Bank deposit slips
- POS transaction terminal slips
- Mobile money confirmation screens (M-Pesa, OPay, PalmPay, etc.)
- Official bank debit confirmation notices

NON-Proof of Payment (Must be REJECTED):
- Photos of cement bags, trucks, or construction sites
- Selfies, personal photos, or pet images
- Memes, screenshots of chats/messages
- Quotes, estimates, or pro-forma invoices that show NO payment confirmation

Evaluate for:
1. Is this genuinely a payment proof? (isProofOfPayment: boolean)
2. Signs of tampering (e.g. mismatched fonts over numbers, uneven digital editing, cut-and-paste text)
3. Extract transaction details: bank/platform, transaction ID/reference, amount, currency, sender, recipient, date.

Respond ONLY with a valid JSON object matching:
{
  "isProofOfPayment": boolean,
  "confidence": number,
  "verificationStatus": "VERIFIED" | "SUSPICIOUS" | "REJECTED",
  "rejectionReason": string or null,
  "extractedData": {
    "bankOrPlatform": string or null,
    "transactionReference": string or null,
    "amount": number or null,
    "currency": string or null,
    "senderName": string or null,
    "recipientName": string or null,
    "paymentDate": string or null,
    "notes": string or null
  }
}
`;

export async function validateProofOfPayment(filePath: string): Promise<PaymentValidationResult> {
  // --- TIER 1: Early Algorithmic Pre-Screening ---
  const preScreen = await preScreenImage(filePath);
  if (!preScreen.passed) {
    return {
      passedPreScreen: false,
      preScreenDetails: preScreen,
      isProofOfPayment: false,
      confidence: 1.0,
      verificationStatus: "REJECTED",
      rejectionReason: `Early filter rejected: ${preScreen.reason}`
    };
  }

  // --- TIER 2: Multimodal Vision Agent ---
  try {
    const resolvedPath = path.resolve(filePath);
    const imageBuffer = await fs.readFile(resolvedPath);
    const mimeType = preScreen.format === "png" ? "image/png" : preScreen.format === "webp" ? "image/webp" : "image/jpeg";
    const base64Data = imageBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64Data}`;

    const response = await groq.chat.completions.create({
      model: "qwen/qwen3.8-27b",
      messages: [
        { role: "system", content: VISION_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this image and determine if it is a valid Proof of Payment." },
            {
              type: "image_url",
              image_url: { url: dataUrl }
            }
          ] as any
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Empty response from vision model");
    }

    const parsed = JSON.parse(content);

    return {
      passedPreScreen: true,
      preScreenDetails: preScreen,
      isProofOfPayment: Boolean(parsed.isProofOfPayment),
      confidence: Number(parsed.confidence ?? 0.9),
      verificationStatus: parsed.verificationStatus || (parsed.isProofOfPayment ? "VERIFIED" : "REJECTED"),
      rejectionReason: parsed.rejectionReason || undefined,
      extractedData: parsed.extractedData || undefined
    };
  } catch (err: any) {
    console.error("Vision Agent execution error:", err);
    return {
      passedPreScreen: true,
      preScreenDetails: preScreen,
      isProofOfPayment: false,
      confidence: 0.0,
      verificationStatus: "REJECTED",
      rejectionReason: `Vision processing failed: ${err.message}`
    };
  }
}
