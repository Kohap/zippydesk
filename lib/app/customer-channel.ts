import { buildTemplateComponents, type TemplateRoute } from "../domain/templates";
import type { Messenger, ButtonRow } from "../ports/messenger";
import type { WindowStore } from "../ports/window";

export interface CustomerChannel {
  sendText(waId: string, text: string, route?: TemplateRoute): Promise<void>;
  sendButtons(waId: string, body: string, rows: ButtonRow[], route?: TemplateRoute): Promise<void>;
  sendTemplate(waId: string, route: TemplateRoute): Promise<void>;
}

export class WindowedMessenger implements CustomerChannel {
  constructor(
    private inner: Messenger,
    private window: WindowStore,
    private now: () => Date = () => new Date(),
  ) {}

  async sendText(waId: string, text: string, route?: TemplateRoute): Promise<void> {
    if (await this.window.insideWindow(waId, this.now())) {
      await this.inner.sendText(waId, text);
      return;
    }
    if (route) {
      await this.inner.sendTemplate(waId, route.key, buildTemplateComponents(route));
      return;
    }
    console.warn(`[channel] out-of-window send to ${waId} had no template route; message dropped`);
  }

  async sendButtons(waId: string, body: string, rows: ButtonRow[], route?: TemplateRoute): Promise<void> {
    if (await this.window.insideWindow(waId, this.now())) {
      await this.inner.sendButtons(waId, body, rows);
      return;
    }
    await this.sendText(waId, body, route);
  }

  async sendTemplate(waId: string, route: TemplateRoute): Promise<void> {
    await this.inner.sendTemplate(waId, route.key, buildTemplateComponents(route));
  }
}