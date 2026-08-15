export interface VisionReceipt {
  narration: string | null;
  amountKobo: number | null;
  senderName: string | null;
  isSuccessful: boolean;
  confidence: number;
  errorReason: string | null;
}

export interface VisionExtractor {
  extractReceipt(imageBytes: Buffer): Promise<VisionReceipt>;
}