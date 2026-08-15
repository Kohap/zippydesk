import { describe, expect, it } from "vitest";
import { TEMPLATE_CATALOG, buildTemplateComponents, templateBody, type TemplateRoute } from "../lib/domain/templates";

describe("template catalog", () => {
  it("defines all 9 spec templates", () => {
    expect(Object.keys(TEMPLATE_CATALOG).sort()).toEqual([
      "approval_escalated",
      "daily_refund_reminder",
      "order_cancelled",
      "order_confirmed",
      "order_requires_approval",
      "payment_instructions",
      "payment_received",
      "refund_required_urgent",
      "stock_failed_refund",
    ]);
  });

  it("builds body components in declared parameter order", () => {
    const route: TemplateRoute = {
      key: "payment_instructions",
      params: { vendor: "Parfait Palace", amount: "N1,500", order: "7451", account: "0123456789", narration: "GFT-A3-7451" },
    };
    const components = buildTemplateComponents(route) as Array<{ type: string; parameters: Array<{ type: string; text: string }> }>;
    expect(components[0]!.parameters.map((p) => p.text)).toEqual([
      "Parfait Palace",
      "N1,500",
      "7451",
      "0123456789",
      "GFT-A3-7451",
    ]);
  });

  it("fills every placeholder in the body", () => {
    const route: TemplateRoute = {
      key: "refund_required_urgent",
      params: { amount: "N1,500", order: "7451", customer: "2348011111111" },
    };
    const body = templateBody(route);
    expect(body).not.toMatch(/\{\{/);
    expect(body).toContain("N1,500");
    expect(body).toContain("7451");
  });
});