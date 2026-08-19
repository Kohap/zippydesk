import { z } from "zod";

export const MetaMessageSchema = z.object({
  id: z.string().min(1).max(256).optional(),
  from: z.string().min(1).max(64).optional(),
  type: z.enum(["text", "image", "interactive"]).optional(),
  text: z.object({ body: z.string().max(4096).optional() }).optional(),
  image: z.object({ id: z.string().max(256).optional() }).optional(),
  interactive: z
    .object({
      type: z.string().max(64).optional(),
      button_reply: z.object({ id: z.string().max(512).optional() }).optional(),
    })
    .optional(),
});

export const WebhookPayloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  messages: z.array(MetaMessageSchema).optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

export const WalletConsumeSchema = z.object({
  orderId: z.string().min(1).max(128).optional(),
  reason: z.string().min(1).max(256).optional(),
});

export const WalletTopupSchema = z.object({
  credits: z.number().int().positive().max(100_000),
  method: z.enum(["card", "transfer", "virtual_account"]).optional(),
});

export const AuthSelectSchema = z.object({
  merchantId: z.string().min(1).max(128),
});
