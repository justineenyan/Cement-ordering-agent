import { prisma } from "./src/db/prisma.js";

async function verifyDatabase() {
  console.log("🔍 Verifying Mock Database Records...\n");

  const [
    countriesCount,
    companiesCount,
    locationsCount,
    productsCount,
    customersCount,
    usersCount,
    vouchersCount,
    ordersCount,
    paymentsCount,
    transcriptionsCount
  ] = await Promise.all([
    prisma.country.count(),
    prisma.company.count(),
    prisma.location.count(),
    prisma.product.count(),
    prisma.customer.count(),
    prisma.user.count(),
    prisma.salesVoucher.count(),
    prisma.salesVoucherOrder.count(),
    prisma.payment.count(),
    prisma.paymentTranscription.count()
  ]);

  const [
    deliveredCount,
    exwCount,
    pendingCount,
    paymentSubmittedCount,
    confirmedCount,
    rejectedCount
  ] = await Promise.all([
    prisma.salesVoucher.count({ where: { isDeliveryInclusive: true } }),
    prisma.salesVoucher.count({ where: { isDeliveryInclusive: false } }),
    prisma.salesVoucher.count({ where: { salesVoucherStatusId: 1 } }),
    prisma.salesVoucher.count({ where: { salesVoucherStatusId: 8 } }),
    prisma.salesVoucher.count({ where: { salesVoucherStatusId: { in: [4, 5, 9] } } }),
    prisma.salesVoucher.count({ where: { salesVoucherStatusId: 7 } })
  ]);

  console.log("📊 Summary Table:");
  console.table({
    Countries: countriesCount,
    Companies: companiesCount,
    Locations: locationsCount,
    Products: productsCount,
    Customers: customersCount,
    Users: usersCount,
    SalesVouchers: vouchersCount,
    SalesOrders: ordersCount,
    Payments: paymentsCount,
    PaymentTranscriptions: transcriptionsCount,
    "DeliveryType: DELIVERED": deliveredCount,
    "DeliveryType: EXW": exwCount,
    "Status: Pending": pendingCount,
    "Status: PaymentSubmitted": paymentSubmittedCount,
    "Status: Confirmed": confirmedCount,
    "Status: Rejected/Cancelled": rejectedCount
  });

  // Query SO-1052 with its full relation graph
  const orderWithDetails = await prisma.salesVoucher.findUnique({
    where: { voucherNumber: "SV-1052" },
    include: {
      customer: true,
      sourceLocation: true,
      destination: true,
      salesVoucherStatus: true,
      items: {
        include: {
          product: true
        }
      },
      salesVoucherOrders: true,
      payments: {
        include: {
          paymentMode: true,
          paymentStatus: true,
          paymentTranscriptions: {
            include: {
              bank: true,
              bankBranch: true,
              documentType: true
            }
          },
          paymentDocuments: true
        }
      }
    }
  });

  console.log("\n📦 Sample Order Graph (SV-1052 / SO-1052):");
  console.log(JSON.stringify(orderWithDetails, null, 2));

  console.log("\n✅ Database verification complete. Ready for AI Agent integration & testing!");
}

verifyDatabase()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
