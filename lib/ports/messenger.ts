export interface ButtonRow {
  id: string;
  title: string;
}

export interface Messenger {
  sendText(waId: string, text: string): Promise<void>;
  sendButtons(waId: string, body: string, rows: ButtonRow[]): Promise<void>;
  sendTemplate(waId: string, templateName: string, components: unknown): Promise<void>;
}