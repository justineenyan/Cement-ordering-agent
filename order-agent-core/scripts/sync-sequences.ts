import { prisma } from "../src/db/prisma.js";

async function syncSequences() {
  console.log("🔄 Synchronizing PostgreSQL sequence IDs...");
  const tables = [
    "SalesVoucher",
    "SalesVoucherItem",
    "SalesVoucherOrder",
    "Payment",
    "PaymentTranscription",
    "PaymentDocument",
    "BasketOrder",
    "Vehicle",
    "Driver"
  ];

  for (const table of tables) {
    try {
      await prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('"${table}"', 'id'),
          COALESCE((SELECT MAX(id) FROM "${table}"), 1)
        );
      `);
      console.log(`✅ Synced sequence for: ${table}`);
    } catch (e: any) {
      console.log(`⚠️ Note for ${table}: ${e.message}`);
    }
  }

  console.log("🎉 Sequences synchronized!");
}

syncSequences()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
