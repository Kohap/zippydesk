-- Row-Level Security (RLS) for multi-tenant merchant isolation
-- In production, set app.merchant_id via SET LOCAL before queries

-- Enable RLS on all tables
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vendor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VendorItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ManualReview" ENABLE ROW LEVEL SECURITY;

-- For single-tenant demo: allow all access (replace with merchant_id checks in production)
CREATE POLICY "demo_allow_all_orders" ON "Order" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "demo_allow_all_payments" ON "Payment" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "demo_allow_all_events" ON "ApprovalEvent" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "demo_allow_all_refunds" ON "Refund" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "demo_allow_all_vendors" ON "Vendor" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "demo_allow_all_items" ON "VendorItem" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "demo_allow_all_wallets" ON "Wallet" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "demo_allow_all_transactions" ON "CreditTransaction" FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "demo_allow_all_manual" ON "ManualReview" FOR ALL USING (true) WITH CHECK (true);

-- Production multi-tenant pattern (uncomment and adapt):
-- CREATE POLICY "tenant_isolation_orders" ON "Order"
--   FOR ALL
--   USING (vendor_id IN (SELECT id FROM "Vendor" WHERE "merchantId" = current_setting('app.merchant_id')))
--   WITH CHECK (vendor_id IN (SELECT id FROM "Vendor" WHERE "merchantId" = current_setting('app.merchant_id')));
