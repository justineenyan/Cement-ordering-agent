-- CreateTable
CREATE TABLE "Country" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "alpha2" TEXT NOT NULL,
    "alpha3" TEXT NOT NULL,
    "callingCode" TEXT,
    "cluster" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryId" INTEGER NOT NULL,
    "email" TEXT,
    "telephoneNumber" TEXT,
    "customerTranscription" BOOLEAN NOT NULL DEFAULT true,
    "defaultCurrencyCode" TEXT NOT NULL DEFAULT 'GHS',
    "defaultCurrencySymbol" TEXT NOT NULL DEFAULT 'GH₵',
    "allowDepotSelection" BOOLEAN NOT NULL DEFAULT true,
    "allowOrderCancellation" BOOLEAN NOT NULL DEFAULT true,
    "allowOrderAmendment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "type" TEXT DEFAULT 'PLANT',
    "allowDeliveryTypeSelection" BOOLEAN NOT NULL DEFAULT true,
    "allowDeliveryTypeSelectionForProduct" BOOLEAN NOT NULL DEFAULT false,
    "defaultDeliveryType" TEXT DEFAULT 'EXW',
    "useLocalPoNumber" BOOLEAN NOT NULL DEFAULT false,
    "useFileUpload" BOOLEAN NOT NULL DEFAULT true,
    "requireFileUpload" BOOLEAN NOT NULL DEFAULT false,
    "useDescription" BOOLEAN NOT NULL DEFAULT true,
    "useComments" BOOLEAN NOT NULL DEFAULT true,
    "useDeliveryContact" BOOLEAN NOT NULL DEFAULT true,
    "useConfirmQuotation" BOOLEAN NOT NULL DEFAULT true,
    "useDeliveredOrderManagement" BOOLEAN NOT NULL DEFAULT true,
    "requireDestinationSelectionForExworks" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "country" TEXT,
    "companyId" INTEGER NOT NULL,
    "minDeliveryDays" DOUBLE PRECISION DEFAULT 2.0,
    "distance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesVoucherStatus" (
    "id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "translationKey" TEXT,

    CONSTRAINT "SalesVoucherStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesVoucherOrderStatus" (
    "id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "SalesVoucherOrderStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasketOrderStatus" (
    "id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "BasketOrderStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentStatus" (
    "id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "translationKey" TEXT,

    CONSTRAINT "PaymentStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "translationKey" TEXT,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "countryId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankBranch" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "bankId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMode" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "documentTypeId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "paymentModeTypeId" INTEGER NOT NULL DEFAULT 2,
    "paymentModeStatusId" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" INTEGER NOT NULL,
    "itemCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productGroup" TEXT DEFAULT 'Cement Bags',
    "standardUnit" TEXT DEFAULT 'bags',
    "weighPiece" DOUBLE PRECISION DEFAULT 50.0,
    "unitPrice" DOUBLE PRECISION DEFAULT 90.0,
    "description" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT,
    "companyId" INTEGER NOT NULL,
    "customerAccountBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "customerAvailableCredit" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "customerCrLimit" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "customerOpenOrders" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "customerStatus" INTEGER DEFAULT 1,
    "customerStatusDesc" TEXT DEFAULT 'Active',
    "customerCurrency" TEXT DEFAULT 'GHS',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "fullName" TEXT,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER,
    "customerId" INTEGER,
    "locationId" INTEGER,
    "role" TEXT DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" SERIAL NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "transporterCode" TEXT,
    "countryId" INTEGER NOT NULL,
    "capacity" DOUBLE PRECISION DEFAULT 30.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "licenseNo" TEXT NOT NULL,
    "phoneNo" TEXT,
    "transporterCode" TEXT,
    "countryId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BasketOrder" (
    "id" SERIAL NOT NULL,
    "basketOrderNumber" TEXT NOT NULL,
    "totalQuantity" DOUBLE PRECISION NOT NULL,
    "quantityUsed" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "quantityLeft" DOUBLE PRECISION NOT NULL,
    "salesVoucherCount" INTEGER NOT NULL DEFAULT 0,
    "customerId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdById" TEXT,
    "basketOrderStatusId" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BasketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesVoucher" (
    "id" SERIAL NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "customerReference" TEXT,
    "customOrderNumber" TEXT,
    "orderQuote" DOUBLE PRECISION,
    "customerId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdById" TEXT,
    "sourceLocationId" INTEGER NOT NULL,
    "destinationId" INTEGER,
    "basketId" INTEGER,
    "salesVoucherStatusId" INTEGER NOT NULL DEFAULT 12,
    "isDeliveryInclusive" BOOLEAN NOT NULL DEFAULT false,
    "localPurchaseOrder" TEXT,
    "description" TEXT,
    "comments" TEXT,
    "deliveryContact" TEXT,
    "featuredImageUrl" TEXT,
    "fileName" TEXT,
    "quotationGeneratedAt" TIMESTAMP(3),
    "salesOrderGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesVoucherItem" (
    "id" SERIAL NOT NULL,
    "salesVoucherId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "trucksCount" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION,
    "totalPrice" DOUBLE PRECISION,
    "discount" DOUBLE PRECISION DEFAULT 0.0,
    "tax" DOUBLE PRECISION DEFAULT 0.0,
    "sourceLocationId" INTEGER,
    "destinationId" INTEGER,
    "isDeliveryInclusive" BOOLEAN NOT NULL DEFAULT false,
    "customerRef" TEXT,
    "deliveryDate" TIMESTAMP(3),
    "vehicleId" INTEGER,
    "driverId" INTEGER,
    "salesVoucherStatusId" INTEGER,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesVoucherItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesVoucherOrder" (
    "id" SERIAL NOT NULL,
    "salesOrderNumber" TEXT NOT NULL,
    "salesVoucherId" INTEGER NOT NULL,
    "salesVoucherItemId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "locationId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "amountUnitPrice" DOUBLE PRECISION,
    "amountVAT" DOUBLE PRECISION,
    "amountTotal" DOUBLE PRECISION,
    "salesVoucherOrderStatusId" INTEGER NOT NULL DEFAULT 10,
    "customerRef" TEXT,
    "destinationId" INTEGER,
    "deliveryType" TEXT DEFAULT 'EXW',
    "salesOrderCreated" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesVoucherOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "salesVoucherId" INTEGER,
    "customerId" INTEGER,
    "paymentReference" TEXT NOT NULL,
    "customReference" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountApproved" DOUBLE PRECISION,
    "paymentModeId" INTEGER NOT NULL,
    "paymentStatusId" INTEGER NOT NULL DEFAULT 1,
    "transactionId" TEXT,
    "rejectionComment" TEXT,
    "availableBalanceRef" TEXT,
    "ePaymentCheckOutUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTranscription" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "documentTypeId" INTEGER NOT NULL,
    "bankId" INTEGER,
    "bankBranchId" INTEGER,
    "amount" DOUBLE PRECISION,
    "depositorName" TEXT,
    "depositorContact" TEXT,
    "documentDate" TIMESTAMP(3),
    "documentReference" TEXT,
    "paymentTranscriptionStatusId" INTEGER DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTranscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentDocument" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "documentName" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Country_alpha2_key" ON "Country"("alpha2");

-- CreateIndex
CREATE UNIQUE INDEX "Country_alpha3_key" ON "Country"("alpha3");

-- CreateIndex
CREATE UNIQUE INDEX "Company_code_key" ON "Company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerCode_key" ON "Customer"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_userName_key" ON "User"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_vehicleNo_key" ON "Vehicle"("vehicleNo");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_licenseNo_key" ON "Driver"("licenseNo");

-- CreateIndex
CREATE UNIQUE INDEX "BasketOrder_basketOrderNumber_key" ON "BasketOrder"("basketOrderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesVoucher_voucherNumber_key" ON "SalesVoucher"("voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SalesVoucherOrder_salesOrderNumber_key" ON "SalesVoucherOrder"("salesOrderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentReference_key" ON "Payment"("paymentReference");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bank" ADD CONSTRAINT "Bank_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankBranch" ADD CONSTRAINT "BankBranch_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMode" ADD CONSTRAINT "PaymentMode_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMode" ADD CONSTRAINT "PaymentMode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasketOrder" ADD CONSTRAINT "BasketOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasketOrder" ADD CONSTRAINT "BasketOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasketOrder" ADD CONSTRAINT "BasketOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BasketOrder" ADD CONSTRAINT "BasketOrder_basketOrderStatusId_fkey" FOREIGN KEY ("basketOrderStatusId") REFERENCES "BasketOrderStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucher" ADD CONSTRAINT "SalesVoucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucher" ADD CONSTRAINT "SalesVoucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucher" ADD CONSTRAINT "SalesVoucher_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucher" ADD CONSTRAINT "SalesVoucher_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucher" ADD CONSTRAINT "SalesVoucher_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucher" ADD CONSTRAINT "SalesVoucher_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "BasketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucher" ADD CONSTRAINT "SalesVoucher_salesVoucherStatusId_fkey" FOREIGN KEY ("salesVoucherStatusId") REFERENCES "SalesVoucherStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherItem" ADD CONSTRAINT "SalesVoucherItem_salesVoucherId_fkey" FOREIGN KEY ("salesVoucherId") REFERENCES "SalesVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherItem" ADD CONSTRAINT "SalesVoucherItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherItem" ADD CONSTRAINT "SalesVoucherItem_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherItem" ADD CONSTRAINT "SalesVoucherItem_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherItem" ADD CONSTRAINT "SalesVoucherItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherItem" ADD CONSTRAINT "SalesVoucherItem_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherOrder" ADD CONSTRAINT "SalesVoucherOrder_salesVoucherId_fkey" FOREIGN KEY ("salesVoucherId") REFERENCES "SalesVoucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherOrder" ADD CONSTRAINT "SalesVoucherOrder_salesVoucherItemId_fkey" FOREIGN KEY ("salesVoucherItemId") REFERENCES "SalesVoucherItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherOrder" ADD CONSTRAINT "SalesVoucherOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherOrder" ADD CONSTRAINT "SalesVoucherOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherOrder" ADD CONSTRAINT "SalesVoucherOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherOrder" ADD CONSTRAINT "SalesVoucherOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherOrder" ADD CONSTRAINT "SalesVoucherOrder_salesVoucherOrderStatusId_fkey" FOREIGN KEY ("salesVoucherOrderStatusId") REFERENCES "SalesVoucherOrderStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVoucherOrder" ADD CONSTRAINT "SalesVoucherOrder_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salesVoucherId_fkey" FOREIGN KEY ("salesVoucherId") REFERENCES "SalesVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentModeId_fkey" FOREIGN KEY ("paymentModeId") REFERENCES "PaymentMode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentStatusId_fkey" FOREIGN KEY ("paymentStatusId") REFERENCES "PaymentStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTranscription" ADD CONSTRAINT "PaymentTranscription_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTranscription" ADD CONSTRAINT "PaymentTranscription_documentTypeId_fkey" FOREIGN KEY ("documentTypeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTranscription" ADD CONSTRAINT "PaymentTranscription_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTranscription" ADD CONSTRAINT "PaymentTranscription_bankBranchId_fkey" FOREIGN KEY ("bankBranchId") REFERENCES "BankBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDocument" ADD CONSTRAINT "PaymentDocument_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
