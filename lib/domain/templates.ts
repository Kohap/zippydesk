export interface TemplateSpec {
  name: string;
  language: string;
  body: string;
  params: string[];
}

export const TEMPLATE_CATALOG = {
  payment_instructions: {
    name: "payment_instructions",
    language: "en",
    body: "Pay {{amount}} for your {{vendor}} order {{order}} to {{account}} with narration {{narration}}, then send the receipt here.",
    params: ["vendor", "amount", "order", "account", "narration"],
  },
  payment_received: {
    name: "payment_received",
    language: "en",
    body: "Payment of {{amount}} received for your {{vendor}} order {{order}}.",
    params: ["amount", "vendor", "order"],
  },
  order_requires_approval: {
    name: "order_requires_approval",
    language: "en",
    body: "Your {{vendor}} order {{order}} ({{amount}}) is with us for confirmation.",
    params: ["vendor", "order", "amount"],
  },
  approval_escalated: {
    name: "approval_escalated",
    language: "en",
    body: "Order {{order}} is still awaiting approval.",
    params: ["order"],
  },
  order_confirmed: {
    name: "order_confirmed",
    language: "en",
    body: "Your {{vendor}} order {{order}} is confirmed: {{items}}.",
    params: ["vendor", "order", "items"],
  },
  stock_failed_refund: {
    name: "stock_failed_refund",
    language: "en",
    body: "We could not fulfill order {{order}}. Your refund of {{amount}} is being processed by the vendor.",
    params: ["order", "amount"],
  },
  refund_required_urgent: {
    name: "refund_required_urgent",
    language: "en",
    body: "URGENT: Refund {{amount}} for order {{order}} (customer {{customer}}).",
    params: ["amount", "order", "customer"],
  },
  order_cancelled: {
    name: "order_cancelled",
    language: "en",
    body: "Order {{order}} was cancelled: {{reason}}.",
    params: ["order", "reason"],
  },
  order_manual_hold: {
    name: "order_manual_hold",
    language: "en",
    body: "Your {{order}} order is on a short manual hold while we confirm capacity.",
    params: ["order"],
  },
  manual_verification_required: {
    name: "manual_verification_required",
    language: "en",
    body: "Manual verification: order {{order}} needs the {{merchant}} wallet funded before it can be completed.",
    params: ["order", "merchant"],
  },
  daily_refund_reminder: {
    name: "daily_refund_reminder",
    language: "en",
    body: "Reminder: {{count}} refund(s) are still pending. Please review and settle.",
    params: ["count"],
  },
} as const satisfies Record<string, TemplateSpec>;

export type TemplateKey = keyof typeof TEMPLATE_CATALOG;

export interface TemplateRoute {
  key: TemplateKey;
  params: Record<string, string>;
}

export function buildTemplateComponents(route: TemplateRoute): unknown {
  const spec = TEMPLATE_CATALOG[route.key];
  return [
    {
      type: "body",
      parameters: spec.params.map((name) => ({ type: "text", text: route.params[name] ?? "" })),
    },
  ];
}

export function templateBody(route: TemplateRoute): string {
  const spec = TEMPLATE_CATALOG[route.key];
  return spec.params.reduce<string>((body, name) => body.split(`{{${name}}}`).join(route.params[name] ?? ""), spec.body);
}