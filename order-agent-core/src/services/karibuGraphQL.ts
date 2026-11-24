import "dotenv/config";
import { prisma } from "../db/prisma.js";
import {
  createOrUpdateSalesVoucher,
  voidSalesVoucher,
  confirmSalesVoucherQuotation,
  createOrUpdatePayment
} from "./orderDbService.js";

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
    extensions?: Record<string, any>;
  }>;
}

/**
 * Executes a GraphQL query or mutation directly against the database (SQLite / Supabase).
 * Fully models KARIBU GraphQL responses with Relay connections (nodes & totalCount).
 */
export async function executeKaribuGraphQL<T = any>(
  query: string,
  variables: Record<string, any> = {},
  _accessToken?: string
): Promise<GraphQLResponse<T>> {
  const normalized = query.replace(/\s+/g, " ").trim();

  try {
    // ========================================================================
    // MUTATIONS
    // ========================================================================

    // 1. upsertSalesVoucher
    if (/upsertSalesVoucher/i.test(normalized)) {
      const input = variables.input || variables;
      const voucher = await createOrUpdateSalesVoucher(input);
      return {
        data: {
          upsertSalesVoucher: {
            salesVoucher: {
              id: voucher?.id,
              orderQuote: voucher?.orderQuote,
              voucherNumber: voucher?.voucherNumber,
              salesVoucherStatusId: voucher?.salesVoucherStatusId
            }
          }
        } as T
      };
    }

    // 2. voidSalesVoucher / deleteSalesVoucher
    if (/voidSalesVoucher|deleteSalesVoucher|requestSalesVoucherCancellation/i.test(normalized)) {
      const input = variables.input || variables;
      const voucherId = input.salesVoucherId || input.id;
      const cancelled = await voidSalesVoucher(voucherId, input.cancellationReason);
      return {
        data: {
          voidSalesVoucher: {
            salesVoucher: {
              id: cancelled.id,
              salesVoucherStatusId: cancelled.salesVoucherStatusId
            }
          }
        } as T
      };
    }

    // 3. ConfirmQuotation / confirmSalesVoucherQuotation
    if (/confirmSalesVoucherQuotation|ConfirmQuotation/i.test(normalized)) {
      const input = variables.input || variables;
      const voucherId = input.id || input.salesVoucherId;
      await confirmSalesVoucherQuotation(voucherId);
      return {
        data: {
          confirmSalesVoucherQuotation: {
            boolean: true
          }
        } as T
      };
    }

    // 4. upsertPayment / ApproveOrderPayment / Payment
    if (/upsertPayment|ApproveOrderPayment|Payment/i.test(normalized) && /mutation/i.test(normalized)) {
      const input = variables.input || variables;
      const payment = await createOrUpdatePayment(input);
      return {
        data: {
          upsertPayment: {
            payment: {
              id: payment?.id,
              amount: payment?.amount,
              amountApproved: payment?.amountApproved,
              paymentReference: payment?.paymentReference,
              paymentStatusId: payment?.paymentStatusId,
              salesVoucherId: payment?.salesVoucherId,
              transactionId: payment?.transactionId
            }
          }
        } as T
      };
    }

    // ========================================================================
    // QUERIES
    // ========================================================================

    const limit = variables.first || 50;

    // 5. sales voucher orders & customer sales orders
    if (/customerSalesVoucherOrders|salesVoucherOrders/i.test(normalized)) {
      const [totalCount, nodes] = await Promise.all([
        prisma.salesVoucherOrder.count(),
        prisma.salesVoucherOrder.findMany({
          take: limit,
          orderBy: { createdAt: "desc" },
          include: { customer: true, product: true, destination: true }
        })
      ]);

      const formattedNodes = nodes.map(o => ({
        id: o.id,
        salesOrderNumber: o.salesOrderNumber,
        quantity: o.quantity,
        amountTotal: o.amountTotal,
        customerId: o.customerId,
        customerName: o.customer?.customerName,
        createdAt: o.createdAt.toISOString()
      }));

      return {
        data: {
          customerSalesVoucherOrders: {
            totalCount,
            nodes: formattedNodes
          },
          salesVoucherOrders: {
            totalCount,
            nodes: formattedNodes
          }
        } as T
      };
    }

    // 6. basketOrders & customerBasketOrders
    if (/basketOrders|customerBasketOrders/i.test(normalized)) {
      const [totalCount, nodes] = await Promise.all([
        prisma.basketOrder.count(),
        prisma.basketOrder.findMany({
          take: limit,
          orderBy: { createdAt: "desc" }
        })
      ]);

      const formattedNodes = nodes.map(b => ({
        id: b.id,
        basketOrderNumber: b.basketOrderNumber,
        totalQuantity: b.totalQuantity,
        quantityUsed: b.quantityUsed,
        quantityLeft: b.quantityLeft,
        createdAt: b.createdAt.toISOString()
      }));

      return {
        data: {
          basketOrders: {
            totalCount,
            nodes: formattedNodes
          },
          customerBasketOrders: {
            totalCount,
            nodes: formattedNodes
          }
        } as T
      };
    }

    // 7. payments & userPayments
    if (/payments|userPayments/i.test(normalized)) {
      const [totalCount, nodes] = await Promise.all([
        prisma.payment.count(),
        prisma.payment.findMany({
          take: limit,
          orderBy: { createdAt: "desc" }
        })
      ]);

      const formattedNodes = nodes.map(p => ({
        id: p.id,
        paymentReference: p.paymentReference,
        amount: p.amount,
        amountApproved: p.amountApproved,
        salesVoucherId: p.salesVoucherId,
        paymentStatusId: p.paymentStatusId,
        createdAt: p.createdAt.toISOString()
      }));

      return {
        data: {
          payments: {
            totalCount,
            nodes: formattedNodes
          },
          userPayments: {
            totalCount,
            nodes: formattedNodes
          }
        } as T
      };
    }

    // 8. users
    if (/\busers\b/i.test(normalized)) {
      const [totalCount, nodes] = await Promise.all([
        prisma.user.count(),
        prisma.user.findMany({
          take: limit,
          orderBy: { createdAt: "desc" }
        })
      ]);

      const formattedNodes = nodes.map(u => ({
        id: u.id,
        userName: u.userName,
        fullName: u.fullName || u.userName,
        email: u.email,
        isActive: u.isActive
      }));

      return {
        data: {
          users: {
            totalCount,
            nodes: formattedNodes
          }
        } as T
      };
    }

    // 9. products catalog
    if (/products|GetProductsCatalog/i.test(normalized)) {
      const whereClause = variables.countryId ? { company: { countryId: variables.countryId } } : {};
      const nodes = await prisma.product.findMany({
        take: limit,
        where: whereClause
      });

      const formattedNodes = nodes.map(p => ({
        id: p.id,
        title: p.title,
        itemCode: p.itemCode,
        productGroup: p.productGroup,
        standardUnit: p.standardUnit
      }));

      return {
        data: {
          products: {
            totalCount: formattedNodes.length,
            nodes: formattedNodes
          }
        } as T
      };
    }

    // 10. customers
    if (/customers/i.test(normalized)) {
      const [totalCount, nodes] = await Promise.all([
        prisma.customer.count(),
        prisma.customer.findMany({ take: limit })
      ]);

      const formattedNodes = nodes.map(c => ({
        id: c.id,
        customerName: c.customerName,
        customerCode: c.customerCode,
        accountBalance: c.customerAccountBalance,
        availableCredit: c.customerAvailableCredit,
        customerAccountBalance: c.customerAccountBalance,
        customerAvailableCredit: c.customerAvailableCredit,
        status: c.customerStatusDesc || "Active"
      }));

      return {
        data: {
          customers: {
            totalCount,
            nodes: formattedNodes
          }
        } as T
      };
    }

    // 11. getSalesVoucherById
    if (/getSalesVoucherById|salesVoucherById/i.test(normalized)) {
      const voucher = await prisma.salesVoucher.findUnique({
        where: { id: Number(variables.id) },
        include: {
          customer: true,
          sourceLocation: true,
          destination: true,
          salesVoucherStatus: true,
          items: {
            include: { product: true }
          },
          salesVoucherOrders: true,
          payments: {
            include: {
              paymentMode: true,
              paymentStatus: true,
              paymentTranscriptions: true,
              paymentDocuments: true
            }
          }
        }
      });

      return {
        data: {
          salesVoucher: voucher,
          getSalesVoucherById: voucher
        } as T
      };
    }

    // 12. countries
    if (/countries/i.test(normalized)) {
      const countries = await prisma.country.findMany();
      return {
        data: {
          countries
        } as T
      };
    }

    // 13. locations / loading points
    if (/GetPlantLocations|GetDepotLocations|locations/i.test(normalized)) {
      const locations = await prisma.location.findMany();
      return {
        data: {
          locations,
          GetPlantLocations: locations,
          GetDepotLocations: locations
        } as T
      };
    }

    // 14. destinations
    if (/destinations|getUpdatedCustomerDestinations/i.test(normalized)) {
      const destinations = await prisma.destination.findMany();
      return {
        data: {
          destinations,
          getUpdatedCustomerDestinations: destinations
        } as T
      };
    }

    // 15. banks & branches
    if (/getCountryBanks|banks/i.test(normalized)) {
      const banks = await prisma.bank.findMany({
        include: { bankBranches: true }
      });
      return {
        data: {
          banks,
          getCountryBanks: banks
        } as T
      };
    }

    // Default fallback
    return {
      data: {} as T
    };
  } catch (err: any) {
    return {
      errors: [
        {
          message: `Database Service error executing operation: ${err.message}`
        }
      ]
    };
  }
}
