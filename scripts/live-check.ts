import { readFileSync } from "node:fs";

const GRAPH = "https://graph.facebook.com/v21.0";
const tunnel = process.env.LIVE_WEBHOOK_URL?.replace(/\/$/, "");

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const env = process.env as Record<string, string | undefined>;
const required: Array<[string, string]> = [
  ["META_ACCESS_TOKEN", "temp/system-user token from developers.facebook.com"],
  ["META_PHONE_NUMBER_ID", "WhatsApp test number id (App > WhatsApp > API Setup)"],
  ["META_WEBHOOK_VERIFY_TOKEN", "your chosen webhook verify token"],
  ["DATABASE_URL", "Postgres (must be reachable by the server)"],
  ["REDIS_URL", "Redis for durable timers"],
];
for (const [key, hint] of required) {
  check(`${key} set`, Boolean(env[key]), env[key] ? "" : hint);
}
check("GEMINI_API_KEY set (vision)", Boolean(env.GEMINI_API_KEY), env.GEMINI_API_KEY ? "" : "receipts will fail — required before go-live");
if (tunnel) check("LIVE_WEBHOOK_URL set", true, tunnel);

async function main() {
  if (env.META_ACCESS_TOKEN) {
    const me = await fetch(`${GRAPH}/me?access_token=${env.META_ACCESS_TOKEN}`);
    const meJson = (await me.json()) as { id?: string; name?: string; error?: { message: string } };
    check("Meta token is valid", me.ok && !!meJson.id, meJson.name ?? meJson.error?.message ?? `HTTP ${me.status}`);

    if (env.META_PHONE_NUMBER_ID) {
      const pn = await fetch(`${GRAPH}/${env.META_PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating&access_token=${env.META_ACCESS_TOKEN}`);
      const pnJson = (await pn.json()) as { display_phone_number?: string; verified_name?: string; error?: { message: string } };
      check("can read Phone Number ID", pn.ok && !!pnJson.display_phone_number, pnJson.display_phone_number ? `${pnJson.display_phone_number} (${pnJson.verified_name})` : pnJson.error?.message ?? `HTTP ${pn.status}`);
    }
  }

  if (tunnel) {
    const challenge = `probe-${Date.now()}`;
    try {
      const res = await fetch(`${tunnel}/webhook?hub.mode=subscribe&hub.verify_token=${env.META_WEBHOOK_VERIFY_TOKEN ?? ""}&hub.challenge=${challenge}`);
      const body = await res.text();
      check("webhook handshake over tunnel (GET challenge)", res.status === 200 && body === challenge, `HTTP ${res.status}`);
    } catch (err) {
      check("webhook handshake over tunnel (GET challenge)", false, err instanceof Error ? err.message : String(err));
    }
    try {
      const res = await fetch(`${tunnel}/api/health`);
      const json = (await res.json()) as { ok?: boolean };
      check("server healthy over tunnel", res.status === 200 && json.ok === true, `HTTP ${res.status}`);
    } catch (err) {
      check("server healthy over tunnel", false, err instanceof Error ? err.message : String(err));
    }

    if (env.LIVE_SEND_TEST === "1") {
      const from = env.LIVE_TEST_NUMBER;
      if (from) {
        const res = await fetch(`${tunnel}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entry: [{ changes: [{ value: { messages: [{ id: `synthetic-${Date.now()}`, from, type: "text", text: { body: "start" } }] } }] }],
          }),
        });
        check("synthetic 'start' delivered to webhook", res.status === 200, `HTTP ${res.status} — check WhatsApp for the welcome message`);
      } else {
        check("LIVE_TEST_NUMBER set (your WhatsApp number, e.g. 2348011111111)", false, "needed to receive the bot's reply");
      }
    }
  } else if (env.META_ACCESS_TOKEN && env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log("\nSKIP  tunnel checks — set LIVE_WEBHOOK_URL=https://<your-tunnel>.trycloudflare.com to test the public callback");
  }

  console.log(
    failures === 0
      ? "\nREADY — point the Meta webhook callback at <tunnel>/webhook with the verify token, then message the bot from your phone."
      : `\n${failures} item(s) failed. Fix them, then re-run.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
