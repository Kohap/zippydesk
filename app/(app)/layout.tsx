import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/auth/session";
import { getAppContext } from "@/lib/context";
import { getMerchant, listMerchants } from "@/lib/api/merchants";
import { AppShell } from "@/components/app/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = getAppContext();
  const store = await cookies();
  const session = verifySessionToken(store.get("zd_session")?.value);
  if (!session) redirect("/");
  const bundle = await getMerchant(ctx, session.merchantId);
  if (!bundle) redirect("/");
  const merchants = await listMerchants(ctx);
  return (
    <AppShell merchant={bundle.merchant} merchants={merchants}>
      {children}
    </AppShell>
  );
}
