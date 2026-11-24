import Groq from "groq-sdk";
import "dotenv/config";
import type { RouteDecision, SessionContext } from "../types/router.types.js";

const groq = new Groq({
  apiKey: process.env.ORDER_ROUTER_KEY || process.env.GROQ_API_KEY
});

export const ROUTER_MODEL = process.env.ORDER_ROUTER_MODEL || "openai/gpt-oss-20b";

export const ROUTER_SYSTEM_PROMPT = `
You are an intent router for the KARIBU platform.
Classify the user input into ONE of these routes:
- ORDER_MANAGEMENT: Intent to create a new order, buy cement/products, cancel an existing order or sales voucher, amend/update an order (e.g. change delivery date or quantities), confirm quotations, or process order payments.
- KARIBU_GRAPHQL: Reading, querying, listing, tracking, or looking up existing database records (e.g. "list users", "show products in country 7", "find orders for customer 107", "check inventory", "show countries").
- GENERAL_CHAT: Chitchat, greetings, general questions, or non-KARIBU topics.
- ANALYTICS: Calculations, statistics, aggregations, counts, business intelligence, performance trends, or rejection/failure analysis (e.g. "how many users are active in karibu", "most common reason for sales order rejection", "what is the rejection rate for payments", "average order quantity", "order status breakdown", "which customer has highest balance").
- UNKNOWN: Gibberish, random keystrokes, nonsensical strings, incomprehensible text, or queries with no discernible intent.

Rules:
1. Do NOT classify random strings, hashes, or keystrokes as KARIBU_GRAPHQL unless the user explicitly asks to look up, track, or query an ID.
2. If the input is meaningless, gibberish, or senseless text, you MUST choose "UNKNOWN" with confidence 0.0 or low confidence.
3. Continuity & Follow-ups: If conversation context indicates the previous turn was KARIBU_GRAPHQL and the user is following up with pagination ("next 5", "find the next 5", "show more", "next page", "more") or asking for details on the returned records, you MUST classify it as "KARIBU_GRAPHQL" with high confidence (>= 0.95).
4. Analytics & BI Queries: If the user asks for aggregations, counts/totals ("how many sales orders have been created", "how many users are active"), percentages, statistical metrics, or failure/rejection analysis ("most common reason for sales order rejection"), you MUST classify it as "ANALYTICS".
5. Topic Switching: Users frequently switch topics (e.g. asking an analytics question like "how many sales orders have been created" or "what is the rejection reason" while previously in order management). You must ALWAYS classify according to the true intent of the NEW user input, NOT the previous route.

Respond ONLY with a valid JSON object matching this schema:
{
  "route": "KARIBU_GRAPHQL" | "ORDER_MANAGEMENT" | "GENERAL_CHAT" | "ANALYTICS" | "UNKNOWN",
  "confidence": number,
  "reason": "brief explanation"
}
`;

/**
 * Evaluates the user prompt through deterministic heuristic guards and
 * the main Groq LLM routing model.
 */
export async function routeUserPrompt(
  userPrompt: string,
  context?: SessionContext
): Promise<RouteDecision> {
  const trimmed = userPrompt.trim();

  // Fast-path 1: Deterministic check for self-contained question words
  // If the prompt is a complete question, it should NEVER be locked into a previous route
  const isQuestionOrQuery =
    /^(how many|what is|what are|what|why|who|where|most common|average|total|count|rejection|active users|sales orders|analytics|stats|statistics|list|show|find|search|get all|who are you|hello|hi|help|nevermind|cancel order creation)\b/i.test(trimmed);

  // Fast-path 2: Only maintain ORDER_MANAGEMENT if the response is genuinely a follow-up answer
  if (context?.lastRoute === "ORDER_MANAGEMENT" && !isQuestionOrQuery) {
    const isOrderStepAnswer =
      /^(yes|no|confirm|submit|proceed|cancel|change|update|sure|correct)\b/i.test(trimmed) ||
      /\b(\d+\s*(bags?|tons?|trucks?)|tema|takoradi|kumasi|cotonou|cimbenin|delivered|exw|pickup)\b/i.test(trimmed);

    if (isOrderStepAnswer) {
      return {
        route: "ORDER_MANAGEMENT",
        confidence: 0.99,
        reason: `Active order lifecycle follow-up step ("${context?.lastUserPrompt || "order step"}")`
      };
    }
  }

  // Fast-path 3: If previous turn was KARIBU_GRAPHQL and this is a pure pagination/continuation request
  const CONTINUATION_REGEX = /^\s*(find\s+)?(the\s+)?(next|previous|prev|more|after|continue|page\s*\d+|another\s+\d+|show\s+more)(\s+\d+)?\s*$/i;
  const isContinuation = CONTINUATION_REGEX.test(trimmed) || /\b(next\s+\d+|next\s+page|load\s+more|show\s+more)\b/i.test(trimmed);

  if (isContinuation && context?.lastRoute === "KARIBU_GRAPHQL") {
    return {
      route: "KARIBU_GRAPHQL",
      confidence: 0.99,
      reason: `Continuation/pagination follow-up to prior KARIBU_GRAPHQL query ("${context?.lastUserPrompt || "records"}")`
    };
  }

  try {
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: ROUTER_SYSTEM_PROMPT }
    ];

    // Pass context as objective guidance, NOT as simulated assistant decisions (which cause sticky bias)
    let promptWithContext = trimmed;
    if (context?.lastRoute && context?.lastUserPrompt && !isQuestionOrQuery) {
      promptWithContext = `[Context Note: Previous turn was ${context.lastRoute} ("${context.lastUserPrompt}"). If this new input is an order answer/continuation, route accordingly. If it is a new topic, classify independently.]\n\nUser Input: ${trimmed}`;
    }

    messages.push({ role: "user", content: promptWithContext });

    let response: any;
    let attempts = 0;
    while (attempts < 2) {
      try {
        response = await groq.chat.completions.create({
          model: ROUTER_MODEL,
          messages,
          temperature: 0.0,
          response_format: { type: "json_object" }
        });
        break;
      } catch (err: any) {
        attempts++;
        const isRateLimit = err?.status === 429 || String(err?.message).includes("429") || String(err?.message).includes("rate_limit");
        if (isRateLimit && attempts < 2) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    }

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      return {
        route: "UNKNOWN",
        confidence: 0.0,
        reason: "No response content received from routing model"
      };
    }

    const parsed = JSON.parse(content) as Partial<RouteDecision>;

    const validRoutes: RouteDecision["route"][] = [
      "KARIBU_GRAPHQL",
      "ORDER_MANAGEMENT",
      "GENERAL_CHAT",
      "ANALYTICS",
      "UNKNOWN"
    ];

    const route = validRoutes.includes(parsed.route as RouteDecision["route"])
      ? (parsed.route as RouteDecision["route"])
      : "UNKNOWN";

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.0;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "Classified by routing model";

    return { route, confidence, reason };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Routing error:", errorMessage);
    return {
      route: "UNKNOWN",
      confidence: 0.0,
      reason: `Routing evaluation error: ${errorMessage}`
    };
  }
}
