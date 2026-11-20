// How a knowledge-base entry is shown to the AI and embedded for search.
// One place for both, so every chat path (semantic, keyword, no-key) and
// every save path (add, edit) agree.
//
// Entry shapes (2026-11-17):
//   faq  — question + answer text and/or a link (e.g. "Where are you?" →
//          "Al Barsha 1" + Google Maps link). Link-only answers are allowed.
//   text — general information with no question (about us, policies).
//   url  — older link-only entries; still rendered so they reach the bot.

export interface KnowledgeLike {
  type?: string;
  question?: string;
  answer?: string;
  content?: string;
  sourceUrl?: string;
  linkLabel?: string;
  _id?: unknown;
  attachments?: { kind: string; url: string; name?: string }[];
}

// Marker the AI copies into its reply when it uses an entry that has photos
// or a brochure; the server swaps it for those files (see chat.service.ts).
export const mediaTag = (k: KnowledgeLike) => `[[MEDIA:${String(k._id)}]]`;
export const MEDIA_TAG_RE = /\[\[MEDIA:([a-f0-9]{24})\]\]/gi;

function mediaText(k: KnowledgeLike): string {
  const files = k.attachments || [];
  if (!files.length || !k._id) return '';
  const photos = files.filter((f) => f.kind === 'image').length;
  const pdf = files.some((f) => f.kind === 'pdf');
  const what = [photos ? `${photos} photo${photos > 1 ? 's' : ''}` : '', pdf ? 'a PDF brochure' : ''].filter(Boolean).join(' and ');
  return `(${what}: ${mediaTag(k)})`;
}

function linkText(k: KnowledgeLike): string {
  if (!k.sourceUrl) return '';
  return `${k.linkLabel ? k.linkLabel : 'Link'}: ${k.sourceUrl}`;
}

export function knowledgeSnippet(k: KnowledgeLike): string {
  const link = linkText(k);
  if (k.type === 'faq') {
    // Kept on one "A:" line so the answer and its link always travel together.
    const answer = [k.answer?.trim(), link, mediaText(k)].filter(Boolean).join(' — ');
    return `Q: ${k.question || ''}\nA: ${answer}`;
  }
  return [k.content?.trim(), link, mediaText(k)].filter(Boolean).join('\n');
}

export function knowledgeEmbedText(k: KnowledgeLike): string {
  if (k.type === 'faq') return [k.question, k.answer, k.linkLabel].filter(Boolean).join(' ').trim();
  return [k.content, k.linkLabel].filter(Boolean).join(' ').trim();
}

const URL_RE = /^https?:\/\/\S+$/i;

// Returns an error message, or null when the entry is valid.
export function validateKnowledge(k: KnowledgeLike): string | null {
  if (k.sourceUrl && !URL_RE.test(k.sourceUrl.trim())) return 'Links must start with http:// or https://';
  if (k.type === 'faq') {
    if (!k.question?.trim()) return 'Enter the question';
    if (!k.answer?.trim() && !k.sourceUrl?.trim() && !k.attachments?.length) return 'Add an answer, a link, photos — or a mix';
  } else if (k.type === 'text') {
    if (!k.content?.trim()) return 'Enter the information';
  } else if (k.type === 'url') {
    if (!k.sourceUrl?.trim()) return 'Enter the link';
  }
  return null;
}

// How much of the knowledge base goes into one reply's instructions: as many
// entries as fit, best match first, instead of a fixed top 4 — so a small
// knowledge base is read in full and a broad question ("what do you have
// under $500k?") sees many listings. Bounded so the owner's AI bill per
// message stays small (~10k characters ≈ 2.5k tokens).
export const KNOWLEDGE_CHAR_BUDGET = 10000;
export const KNOWLEDGE_MAX_ENTRIES = 30;

export function fitKnowledge(ranked: KnowledgeLike[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const entry of ranked) {
    if (out.length >= KNOWLEDGE_MAX_ENTRIES) break;
    const snippet = knowledgeSnippet(entry);
    // Always keep the best match, even if it alone is long.
    if (out.length && used + snippet.length > KNOWLEDGE_CHAR_BUDGET) break;
    out.push(snippet);
    used += snippet.length;
  }
  return out;
}
