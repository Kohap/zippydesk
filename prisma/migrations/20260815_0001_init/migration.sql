-- Gift Architecture initial schema (Prisma 6 conventions)
-- Hand-written so the DB-level guarantees (CHECK constraints, order sequence)
-- survive `prisma migrate deploy` on a fresh database.

CREATE TYPE "OrderStatus" AS ENUM (
  'INTAKE',
  'ORDER_PENDING_PAYMENT',
  'PARTIALLY_PAID',
  'PENDING_APPROVAL',
  'APPROVED',
  'FAILED_OUT_OF_STOCK',
  'PENDING_REFUND',
  'REFUNDED',
  'CANCELLED'
);

CREATE TYPE "PaymentVerdict" AS ENUM ('applied', 'partial', 'overpayment', 'unmatched', 'duplicate');

CREATE TYPE "RefundStatus" AS ENUM ('pending', 'refunded');

CREATE SEQUENCE "order_ref_seq" START WITH 1000;

CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankAccount" TEXT NOT NULL,
    "narrationPrefix" TEXT NOT NULL,
    "escalation" JSONB NOT NULL,
    "timers" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorItem" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "stock" SMALLINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "VendorItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VendorItem_stock_nonneg" CHECK ("stock" >= 0)
);

CREATE UNIQUE INDEX "VendorItem_vendorId_sku_key" ON "VendorItem"("vendorId", "sku");
CREATE INDEX "VendorItem_vendorId_idx" ON "VendorItem"("vendorId");

ALTER TABLE "VendorItem"
    ADD CONSTRAINT "VendorItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerWaId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "cartLocked" BOOLEAN NOT NULL DEFAULT false,
    "totalKobo" INTEGER NOT NULL DEFAULT 0,
    "amountPaidKobo" INTEGER NOT NULL DEFAULT 0,
    "balanceDueKobo" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'ORDER_PENDING_PAYMENT',
    "escalationLevel" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Order_paid_le_total" CHECK ("amountPaidKobo" <= "totalKobo"),
    CONSTRAINT "Order_balance_exact" CHECK ("balanceDueKobo" = "totalKobo" - "amountPaidKobo"),
    CONSTRAINT "Order_escalation_level" CHECK ("escalationLevel" IN (0, 1))
);

CREATE INDEX "Order_customerWaId_vendorId_idx" ON "Order"("customerWaId", "vendorId");
CREATE INDEX "Order_status_idx" ON "Order"("status");

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "narration" TEXT NOT NULL,
    "visionJson" JSONB NOT NULL,
    "receiptMsgId" TEXT NOT NULL,
    "verdict" "PaymentVerdict" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Payment_receiptMsgId_key" UNIQUE ("receiptMsgId")
);

CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

ALTER TABLE "Payment"
    ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ApprovalEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApprovalEvent_orderId_idx" ON "ApprovalEvent"("orderId");

ALTER TABLE "ApprovalEvent"
    ADD CONSTRAINT "ApprovalEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "ownerConfirmedAt" TIMESTAMP(3),
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Refund_orderId_key" UNIQUE ("orderId")
);

ALTER TABLE "Refund"
    ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "IngestedMessage" (
    "msgId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngestedMessage_pkey" PRIMARY KEY ("msgId")
);