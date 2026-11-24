/**
 * ============================================================================
 * DATABASE TOOLS ALIAS / COMPATIBILITY EXPORT
 * ============================================================================
 * Redirects all tool calls directly to supabaseDbTools.ts.
 * All operations interact exclusively with the Supabase PostgreSQL database.
 */

export * from "./supabaseDbTools.js";
