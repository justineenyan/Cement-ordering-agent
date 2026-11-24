import { prisma } from "../src/db/prisma.js";

async function main() {
  console.log("🌱 Starting KARIBU database seeding (Enterprise Scale: 220+ Vouchers, 80 Users)...");

  // --------------------------------------------------------------------------
  // 1. Status Dictionaries
  // --------------------------------------------------------------------------
  console.log("-> Seeding status dictionaries...");

  const salesVoucherStatuses = [
    { id: 0, description: "WaitingForQuotation", translationKey: "status.waiting_quotation" },
    { id: 1, description: "Quotation", translationKey: "status.quotation" },
    { id: 2, description: "OrderConfirmed", translationKey: "status.order_confirmed" },
    { id: 3, description: "PaymentConfirmed", translationKey: "status.payment_confirmed" },
    { id: 4, description: "Dispatched", translationKey: "status.dispatched" },
    { id: 5, description: "Delivered", translationKey: "status.delivered" },
    { id: 6, description: "Completed", translationKey: "status.completed" },
    { id: 7, description: "Cancelled", translationKey: "status.cancelled" },
    { id: 8, description: "PaymentSubmitted", translationKey: "status.payment_submitted" },
    { id: 9, description: "SOGenerated", translationKey: "status.so_generated" },
    { id: 10, description: "QuotationGenerated", translationKey: "status.quotation_generated" },
    { id: 11, description: "QuotationConfirmed", translationKey: "status.quotation_confirmed" },
    { id: 12, description: "Pending", translationKey: "status.pending" },
    { id: 13, description: "PartiallyConfirmed", translationKey: "status.partially_confirmed" },
    { id: 14, description: "CancellationRequested", translationKey: "status.cancellation_requested" },
    { id: 15, description: "ProcessingCancellationRequest", translationKey: "status.processing_cancellation" }
  ];
  for (const s of salesVoucherStatuses) {
    await prisma.salesVoucherStatus.upsert({ where: { id: s.id }, update: s, create: s });
  }

  const salesVoucherOrderStatuses = [
    { id: 10, description: "Unconfirmed" },
    { id: 20, description: "Confirmed" },
    { id: 30, description: "Cancelled" },
    { id: 40, description: "Dispatched" },
    { id: 50, description: "Delivered" }
  ];
  for (const s of salesVoucherOrderStatuses) {
    await prisma.salesVoucherOrderStatus.upsert({ where: { id: s.id }, update: s, create: s });
  }

  const basketOrderStatuses = [
    { id: 1, description: "Open" },
    { id: 2, description: "InProgress" },
    { id: 3, description: "Completed" },
    { id: 4, description: "Expired" }
  ];
  for (const s of basketOrderStatuses) {
    await prisma.basketOrderStatus.upsert({ where: { id: s.id }, update: s, create: s });
  }

  const paymentStatuses = [
    { id: 1, description: "Pending", translationKey: "payment.pending" },
    { id: 2, description: "Approved", translationKey: "payment.approved" },
    { id: 3, description: "Rejected", translationKey: "payment.rejected" },
    { id: 4, description: "Cancelled", translationKey: "payment.cancelled" },
    { id: 5, description: "Closed", translationKey: "payment.closed" },
    { id: 6, description: "TranscriptionRequired", translationKey: "payment.transcription_required" },
    { id: 7, description: "TreasurerApprovalRequired", translationKey: "payment.treasurer_approval" },
    { id: 8, description: "FinalApprovalRequired", translationKey: "payment.final_approval" },
    { id: 9, description: "SalesOfficerApprovalRequired", translationKey: "payment.sales_officer_approval" }
  ];
  for (const s of paymentStatuses) {
    await prisma.paymentStatus.upsert({ where: { id: s.id }, update: s, create: s });
  }

  const documentTypes = [
    { id: 1, description: "E-Payment", translationKey: "doc.e_payment" },
    { id: 2, description: "Cash Deposit Slip", translationKey: "doc.cash_deposit" },
    { id: 3, description: "Cheque Deposit Slip", translationKey: "doc.cheque_deposit" },
    { id: 4, description: "Cheque", translationKey: "doc.cheque" },
    { id: 5, description: "Haulage Claim Certificate", translationKey: "doc.haulage_claim" },
    { id: 6, description: "Credit Order Certificate", translationKey: "doc.credit_order" },
    { id: 7, description: "Bank Transfer Note", translationKey: "doc.bank_transfer" },
    { id: 8, description: "Endorsed Draft", translationKey: "doc.endorsed_draft" },
    { id: 9, description: "Available Balance", translationKey: "doc.available_balance" }
  ];
  for (const d of documentTypes) {
    await prisma.documentType.upsert({ where: { id: d.id }, update: d, create: d });
  }

  // --------------------------------------------------------------------------
  // 2. Countries & Companies
  // --------------------------------------------------------------------------
  console.log("-> Seeding Countries and Companies...");

  await prisma.country.upsert({
    where: { id: 7 },
    update: {},
    create: {
      id: 7,
      name: "Ghana",
      alpha2: "GH",
      alpha3: "GHA",
      callingCode: "+233",
      cluster: 1
    }
  });

  await prisma.country.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      name: "Benin",
      alpha2: "BJ",
      alpha3: "BEN",
      callingCode: "+229",
      cluster: 1
    }
  });

  await prisma.company.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      code: "GH01",
      name: "Heidelberg Materials Ghana (Ghacem Ltd)",
      countryId: 7,
      email: "orders@ghacem.com",
      telephoneNumber: "+233302200100",
      customerTranscription: true,
      defaultCurrencyCode: "GHS",
      defaultCurrencySymbol: "GH₵",
      allowDepotSelection: true,
      allowOrderCancellation: true,
      allowOrderAmendment: false
    }
  });

  await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      code: "BJ01",
      name: "CIMBENIN S.A.",
      countryId: 1,
      email: "contact@cimbenin.bj",
      telephoneNumber: "+22921300200",
      customerTranscription: true,
      defaultCurrencyCode: "XOF",
      defaultCurrencySymbol: "CFA",
      allowDepotSelection: true,
      allowOrderCancellation: true,
      allowOrderAmendment: false
    }
  });

  // --------------------------------------------------------------------------
  // 3. Locations (Plants & Depots)
  // --------------------------------------------------------------------------
  console.log("-> Seeding Locations...");

  const locations = [
    {
      id: 12,
      code: "TEMA-PLANT",
      name: "Tema Plant",
      companyId: 3,
      type: "PLANT",
      allowDeliveryTypeSelection: true,
      defaultDeliveryType: "EXW",
      useFileUpload: true,
      useConfirmQuotation: true,
      useDeliveredOrderManagement: true,
      requireDestinationSelectionForExworks: false
    },
    {
      id: 13,
      code: "TAK-PLANT",
      name: "Takoradi Plant",
      companyId: 3,
      type: "PLANT",
      allowDeliveryTypeSelection: true,
      defaultDeliveryType: "DELIVERED",
      useFileUpload: true,
      useConfirmQuotation: true,
      useDeliveredOrderManagement: true,
      requireDestinationSelectionForExworks: false
    },
    {
      id: 14,
      code: "KUM-DEPOT",
      name: "Kumasi Depot",
      companyId: 3,
      type: "DEPOT",
      allowDeliveryTypeSelection: true,
      defaultDeliveryType: "EXW",
      useFileUpload: true,
      useConfirmQuotation: false,
      useDeliveredOrderManagement: true,
      requireDestinationSelectionForExworks: false
    },
    {
      id: 1,
      code: "COTONOU-PLANT",
      name: "CIMBENIN Cotonou",
      companyId: 1,
      type: "PLANT",
      allowDeliveryTypeSelection: true,
      defaultDeliveryType: "DELIVERED",
      useFileUpload: true,
      useConfirmQuotation: false,
      useDeliveredOrderManagement: true,
      requireDestinationSelectionForExworks: true
    }
  ];
  for (const loc of locations) {
    await prisma.location.upsert({ where: { id: loc.id }, update: loc, create: loc });
  }

  // --------------------------------------------------------------------------
  // 4. Delivery Destinations
  // --------------------------------------------------------------------------
  console.log("-> Seeding Delivery Destinations...");

  const destinations = [
    { id: 88, code: "ACC-01", name: "Accra Central", region: "Greater Accra", country: "Ghana", companyId: 3, minDeliveryDays: 2.0, distance: 35.0 },
    { id: 89, code: "TMA-01", name: "Tema Industrial Area", region: "Greater Accra", country: "Ghana", companyId: 3, minDeliveryDays: 1.0, distance: 10.0 },
    { id: 90, code: "KMS-01", name: "Kumasi Kejetia Hub", region: "Ashanti", country: "Ghana", companyId: 3, minDeliveryDays: 3.0, distance: 250.0 },
    { id: 91, code: "TKD-01", name: "Takoradi Commercial Port", region: "Western", country: "Ghana", companyId: 3, minDeliveryDays: 2.0, distance: 220.0 },
    { id: 92, code: "CTN-01", name: "Cotonou Port Area", region: "Littoral", country: "Benin", companyId: 1, minDeliveryDays: 1.0, distance: 15.0 },
    { id: 93, code: "KAS-01", name: "Kasoa Millennium City", region: "Central", country: "Ghana", companyId: 3, minDeliveryDays: 2.0, distance: 55.0 },
    { id: 94, code: "TAM-01", name: "Tamale Central Depot", region: "Northern", country: "Ghana", companyId: 3, minDeliveryDays: 4.0, distance: 620.0 }
  ];
  for (const dst of destinations) {
    await prisma.destination.upsert({ where: { id: dst.id }, update: dst, create: dst });
  }

  // --------------------------------------------------------------------------
  // 5. Products Catalog
  // --------------------------------------------------------------------------
  console.log("-> Seeding Products Catalog...");

  const products = [
    { id: 23, itemCode: "52.5N", title: "CEM II/A-LL 52.5R - SAC", productGroup: "Cement Bags", standardUnit: "bags", weighPiece: 50.0, unitPrice: 110.0, description: "High-grade 52.5R Portland cement for structural engineering.", companyId: 3 },
    { id: 22, itemCode: "42.5R", title: "CEM I 42.5R - SAC", productGroup: "Cement Bags", standardUnit: "bags", weighPiece: 50.0, unitPrice: 95.0, description: "Premium rapid-hardening ordinary Portland cement.", companyId: 3 },
    { id: 51, itemCode: "42.5R-B", title: "CEM II/B-LL 42.5R - SAC", productGroup: "Cement Bags", standardUnit: "bags", weighPiece: 50.0, unitPrice: 92.0, description: "Limestone composite cement for general concrete works.", companyId: 3 },
    { id: 50, itemCode: "CPJ45", title: "SUPERCPJ45-SAC", productGroup: "Cement Bags", standardUnit: "bags", weighPiece: 50.0, unitPrice: 90.0, description: "CPJ 45 multi-purpose construction grade cement.", companyId: 3 },
    { id: 41, itemCode: "BFORTE", title: "BFORTE CEM II/B-M 42.5N", productGroup: "Cement Bags", standardUnit: "bags", weighPiece: 50.0, unitPrice: 88.0, description: "B-Forte high performance masonry and plastering cement.", companyId: 3 },
    { id: 40, itemCode: "BCONSTROI", title: "BCONSTROI CEM II/B-M 32.5N", productGroup: "Cement Bags", standardUnit: "bags", weighPiece: 50.0, unitPrice: 82.0, description: "General building and domestic construction cement.", companyId: 3 },
    { id: 33, itemCode: "EXTRA", title: "GHACEM EXTRA 425N IN BAGS", productGroup: "Cement Bags", standardUnit: "bags", weighPiece: 50.0, unitPrice: 94.0, description: "Ghacem Extra 42.5N industrial strength bag cement.", companyId: 3 },
    { id: 34, itemCode: "SUPER_STRONG", title: "SUPER STRONG 425R IN BAGS", productGroup: "Cement Bags", standardUnit: "bags", weighPiece: 50.0, unitPrice: 96.0, description: "Super Strong high-early strength cement.", companyId: 3 }
  ];
  for (const prod of products) {
    await prisma.product.upsert({ where: { id: prod.id }, update: prod, create: prod });
  }

  // --------------------------------------------------------------------------
  // 6. Banks & Bank Branches
  // --------------------------------------------------------------------------
  console.log("-> Seeding Banks and Branches...");

  const banks = [
    { id: 5, name: "Stanbic Bank Ghana", code: "SBIC", countryId: 7 },
    { id: 1, name: "Ecobank Ghana", code: "ECO", countryId: 7 },
    { id: 2, name: "GCB Bank Ltd", code: "GCB", countryId: 7 },
    { id: 3, name: "Absa Bank Ghana", code: "ABSA", countryId: 7 },
    { id: 4, name: "Fidelity Bank Ghana", code: "FDL", countryId: 7 },
    { id: 6, name: "CalBank PLC", code: "CAL", countryId: 7 },
    { id: 7, name: "Zenith Bank Ghana", code: "ZEN", countryId: 7 },
    { id: 9, name: "MTN Mobile Money", code: "MTN", countryId: 7 },
    { id: 10, name: "Telecel Cash", code: "TEL", countryId: 7 }
  ];
  for (const b of banks) {
    await prisma.bank.upsert({ where: { id: b.id }, update: b, create: b });
  }

  const branches = [
    { id: 17, name: "Stanbic Tema Main", code: "SBIC-TMA", bankId: 5 },
    { id: 18, name: "Stanbic High Street", code: "SBIC-HST", bankId: 5 },
    { id: 19, name: "Ecobank Silver Star", code: "ECO-SLV", bankId: 1 },
    { id: 20, name: "GCB Commercial High Street", code: "GCB-HST", bankId: 2 },
    { id: 21, name: "Absa Spintex Branch", code: "ABSA-SPX", bankId: 3 },
    { id: 22, name: "Zenith Airport City", code: "ZEN-APT", bankId: 7 }
  ];
  for (const br of branches) {
    await prisma.bankBranch.upsert({ where: { id: br.id }, update: br, create: br });
  }

  // --------------------------------------------------------------------------
  // 7. Payment Modes
  // --------------------------------------------------------------------------
  console.log("-> Seeding Payment Modes...");

  const paymentModes = [
    { id: 1, name: "Mobile Money (MTN / Telecel)", documentTypeId: 1, companyId: 3, paymentModeTypeId: 1, paymentModeStatusId: 1 },
    { id: 2, name: "Cash Deposit Slip", documentTypeId: 2, companyId: 3, paymentModeTypeId: 2, paymentModeStatusId: 1 },
    { id: 3, name: "Cheque Deposit Slip", documentTypeId: 3, companyId: 3, paymentModeTypeId: 2, paymentModeStatusId: 1 },
    { id: 7, name: "Bank Transfer Note (RTGS/ACH)", documentTypeId: 7, companyId: 3, paymentModeTypeId: 2, paymentModeStatusId: 1 },
    { id: 9, name: "Available Credit / Ledger Balance", documentTypeId: 9, companyId: 3, paymentModeTypeId: 2, paymentModeStatusId: 1 }
  ];
  for (const pm of paymentModes) {
    await prisma.paymentMode.upsert({ where: { id: pm.id }, update: pm, create: pm });
  }

  // --------------------------------------------------------------------------
  // 8. Customers (20 Enterprise Construction Organizations)
  // --------------------------------------------------------------------------
  console.log("-> Seeding Customers (20 Enterprise Organizations)...");

  const customerDefinitions = [
    { id: 107, code: "CUST-107", name: "Kwame Mensah Construction Ltd", email: "kwame.mensah@construction.gh", phone: "+233201122334", bal: 145000, cred: 250000, lim: 300000 },
    { id: 108, code: "CUST-108", name: "Tema Concrete Works", email: "orders@temaconcrete.gh", phone: "+233244556677", bal: 82000, cred: 150000, lim: 200000 },
    { id: 109, code: "CUST-109", name: "Accra Infrastructure Partners", email: "procurement@accrainfra.gh", phone: "+233509988776", bal: 350000, cred: 500000, lim: 600000 },
    { id: 110, code: "CUST-110", name: "Consar Construction Ltd", email: "orders@consar.gh", phone: "+233322022110", bal: 520000, cred: 800000, lim: 1000000 },
    { id: 111, code: "CUST-111", name: "De-Simone Group Ghana", email: "procurement@desimone.gh", phone: "+233302778899", bal: 210000, cred: 450000, lim: 500000 },
    { id: 112, code: "CUST-112", name: "Berock Ventures Ltd", email: "projects@berock.gh", phone: "+233302244556", bal: 175000, cred: 320000, lim: 400000 },
    { id: 113, code: "CUST-113", name: "Inzag Germany GH Ltd", email: "klaus.weber@inzag.de", phone: "+233241100220", bal: 890000, cred: 1200000, lim: 1500000 },
    { id: 114, code: "CUST-114", name: "QGMI Construction Ghana", email: "procurement@qgmi.gh", phone: "+233554433221", bal: 640000, cred: 950000, lim: 1000000 },
    { id: 115, code: "CUST-115", name: "Modern City Building Supplies", email: "sales@moderncity.gh", phone: "+233312022334", bal: 68000, cred: 180000, lim: 250000 },
    { id: 116, code: "CUST-116", name: "Atlantic Concrete Products", email: "info@atlanticconcrete.gh", phone: "+233208877665", bal: 95000, cred: 220000, lim: 300000 },
    { id: 117, code: "CUST-117", name: "Goldkey Properties Ltd", email: "procurement@goldkey.gh", phone: "+233302789012", bal: 410000, cred: 600000, lim: 750000 },
    { id: 118, code: "CUST-118", name: "Maripoma Enterprise Ltd", email: "roads@maripoma.gh", phone: "+233322044889", bal: 315000, cred: 550000, lim: 700000 },
    { id: 119, code: "CUST-119", name: "KAS Products Ghana", email: "orders@kasproducts.gh", phone: "+233245678901", bal: 42000, cred: 120000, lim: 150000 },
    { id: 120, code: "CUST-120", name: "Gha-German Concrete Products", email: "orders@ghagerman.gh", phone: "+233209887711", bal: 185000, cred: 350000, lim: 450000 },
    { id: 121, code: "CUST-121", name: "Wilmar Construction Africa", email: "africa.orders@wilmar.com", phone: "+233303311220", bal: 480000, cred: 700000, lim: 900000 },
    { id: 122, code: "CUST-122", name: "Core Construction Ltd", email: "info@coreghana.com", phone: "+233240112299", bal: 260000, cred: 420000, lim: 500000 },
    { id: 123, code: "CUST-123", name: "Antwi-Boasiako Construction", email: "antwiboasiako@const.gh", phone: "+233322088112", bal: 135000, cred: 280000, lim: 350000 },
    { id: 124, code: "CUST-124", name: "Fabulous Concrete Works", email: "orders@fabulousconcrete.gh", phone: "+233501239988", bal: 75000, cred: 160000, lim: 200000 },
    { id: 125, code: "CUST-125", name: "Kite Construction Services", email: "projects@kiteconst.gh", phone: "+233271100445", bal: 115000, cred: 240000, lim: 300000 },
    { id: 126, code: "CUST-126", name: "Skyline Real Estate Developers", email: "procurement@skyline.gh", phone: "+233550991122", bal: 390000, cred: 580000, lim: 700000 }
  ];

  for (const c of customerDefinitions) {
    await prisma.customer.upsert({
      where: { id: c.id },
      update: {
        customerName: c.name,
        customerAccountBalance: c.bal,
        customerAvailableCredit: c.cred,
        customerCrLimit: c.lim
      },
      create: {
        id: c.id,
        customerCode: c.code,
        customerName: c.name,
        email: c.email,
        phoneNumber: c.phone,
        companyId: 3,
        customerAccountBalance: c.bal,
        customerAvailableCredit: c.cred,
        customerCrLimit: c.lim,
        customerOpenOrders: 0.0,
        customerStatus: 1,
        customerStatusDesc: "Active",
        customerCurrency: "GHS"
      }
    });
  }

  // --------------------------------------------------------------------------
  // 9. Users (80+ Users: Customers, Sales Officers, Treasurers, Logistics, Admins)
  // --------------------------------------------------------------------------
  console.log("-> Seeding Users (80 Platform Users)...");

  const ghFirstNames = [
    "Kwame", "Kofi", "Yaw", "Kojo", "Kwabena", "Kwaku", "Kwesi", "Ama", "Akua",
    "Yaa", "Afia", "Abena", "Esi", "Adwoa", "Emmanuel", "Samuel", "David",
    "Joseph", "Michael", "Daniel", "Francis", "Richard", "Peter", "Charles",
    "Christian", "Isaac", "John", "Kester", "Patrick", "Benjamin", "Prince",
    "Felix", "Ibrahim", "Mohammed", "Mustapha", "Salifu", "Haruna", "Suleiman",
    "Klaus", "Roberto", "Manuel", "Frank", "Mercy", "Naa", "Sarah", "Grace",
    "Beatrice", "Evelyn", "Patience", "Gladys", "Florence", "Comfort"
  ];
  const ghLastNames = [
    "Mensah", "Osei", "Addo", "Anane", "Kwarteng", "Boateng", "Appiah", "Agyemang",
    "Adjei", "Nyarko", "Antwi", "Marfo", "Boasiako", "Danso", "Owusu", "Frimpong",
    "Acheampong", "Amponsah", "Agyei", "Donkor", "Asante", "Boadu", "Bempah",
    "Darko", "Fosu", "Gyamfi", "Gyasi", "Konadu", "Kusi", "Kyere", "Nti", "Opoku",
    "Prempeh", "Sarkodie", "Tuffour", "Yeboah", "Baah", "Quaye", "Tagoe", "Lartey",
    "Aryee", "Lamptey", "Mills", "Vanderpuye", "Salifu", "Haruna", "Weber", "Simone"
  ];

  const userList: Array<{
    id: string;
    userName: string;
    fullName: string;
    email: string;
    phoneNumber: string;
    companyId: number;
    customerId?: number | null;
    locationId?: number | null;
    role: string;
  }> = [];

  // Anchor users
  userList.push(
    { id: "usr-001", userName: "kwame.mensah", fullName: "Kwame Mensah", email: "kwame.mensah@construction.gh", phoneNumber: "+233201122334", companyId: 3, customerId: 107, locationId: 12, role: "CUSTOMER" },
    { id: "usr-002", userName: "ama.addo", fullName: "Ama Addo", email: "ama.addo@heidelbergmaterials.com", phoneNumber: "+233240001122", companyId: 3, customerId: null, locationId: 12, role: "SALES_OFFICER" },
    { id: "usr-003", userName: "kofi.treasury", fullName: "Kofi Anane", email: "treasury@ghacem.com", phoneNumber: "+233550003344", companyId: 3, customerId: null, locationId: 12, role: "TREASURER" },
    { id: "usr-004", userName: "david.kwarteng", fullName: "David Kwarteng", email: "david.kwarteng@ghacem.com", phoneNumber: "+233209988112", companyId: 3, customerId: null, locationId: 12, role: "LOGISTICS" },
    { id: "usr-005", userName: "sarah.mensah", fullName: "Sarah Mensah", email: "sarah.mensah@ghacem.com", phoneNumber: "+233241122998", companyId: 3, customerId: null, locationId: 12, role: "ADMIN" }
  );

  // Generate users usr-006 through usr-085 (80 total users)
  for (let i = 6; i <= 82; i++) {
    const id = `usr-${String(i).padStart(3, "0")}`;
    const fn = ghFirstNames[(i * 3 + 7) % ghFirstNames.length]!;
    const ln = ghLastNames[(i * 5 + 11) % ghLastNames.length]!;
    const fullName = `${fn} ${ln}`;
    const userName = `${fn.toLowerCase()}.${ln.toLowerCase()}.${i}`;
    const phone = `+233${20 + (i % 5)}${String(1000000 + i * 3721).slice(0, 7)}`;

    let role = "CUSTOMER";
    let customerId: number | null = customerDefinitions[(i - 6) % customerDefinitions.length]!.id;
    let locationId: number | null = 12 + (i % 3);

    if (i >= 65 && i <= 72) {
      role = "SALES_OFFICER";
      customerId = null;
    } else if (i >= 73 && i <= 76) {
      role = "TREASURER";
      customerId = null;
    } else if (i >= 77 && i <= 79) {
      role = "LOGISTICS";
      customerId = null;
    } else if (i >= 80) {
      role = "ADMIN";
      customerId = null;
    }

    const emailDomain = customerId ? "construction.gh" : "ghacem.com";
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@${emailDomain}`;

    userList.push({
      id,
      userName,
      fullName,
      email,
      phoneNumber: phone,
      companyId: 3,
      customerId,
      locationId,
      role
    });
  }

  for (const u of userList) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        userName: u.userName,
        fullName: u.fullName,
        email: u.email,
        phoneNumber: u.phoneNumber,
        customerId: u.customerId,
        role: u.role
      },
      create: u
    });
  }

  // --------------------------------------------------------------------------
  // 10. Vehicles & Drivers
  // --------------------------------------------------------------------------
  console.log("-> Seeding Vehicles and Drivers...");

  const vehicles = [
    { vehicleNo: "GT-4820-22", transporterCode: "TRANS-GH-01", countryId: 7, capacity: 35.0 },
    { vehicleNo: "GT-5910-23", transporterCode: "TRANS-GH-02", countryId: 7, capacity: 40.0 },
    { vehicleNo: "GS-8821-21", transporterCode: "TRANS-GH-01", countryId: 7, capacity: 30.0 },
    { vehicleNo: "WR-4012-22", transporterCode: "TRANS-GH-03", countryId: 7, capacity: 35.0 },
    { vehicleNo: "AS-7190-24", transporterCode: "TRANS-GH-02", countryId: 7, capacity: 45.0 }
  ];
  for (const v of vehicles) {
    await prisma.vehicle.upsert({ where: { vehicleNo: v.vehicleNo }, update: v, create: v });
  }

  const drivers = [
    { firstName: "Kofi", lastName: "Mensah", licenseNo: "GH-DRV-100234", phoneNo: "+233201234567", transporterCode: "TRANS-GH-01", countryId: 7 },
    { firstName: "Ibrahim", lastName: "Salifu", licenseNo: "GH-DRV-100235", phoneNo: "+233245556677", transporterCode: "TRANS-GH-02", countryId: 7 },
    { firstName: "Yaw", lastName: "Boateng", licenseNo: "GH-DRV-100236", phoneNo: "+233501112233", transporterCode: "TRANS-GH-01", countryId: 7 },
    { firstName: "Christian", lastName: "Dzifa", licenseNo: "GH-DRV-100237", phoneNo: "+233278889900", transporterCode: "TRANS-GH-03", countryId: 7 },
    { firstName: "Musa", lastName: "Haruna", licenseNo: "GH-DRV-100238", phoneNo: "+233554443322", transporterCode: "TRANS-GH-02", countryId: 7 }
  ];
  for (const drv of drivers) {
    await prisma.driver.upsert({ where: { licenseNo: drv.licenseNo }, update: drv, create: drv });
  }

  // --------------------------------------------------------------------------
  // 11. Basket Orders
  // --------------------------------------------------------------------------
  console.log("-> Seeding Basket Orders...");

  const basketOrders = [
    { id: 1, basketOrderNumber: "BO-2026-001", totalQuantity: 1000.0, quantityUsed: 350.0, quantityLeft: 650.0, salesVoucherCount: 3, customerId: 107, companyId: 3, basketOrderStatusId: 2 },
    { id: 2, basketOrderNumber: "BO-2026-002", totalQuantity: 5000.0, quantityUsed: 600.0, quantityLeft: 4400.0, salesVoucherCount: 2, customerId: 110, companyId: 3, basketOrderStatusId: 2 },
    { id: 3, basketOrderNumber: "BO-2026-003", totalQuantity: 10000.0, quantityUsed: 1000.0, quantityLeft: 9000.0, salesVoucherCount: 1, customerId: 113, companyId: 3, basketOrderStatusId: 2 }
  ];
  for (const bo of basketOrders) {
    await prisma.basketOrder.upsert({ where: { basketOrderNumber: bo.basketOrderNumber }, update: bo, create: bo });
  }

  // --------------------------------------------------------------------------
  // 12. Programmatic High-Scale Seeding: 220 Sales Vouchers and Orders
  // --------------------------------------------------------------------------
  console.log("-> Generating 220 Sales Vouchers, Items, and Sales Orders with varied statuses...");

  const voucherStatusDistribution = [
    8, 8, 8, 8, 8, // PaymentSubmitted (~25%)
    12, 12, 12, 12, // Pending (~20%)
    11, 11, 11, // QuotationConfirmed (~15%)
    2, 2, // OrderConfirmed (~10%)
    3, 3, 3, 3, // PaymentConfirmed (~20%)
    4, 4, // Dispatched (~10%)
    5, 5, 5, // Delivered (~15%)
    7, 7 // Cancelled / Rejected (~10%)
  ];

  const productList = [
    { id: 23, price: 110.0 }, // 52.5N
    { id: 22, price: 95.0 },  // 42.5R
    { id: 51, price: 92.0 },  // 42.5R-B
    { id: 50, price: 90.0 },  // CPJ45
    { id: 41, price: 88.0 },  // BFORTE
    { id: 40, price: 82.0 },  // BCONSTROI
    { id: 33, price: 94.0 },  // EXTRA
    { id: 34, price: 96.0 }   // SUPER_STRONG
  ];

  const plantLocations = [12, 13, 14]; // Tema, Takoradi, Kumasi
  const destinationIds = [88, 89, 90, 91, 93, 94]; // Accra, Tema, Kumasi, Takoradi, Kasoa, Tamale
  const quantities = [50, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000];

  const rejectionCauses = [
    "Invalid transaction reference format; bank confirmation not found.",
    "Deposit slip stamp illegible and mismatching branch location code.",
    "Paid amount GHS 14,000 does not reconcile with order quotation total GHS 22,500.",
    "Third-party depositor name does not match verified authorized procurement personnel.",
    "Duplicate slip uploaded previously approved under order SO-1033.",
    "Suspected forged font digital alteration over transaction date field."
  ];

  const nowMs = Date.now();

  // Create 220 vouchers sequentially in batches of 20 to ensure fast, reliable execution
  const startVoucherNum = 1052;
  const totalVouchersToSeed = 220;

  for (let index = 0; index < totalVouchersToSeed; index++) {
    const vId = startVoucherNum + index;
    const vNum = `SV-${vId}`;
    const soNum = `SO-${vId}`;
    const payRef = `PAY-${55800 + index}`;

    // Status assignment
    const svStatusId = voucherStatusDistribution[index % voucherStatusDistribution.length]!;

    // Delivery Type: alternating delivered (true) vs EXW (false)
    const isDelivered = index % 2 === 0;
    const deliveryTypeStr = isDelivered ? "DELIVERED" : "EXW";

    // Customer & Product assignment
    const custId = customerDefinitions[index % customerDefinitions.length]!.id;
    const prod = productList[index % productList.length]!;
    const qty = quantities[index % quantities.length]!;
    const totalQuote = qty * prod.price;

    const sourceLoc = plantLocations[index % plantLocations.length]!;
    const dest = isDelivered ? destinationIds[index % destinationIds.length]! : null;

    // Creation date spread across past 60 days
    const daysAgo = Math.floor((totalVouchersToSeed - index) / 3.5);
    const createdDate = new Date(nowMs - daysAgo * 86400000 - (index % 24) * 3600000);

    // SO Order Status derived from Voucher Status
    let soStatusId = 10; // Unconfirmed
    if (svStatusId === 2 || svStatusId === 3 || svStatusId === 11) soStatusId = 20; // Confirmed
    if (svStatusId === 4) soStatusId = 40; // Dispatched
    if (svStatusId === 5) soStatusId = 50; // Delivered
    if (svStatusId === 7) soStatusId = 30; // Cancelled

    // PoP attachment for PaymentSubmitted orders and some delivered/confirmed orders
    let fileName: string | null = null;
    if (svStatusId === 8 || svStatusId === 7) {
      fileName = index % 4 === 0 ? "HMIcon.png" : "photo_2026-04-18_14-23-46.jpg";
    }

    // 1. Upsert Voucher
    const voucher = await prisma.salesVoucher.upsert({
      where: { voucherNumber: vNum },
      update: {
        orderQuote: totalQuote,
        salesVoucherStatusId: svStatusId,
        isDeliveryInclusive: isDelivered,
        destinationId: dest,
        sourceLocationId: sourceLoc,
        fileName
      },
      create: {
        voucherNumber: vNum,
        orderQuote: totalQuote,
        customerId: custId,
        companyId: 3,
        createdById: "usr-001",
        sourceLocationId: sourceLoc,
        destinationId: dest,
        salesVoucherStatusId: svStatusId,
        isDeliveryInclusive: isDelivered,
        localPurchaseOrder: `LPO-2026-${String(vId).slice(-4)}`,
        comments: isDelivered ? "Site delivery with offloading clearance." : "Customer self-haulage pickup.",
        fileName,
        createdAt: createdDate
      }
    });

    // 2. Upsert Item
    let item = await prisma.salesVoucherItem.findFirst({
      where: { salesVoucherId: voucher.id }
    });
    if (item) {
      item = await prisma.salesVoucherItem.update({
        where: { id: item.id },
        data: {
          productId: prod.id,
          quantity: qty,
          unitPrice: prod.price,
          totalPrice: totalQuote,
          sourceLocationId: sourceLoc,
          destinationId: dest,
          isDeliveryInclusive: isDelivered
        }
      });
    } else {
      item = await prisma.salesVoucherItem.create({
        data: {
          salesVoucherId: voucher.id,
          productId: prod.id,
          quantity: qty,
          trucksCount: Math.max(1, Math.ceil(qty / 300)),
          unitPrice: prod.price,
          totalPrice: totalQuote,
          sourceLocationId: sourceLoc,
          destinationId: dest,
          isDeliveryInclusive: isDelivered,
          customerRef: `REF-${vNum}`,
          createdAt: createdDate
        }
      });
    }

    // 3. Upsert Sales Voucher Order
    await prisma.salesVoucherOrder.upsert({
      where: { salesOrderNumber: soNum },
      update: {
        salesVoucherId: voucher.id,
        salesVoucherItemId: item.id,
        customerId: custId,
        locationId: sourceLoc,
        productId: prod.id,
        quantity: qty,
        amountUnitPrice: prod.price,
        amountTotal: totalQuote,
        salesVoucherOrderStatusId: soStatusId,
        destinationId: dest,
        deliveryType: deliveryTypeStr
      },
      create: {
        salesOrderNumber: soNum,
        salesVoucherId: voucher.id,
        salesVoucherItemId: item.id,
        customerId: custId,
        companyId: 3,
        locationId: sourceLoc,
        productId: prod.id,
        quantity: qty,
        amountUnitPrice: prod.price,
        amountTotal: totalQuote,
        salesVoucherOrderStatusId: soStatusId,
        destinationId: dest,
        deliveryType: deliveryTypeStr,
        createdAt: createdDate
      }
    });

    // 4. Upsert Payments for applicable statuses
    const hasPayment = svStatusId === 8 || svStatusId === 3 || svStatusId === 4 || svStatusId === 5 || svStatusId === 7;
    if (hasPayment) {
      let payStatusId = 1; // Pending
      let amountApproved: number | null = null;
      let rejectionComment: string | null = null;

      if (svStatusId === 3 || svStatusId === 4 || svStatusId === 5) {
        payStatusId = 2; // Approved
        amountApproved = totalQuote;
      } else if (svStatusId === 7) {
        payStatusId = 3; // Rejected
        amountApproved = 0;
        rejectionComment = rejectionCauses[index % rejectionCauses.length]!;
      }

      const paymentModeId = (index % 4) === 0 ? 1 : (index % 4) === 1 ? 2 : (index % 4) === 2 ? 7 : 3;

      const paymentRecord = await prisma.payment.upsert({
        where: { paymentReference: payRef },
        update: {
          salesVoucherId: voucher.id,
          customerId: custId,
          amount: totalQuote,
          amountApproved,
          paymentModeId,
          paymentStatusId: payStatusId,
          rejectionComment
        },
        create: {
          salesVoucherId: voucher.id,
          customerId: custId,
          paymentReference: payRef,
          amount: totalQuote,
          amountApproved,
          paymentModeId,
          paymentStatusId: payStatusId,
          transactionId: `TXN-${paymentModeId === 1 ? "MM" : "BNK"}-${77000 + index}`,
          rejectionComment,
          createdAt: createdDate
        }
      });

      // Attach PoP Document & AI Transcription for PaymentSubmitted and Rejected records
      if (fileName) {
        const existingDoc = await prisma.paymentDocument.findFirst({
          where: { paymentId: paymentRecord.id }
        });
        if (!existingDoc) {
          await prisma.paymentDocument.create({
            data: {
              paymentId: paymentRecord.id,
              documentName: fileName,
              documentUrl: `test-images/${fileName}`,
              createdAt: createdDate
            }
          });
        }

        const existingTrans = await prisma.paymentTranscription.findFirst({
          where: { paymentId: paymentRecord.id }
        });
        if (!existingTrans) {
          const bankId = banks[index % banks.length]!.id;
          await prisma.paymentTranscription.create({
            data: {
              paymentId: paymentRecord.id,
              documentTypeId: paymentModeId === 1 ? 1 : 2,
              bankId,
              bankBranchId: 17 + (index % 5),
              amount: totalQuote,
              depositorName: customerDefinitions[index % customerDefinitions.length]!.name,
              depositorContact: customerDefinitions[index % customerDefinitions.length]!.phone,
              documentDate: createdDate,
              documentReference: `DEP-SLIP-${88000 + index}`,
              notes: svStatusId === 7
                ? `Rejected: ${rejectionComment}`
                : "Audited & Verified via AI Multimodal Vision Agent",
              createdAt: createdDate
            }
          });
        }
      }
    }

    if ((index + 1) % 50 === 0 || index === totalVouchersToSeed - 1) {
      console.log(`   ...seeded ${index + 1}/${totalVouchersToSeed} sales vouchers & orders`);
    }
  }

  // --------------------------------------------------------------------------
  // 13. Synchronize PostgreSQL sequence IDs with seeded records
  // --------------------------------------------------------------------------
  console.log("-> Synchronizing PostgreSQL sequence IDs...");

  const tablesToSync = [
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
  for (const table of tablesToSync) {
    try {
      await prisma.$executeRawUnsafe(`
        SELECT setval(
          pg_get_serial_sequence('"${table}"', 'id'),
          COALESCE((SELECT MAX(id) FROM "${table}"), 1)
        );
      `);
    } catch {}
  }

  console.log("✅ KARIBU enterprise mock database successfully seeded with 220+ vouchers and 80 users!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
