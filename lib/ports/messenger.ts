export interface ButtonRow {
  id: string;
  title: string;
}

export interface OutboundImage {
  bytes: Buffer;
  mimeType?: string;
  caption?: string;
}

export interface Messenger {
  sendText(waId: string, text: string): Promise<void>;
  sendButtons(waId: string, body: string, rows: ButtonRow[]): Promise<void>;
  sendTemplate(waId: string, templateName: string, components: unknown): Promise<void>;
  /** Forwards a raw media object (e.g. an unread receipt) to a human. */
  sendImage(waId: string, image: OutboundImage): Promise<void>;
}