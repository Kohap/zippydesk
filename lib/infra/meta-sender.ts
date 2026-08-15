import type { ButtonRow, Messenger } from "../ports/messenger";

export class MetaMessenger implements Messenger {
  constructor(
    private accessToken: string,
    private phoneNumberId: string,
    private apiVersion = "v21.0",
  ) {}

  private async post(payload: unknown): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      throw new Error(`Meta API error ${res.status}: ${await res.text()}`);
    }
  }

  async sendText(waId: string, text: string): Promise<void> {
    await this.post({ messaging_product: "whatsapp", to: waId, type: "text", text: { body: text } });
  }

  async sendButtons(waId: string, body: string, rows: ButtonRow[]): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to: waId,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: rows.slice(0, 3).map((r) => ({
            type: "reply",
            reply: { id: r.id, title: r.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  async sendTemplate(waId: string, templateName: string, components: unknown): Promise<void> {
    await this.post({
      messaging_product: "whatsapp",
      to: waId,
      type: "template",
      template: { name: templateName, language: { code: "en" }, components },
    });
  }
}