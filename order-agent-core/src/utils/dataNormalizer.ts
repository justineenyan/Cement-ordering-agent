/**
 * Normalizes disparate GraphQL relay connections, direct lists, mutation results,
 * and entity payloads into a standardized, predictable schema for frontend UI tables and widgets.
 */

export interface NormalizedDataPayload<T = Record<string, unknown>> {
  /**
   * The standardized domain entity name (e.g., "users", "salesOrders", "products", "customers", "payments", "salesVoucher")
   */
  entityType: string;

  /**
   * Total count of available records (from GraphQL totalCount or array length)
   */
  totalCount: number;

  /**
   * Standardized flat array of records for frontend tables/grids.
   * Eliminates entity-specific wrappers like `data.users.nodes` or `data.products.nodes`.
   */
  items: T[];

  /**
   * Primary single record if this is a mutation or single-item query (e.g., created voucher)
   */
  record?: T | null;

  /**
   * Standard Relay cursor pagination metadata if available
   */
  pageInfo?: {
    hasNextPage: boolean;
    hasPreviousPage?: boolean;
    endCursor?: string | null;
    startCursor?: string | null;
  };

  /**
   * Optional high-level calculated metrics (e.g. activeCount, totalVolume)
   */
  metrics?: Record<string, unknown>;

  /**
   * Original raw payload preserved for debugging or custom inspection
   */
  raw?: unknown;
}

/**
/**
 * Normalizes any raw GraphQL data into a standardized NormalizedDataPayload.
 */
export function normalizeEntityData(rawData: unknown, metrics?: Record<string, unknown>): NormalizedDataPayload | unknown {
  if (!rawData || typeof rawData !== "object") {
    if (metrics && typeof metrics === "object") {
      return {
        entityType: "analytics",
        totalCount: Object.keys(metrics).length,
        items: [],
        metrics,
        raw: rawData ?? null
      };
    }
    return rawData ?? null;
  }

  // If already normalized, attach metrics if provided and return
  if ("entityType" in rawData && "items" in rawData) {
    if (metrics) {
      (rawData as NormalizedDataPayload).metrics = metrics;
    }
    return rawData;
  }

  const keys = Object.keys(rawData);
  if (keys.length === 0) {
    return {
      entityType: "empty",
      totalCount: 0,
      items: [],
      ...(metrics ? { metrics } : {})
    };
  }

  // Pick the primary entity root key
  const primaryKey = keys[0]!;
  const primaryVal = (rawData as Record<string, any>)[primaryKey];

  // Map internal/HotChocolate operation names to clean, readable entity types
  const mapEntityType = (key: string): string => {
    if (/customerSalesVoucherOrders|salesVoucherOrders|salesOrders/i.test(key)) return "salesOrders";
    if (/basketOrders/i.test(key)) return "basketOrders";
    if (/users|userProfile|userById/i.test(key)) return "users";
    if (/products|productById/i.test(key)) return "products";
    if (/customers|customerById/i.test(key)) return "customers";
    if (/payments|userPayments/i.test(key)) return "payments";
    if (/countries/i.test(key)) return "countries";
    if (/upsertSalesVoucher|salesVoucher|voidSalesVoucher/i.test(key)) return "salesVoucher";
    return key;
  };

  const entityType = mapEntityType(primaryKey);

  // Case 0: The entity root is explicitly null/undefined (e.g. { customerSalesVoucherOrders: null })
  if (primaryVal === null || primaryVal === undefined) {
    return {
      entityType,
      totalCount: 0,
      items: [],
      ...(metrics ? { metrics } : {}),
      raw: rawData
    };
  }

  // Case 1: Relay Connection object ({ totalCount, pageInfo, nodes })
  if (typeof primaryVal === "object" && Array.isArray(primaryVal.nodes)) {
    const nodes = primaryVal.nodes as Record<string, any>[];
    const totalCount = typeof primaryVal.totalCount === "number" ? primaryVal.totalCount : nodes.length;
    return {
      entityType,
      totalCount,
      items: nodes,
      pageInfo: primaryVal.pageInfo || undefined,
      ...(metrics ? { metrics } : {}),
      raw: rawData
    };
  }

  // Case 2: Direct array ({ countries: [...] }, { users: [...] })
  if (Array.isArray(primaryVal)) {
    return {
      entityType,
      totalCount: primaryVal.length,
      items: primaryVal,
      ...(metrics ? { metrics } : {}),
      raw: rawData
    };
  }

  // Case 3: Key-Value data points / metrics summary (e.g. { activeUsers: 7, totalUsers: 10, activeRate: "70%" })
  const isKeyValueSummary = keys.every(k => {
    const val = (rawData as Record<string, any>)[k];
    return val === null || val === undefined || typeof val === "number" || typeof val === "string" || typeof val === "boolean";
  });

  if (isKeyValueSummary && keys.length > 1) {
    const formattedItems = keys.map(k => {
      const formattedLabel = k
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, str => str.toUpperCase())
        .trim();
      return {
        key: k,
        label: formattedLabel,
        value: (rawData as Record<string, any>)[k]
      };
    });

    return {
      entityType: "dataPoints",
      totalCount: formattedItems.length,
      items: formattedItems,
      metrics: rawData as Record<string, unknown>,
      raw: rawData
    };
  }

  // Case 4: Mutation return or single nested record ({ upsertSalesVoucher: { salesVoucher: { ... } } })
  if (typeof primaryVal === "object") {
    const subKeys = Object.keys(primaryVal);
    const subKey = subKeys[0];
    const subVal = subKey ? primaryVal[subKey] : primaryVal;
    const isSubObject = subVal && typeof subVal === "object" && !Array.isArray(subVal);
    const singleRecord = isSubObject ? subVal : primaryVal;

    return {
      entityType,
      totalCount: 1,
      items: [singleRecord],
      record: singleRecord,
      ...(metrics ? { metrics } : {}),
      raw: rawData
    };
  }

  // Fallback for single primitive/scalar
  return {
    entityType,
    totalCount: 1,
    items: [primaryVal],
    ...(metrics ? { metrics } : {}),
    raw: rawData
  };
}
