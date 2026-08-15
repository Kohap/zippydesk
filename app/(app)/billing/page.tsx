import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth/session";
import { getAppContext } from "@/lib/context";
import { dashboardData } from "@/lib/api/dashboard";
import { Billing } from "@/components/app/billing-view";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = getAppContext();
  const session = verifySessionToken((await cookies()).get("zd_session")?.value);
  if (!session) redirect("/");
  const data = await dashboardData(ctx, session.merchantId);
  if (!data) redirect("/");
  return <Billing initial={data} />;
}