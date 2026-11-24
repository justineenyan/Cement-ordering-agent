/**
 * Normalizes and gracefully formats raw KARIBU GraphQL, HotChocolate,
 * rate limit (429), and JWT authorization errors into polite, user-friendly conversational messages.
 * Prevents internal technical details, raw JSON, API keys, or billing URLs from leaking to the frontend.
 */

export interface FormattedErrorResponse {
  isAuthError: boolean;
  isPermissionError: boolean;
  isRateLimitError: boolean;
  friendlyMessage: string;
  rawError?: string;
  suggestedAction?: string;
}

export function formatKaribuErrorMessage(rawError: unknown): FormattedErrorResponse {
  const errorStr = typeof rawError === "string"
    ? rawError
    : (rawError && typeof rawError === "object" && "message" in rawError)
      ? String((rawError as any).message)
      : JSON.stringify(rawError);

  const lower = errorStr.toLowerCase();

  // 1. Rate Limiting / 429 / Token Quota / High Traffic
  if (
    lower.includes("429") ||
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("tokens per minute") ||
    lower.includes("tpm") ||
    lower.includes("quota") ||
    lower.includes("too many requests") ||
    lower.includes("billing") ||
    lower.includes("groq")
  ) {
    return {
      isAuthError: false,
      isPermissionError: false,
      isRateLimitError: true,
      friendlyMessage: "The platform assistant is temporarily experiencing high request volume. Please wait a moment and try your request again.",
      rawError: errorStr,
      suggestedAction: "Please wait 1-2 seconds and retry."
    };
  }

  // 2. Token timeout, expired token, or unauthenticated
  if (
    lower.includes("usernotauthenticated") ||
    lower.includes("not authenticated") ||
    lower.includes("token has expired") ||
    lower.includes("jwt expired") ||
    lower.includes("token expired") ||
    lower.includes("invalid token") ||
    lower.includes("bearer token is invalid") ||
    lower.includes("401") ||
    lower.includes("unauthorized")
  ) {
    return {
      isAuthError: true,
      isPermissionError: false,
      isRateLimitError: false,
      friendlyMessage: "Your session token has expired or authorization is required. Please refresh your session or log in with a valid token to proceed.",
      rawError: errorStr,
      suggestedAction: "Use 'token <your_jwt_token>' or log in to your account."
    };
  }

  // 3. Access Denied / Insufficient permissions / Forbidden
  if (
    lower.includes("access denied") ||
    lower.includes("not authorized to access") ||
    lower.includes("forbidden") ||
    lower.includes("403") ||
    lower.includes("permission denied") ||
    lower.includes("insufficient privileges") ||
    lower.includes("role restriction")
  ) {
    return {
      isAuthError: false,
      isPermissionError: true,
      isRateLimitError: false,
      friendlyMessage: "Access denied. Your account does not have sufficient permissions to view or perform this action on the KARIBU platform. Please contact your organization administrator.",
      rawError: errorStr,
      suggestedAction: "Contact your Heidelberg administrator for permission elevation."
    };
  }

  // 4. Entity Not Found
  if (lower.includes("not found") || lower.includes("does not exist")) {
    return {
      isAuthError: false,
      isPermissionError: false,
      isRateLimitError: false,
      friendlyMessage: "The requested record could not be found in the database. Please verify the ID or reference number and try again.",
      rawError: errorStr
    };
  }

  // 5. Schema / Field validation errors
  if (lower.includes("does not exist on the type") || lower.includes("syntax error") || lower.includes("validation")) {
    return {
      isAuthError: false,
      isPermissionError: false,
      isRateLimitError: false,
      friendlyMessage: "We encountered a data validation issue while processing your request. Please review the details provided and try again.",
      rawError: errorStr
    };
  }

  // 6. Network / Server timeout
  if (lower.includes("timeout") || lower.includes("econnrefused") || lower.includes("fetch failed") || lower.includes("502") || lower.includes("503")) {
    return {
      isAuthError: false,
      isPermissionError: false,
      isRateLimitError: false,
      friendlyMessage: "Unable to reach the platform database service at the moment. Please verify your connection or try again in a few moments.",
      rawError: errorStr
    };
  }

  // 7. Check if error contains raw JSON, internal code, or URLs - NEVER leak developer internals
  if (
    errorStr.includes("{") ||
    errorStr.includes("TypeError") ||
    errorStr.includes("http://") ||
    errorStr.includes("https://") ||
    errorStr.includes("at ") ||
    errorStr.includes("graphql agent error") ||
    errorStr.includes("prisma")
  ) {
    return {
      isAuthError: false,
      isPermissionError: false,
      isRateLimitError: false,
      friendlyMessage: "We encountered an issue processing your request. Please try again in a moment.",
      rawError: errorStr
    };
  }

  // Default clean fallback
  return {
    isAuthError: false,
    isPermissionError: false,
    isRateLimitError: false,
    friendlyMessage: `We could not complete your request: ${errorStr.replace(/[{}"]/g, "").trim()}`,
    rawError: errorStr
  };
}
