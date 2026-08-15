import type { MediaFetcher } from "../ports/media";

export class MetaMediaFetcher implements MediaFetcher {
  constructor(
    private accessToken: string,
    private apiVersion = "v21.0",
  ) {}

  async fetchImage(mediaId: string): Promise<Buffer> {
    const meta = await fetch(`https://graph.facebook.com/${this.apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!meta.ok) {
      throw new Error(`Meta media error ${meta.status}: ${await meta.text()}`);
    }
    const body = (await meta.json()) as { url?: string };
    if (!body.url) throw new Error("Meta media response missing url");
    const img = await fetch(body.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!img.ok) {
      throw new Error(`Media download error ${img.status}`);
    }
    return Buffer.from(await img.arrayBuffer());
  }
}