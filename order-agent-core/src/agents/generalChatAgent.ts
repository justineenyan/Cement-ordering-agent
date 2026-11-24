import Groq from "groq-sdk";
import "dotenv/config";

const groq = new Groq({
  apiKey: process.env.ORDER_ROUTER_KEY || process.env.GROQ_API_KEY
});

// Domain knowledge and FAQs for the KARIBU platform
const KARIBU_SYSTEM_PROMPT = `
You are the KARIBU Assistant, a friendly and professional conversational AI for the KARIBU platform.

About KARIBU:
KARIBU is an order management and distribution platform tailored for construction materials (primarily cement like Dangote, Lafarge, BUA), distributor accounts, and payment reconciliation.

Your Responsibilities:
1. Greet users warmly and answer general questions about KARIBU.
2. Answer frequently asked questions (FAQs):
   - What is KARIBU: An intelligent platform connecting buyers, distributors, and admins for ordering cement, verifying bank payments, and sequencing delivery dispatches.
   - How to Order: Users can request cement by specifying the brand (e.g., Dangote 3X, Lafarge Elephant), quantity in 50kg bags, and delivery site/address.
   - Proof of Payment (PoP): Customers upload transfer receipts or provide transaction references for admin verification before dispatch.
   - Order Status: Users can inquire about pending, confirmed, or dispatched orders using their account ID or order number.
   - Working Hours: Customer service and dispatches operate Monday to Saturday, 8:00 AM - 6:00 PM.
3. If an input is vague, confused, or was flagged as UNKNOWN/gibberish, kindly guide the user on what KARIBU can do and prompt them with helpful examples.

Tone: Professional, helpful, concise, and polite.
Do not invent GraphQL mutations or internal database IDs yourself—explain capabilities naturally.
`;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Conversation history buffer for multi-turn context
const conversationHistory: ChatMessage[] = [
  { role: "system", content: KARIBU_SYSTEM_PROMPT }
];

export async function handleGeneralChat(
  userPrompt: string,
  options?: { isUnknown?: boolean }
): Promise<string> {
  try {
    let promptToSend = userPrompt;

    if (options?.isUnknown) {
      promptToSend = `[System Notice: The user entered an unrecognized or unclear input: "${userPrompt}". Please politely explain that you didn't understand, and briefly summarize what you can help them with on KARIBU (e.g., ordering cement, checking order status, or payment FAQs).]`;
    }

    conversationHistory.push({ role: "user", content: promptToSend });

    // Keep the last 10 turns to avoid context overflow
    if (conversationHistory.length > 12) {
      conversationHistory.splice(1, conversationHistory.length - 11);
    }

    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: conversationHistory,
      temperature: 0.7,
      max_tokens: 300
    });

    const reply = response.choices[0]?.message?.content?.trim() || "I'm here to help with your KARIBU account, cement orders, and FAQs. How can I assist you today?";

    conversationHistory.push({ role: "assistant", content: reply });

    return reply;
  } catch (err) {
    console.error("General chat agent error:", err);
    return "I apologize, but I am having trouble processing your message right now. How can I help you with KARIBU?";
  }
}
