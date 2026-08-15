const MAX_ID_LENGTH = 256;

export type ButtonAction =
  | { a: "vs"; v: string }
  | { a: "add"; v: string; s: string; q: number }
  | { a: "done"; v: string }
  | { a: "ap"; o: string }
  | { a: "mv"; o: string }
  | { a: "rj"; o: string }
  | { a: "rd"; o: string };

export function encodeButtonId(action: ButtonAction): string {
  const id = JSON.stringify(action);
  if (id.length > MAX_ID_LENGTH) {
    throw new Error(`button id exceeds ${MAX_ID_LENGTH} chars: ${id}`);
  }
  return id;
}

export function decodeButtonId(id: string): ButtonAction {
  const parsed = JSON.parse(id) as ButtonAction;
  return parsed;
}