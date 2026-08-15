/*
  Warnings:

  - Added the required column `merchantId` to the `Vendor` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CreditType" AS ENUM ('topup', 'consume', 'adjustment');

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_vendorId_fkey";

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "escalationLevel" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "validationMs" INTEGER;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "merchantId" TEXT;

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "balanceCredits" INTEGER NOT NULL DEFAULT 0,
    "lowThreshold" INTEGER NOT NULL DEFAULT 20,
    "autoRecharge" BOOLEAN NOT NULL DEFAULT false,
    "autoRechargeAmount" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "CreditType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reference" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shopName" TEXT,
    "businessType" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "missedOrders" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_slug_key" ON "Merchant"("slug");

UPDATE "Vendor" SET "merchantId" = 'merchant-parfait' WHERE "merchantId" IS NULL;
INSERT INTO "Merchant" ("id", "slug", "name", "businessType", "phone", "updatedAt")
VALUES ('merchant-parfait', 'parfait', 'Parfait Palace', 'Food & Beverage', '2348012345678', NOW())
ON CONFLICT ("id") DO NOTHING;
ALTER TABLE "Vendor" ALTER COLUMN "merchantId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_merchantId_key" ON "Wallet"("merchantId");

-- CreateIndex
CREATE INDEX "CreditTransaction_walletId_createdAt_idx" ON "CreditTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "Vendor_merchantId_idx" ON "Vendor"("merchantId");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
