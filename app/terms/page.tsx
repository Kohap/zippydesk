import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";

export const metadata: Metadata = {
  title: "Terms of service - zippyDesk",
  description:
    "The terms that govern your use of zippyDesk, the autonomous WhatsApp commerce platform.",
};

const SECTIONS = [
  {
    id: "acceptance",
    title: "Acceptance of these terms",
    body: [
      "By creating a zippyDesk account, connecting a WhatsApp Business number, or using the dashboard, you agree to these Terms of Service and to our Privacy Policy. If you are entering into this agreement on behalf of a company, you represent that you have authority to bind that company, and in that case \"you\" refers to that company.",
      "If you do not agree to these terms, do not use the service. We may update these terms from time to time; the latest version is always posted here. Material changes are communicated by email and an in-app banner at least seven days before they take effect.",
    ],
  },
  {
    id: "the-service",
    title: "What zippyDesk does",
    body: [
      "zippyDesk is an autonomous commerce layer for WhatsApp. We connect to your WhatsApp Business number through the official Meta Cloud API, read customer messages and transfer receipts, validate receipts against the narration on each order, route orders to you and your escalation assistant, and lock stock when you confirm an order.",
      "We do not hold customer funds. Payments are transferred directly from your customer to your bank account. We never touch the money; we only read the receipt the customer forwards and reconcile it against your ledger.",
    ],
  },
  {
    id: "your-account",
    title: "Your account and WhatsApp number",
    body: [
      "You must provide a WhatsApp Business number that you are authorised to operate. You are responsible for keeping your login credentials, webhook tokens, and Paystack API keys confidential. Notify us immediately at hello@zippydesk.co if you suspect any unauthorised access.",
      "You agree to comply with the Meta WhatsApp Business Messaging Policy and Commerce Policy when using the service. We may suspend or terminate accounts that violate Meta policies, that send unsolicited messages, or that attempt to use zippyDesk for fraud.",
    ],
  },
  {
    id: "fees",
    title: "Fees and credits",
    body: [
      "The service runs on prepaid credits. Each verified order consumes one credit at the unit price of your active tier (Emerging ₦100, Scaling ₦75, Enterprise ₦50 per credit). Credits are purchased through Paystack and never expire. Top-ups via card, bank transfer, or virtual account are simulated in this preview build.",
      "When your balance drops below the floor threshold you set, we surface a low-balance warning in the dashboard. When the balance hits zero, the bot pauses and incoming orders are flagged MANUAL_VERIFICATION_REQUIRED until you top up. You can resume the bot manually from the dashboard at any time.",
      "Auto-recharge is opt-in. If enabled, we top up the configured number of credits when the tank runs dry, charged to your saved payment method.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: [
      "You will not use zippyDesk to send spam, phishing, or unsolicited marketing messages. You will not attempt to bypass the bot runtime or webhook signature verification. You will not reverse-engineer the platform or scrape the dashboard for resale.",
      "You will not use the service to process payments for goods or services that are illegal in your jurisdiction. We cooperate with law enforcement when presented with valid legal process.",
    ],
  },
  {
    id: "your-data",
    title: "Your data and customer data",
    body: [
      "You retain ownership of all merchant data: your catalog, your orders, your customer contact details, and your transaction history. You grant us a limited licence to host and process that data solely to operate the service on your behalf.",
      "Customer data is yours. You can export it at any time and request deletion by emailing hello@zippydesk.co. We delete inactive merchant accounts after 90 days of inactivity, with a 14-day notice email.",
    ],
  },
  {
    id: "uptime",
    title: "Service availability",
    body: [
      "We target 99.5% monthly uptime on the bot runtime and webhook receiver. Scheduled maintenance windows are announced at least 48 hours in advance. The dashboard is best-effort and may be unavailable during deployments.",
      "We are not liable for downtime caused by Meta WhatsApp Cloud API outages, Paystack outages, your network provider, or force majeure events. Status updates are posted to status@zippydesk.co during incidents.",
    ],
  },
  {
    id: "termination",
    title: "Termination",
    body: [
      "You can cancel your account at any time from the dashboard settings. Cancellation takes effect at the end of your current billing cycle. Unused credits remain available for the remainder of the cycle and expire 30 days after cancellation.",
      "We may suspend or terminate accounts that violate these terms, that abuse the service, or that fail to pay fees. We will give you at least 14 days notice unless the violation is causing active harm.",
    ],
  },
  {
    id: "liability",
    title: "Liability and indemnity",
    body: [
      "To the maximum extent permitted by law, our total liability for any claim arising from the service is limited to the fees you paid us in the 12 months before the claim, or ₦500,000, whichever is lower.",
      "You indemnify us against any third-party claim arising from your products, your customer relationships, or your misuse of the service.",
    ],
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: [
      "We may revise these terms to reflect changes in the service, in the law, or in our business practices. The latest version is always posted at /terms. Material changes are communicated by email and an in-app banner at least seven days before they take effect. Continued use of the service after the effective date constitutes acceptance.",
    ],
  },
  {
    id: "governing-law",
    title: "Governing law and disputes",
    body: [
      "These terms are governed by the laws of the Federal Republic of Nigeria. Any dispute is resolved first by good-faith negotiation; if that fails, by arbitration in Lagos under the Arbitration and Mediation Act. Nothing in this clause prevents either party from seeking injunctive relief in court for intellectual-property or confidentiality breaches.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    body: [
      "Questions about these terms go to hello@zippydesk.co. We answer within one business day.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="Plain-language terms that govern your use of zippyDesk. We try to keep these short, honest, and free of legal jargon where possible."
      effectiveDate="15 August 2026"
      updatedDate="15 August 2026"
      sections={SECTIONS}
      related={[
        { href: "/privacy", label: "Privacy policy", description: "How we handle merchant and customer data." },
        { href: "/#faq", label: "Frequently asked questions", description: "Answers to the questions merchants ask first." },
        { href: "/#access", label: "Get onboarding", description: "Tell us about your shop and we will size your plan." },
      ]}
    />
  );
}