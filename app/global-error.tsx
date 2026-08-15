"use client";

import * as React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  React.useEffect(() => {
    console.error("page error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          background: "#0f1418",
          color: "#e9eef2",
          fontFamily:
            "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          margin: 0,
          minHeight: "100vh",
        }}
      >
        <main
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "32px 16px",
            textAlign: "center",
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "rgba(239, 90, 95, 0.1)",
              border: "1px solid rgba(239, 90, 95, 0.35)",
              color: "#ff8f93",
            }}
          >
            <AlertTriangle size={24} aria-hidden />
          </span>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              margin: "24px 0 12px",
              letterSpacing: "-0.02em",
            }}
          >
            That page did not finish loading
          </h1>
          <p style={{ maxWidth: 420, color: "#a2aeb8", lineHeight: 1.6, margin: 0 }}>
            The dashboard and live demo are independent and still working. Retry, or jump straight
            back to the dashboard.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: 46,
                padding: "0 20px",
                borderRadius: 10,
                border: "1px solid rgba(255, 255, 255, 0.14)",
                background: "transparent",
                color: "#e9eef2",
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              <RotateCcw size={16} aria-hidden /> Try again
            </button>
            <a
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 46,
                padding: "0 20px",
                borderRadius: 10,
                backgroundImage: "linear-gradient(135deg, #007ba0 0%, #00bca3 100%)",
                color: "#fff",
                fontSize: 15,
                textDecoration: "none",
              }}
            >
              Open the live demo
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
