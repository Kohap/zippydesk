import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "zippyDesk - Autonomous WhatsApp commerce",
  description:
    "zippyDesk runs your WhatsApp order line end to end: catalog intake, vision receipt validation, 5-minute escalations and inventory locking. Your customers can see you are online. Stop making them wait.",
  applicationName: "zippyDesk",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "zippyDesk - Autonomous WhatsApp commerce",
    description:
      "Vision receipt validation, 5-minute escalations and inventory locking for WhatsApp merchants.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
