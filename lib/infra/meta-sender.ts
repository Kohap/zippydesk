import type { ButtonRow, Messenger, OutboundImage } from "../ports/messenger";

export class MetaMessenger implements Messenger {
  constructor(
    private accessToken: string,
    private phoneNumberId: string,
    private apiVersion = "v21.0",
  ) {}

  private graph(path: string): string {
    return `https://graph.facebook.com/${this.apiVersion}/${path}`;
  }

  private async post(payload: unknown): Promise<void> {
    const res = await fetch(this.graph(`${this.phoneNumberId}/messages`), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Meta API error ${res.status}: ${await res.text()}`);
    }
  }

  private async postForm(form: FormData): Promise<{ id?: string }> {
    const res = await fetch(this.graph(`${this.phoneNumberId}/media`), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}` },
      body: form,
    });
    if (!res.ok) {
      throw new Error(`Meta media API error ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as { id?: string };
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

  async sendImage(waId: string, image: OutboundImage): Promise<void> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "image/jpeg");
    form.append(
      "file",
      new Blob([image.bytes as unknown as BlobPart], { type: image.mimeType ?? "image/jpeg" }),
      "receipt.jpg",
    );
    const uploaded = await this.postForm(form);
    await this.post({
      messaging_product: "whatsapp",
      to: waId,
      type: "image",
      image: { id: uploaded.id, caption: image.caption },
    });
  }
}