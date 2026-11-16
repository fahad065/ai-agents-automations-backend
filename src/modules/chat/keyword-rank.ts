// Word-matching ranking for knowledge-base entries, used whenever semantic
// (embedding) search isn't available — e.g. a chatbot running on a Claude
// key only (Anthropic has no embeddings API), or an entry saved before the
// owner added a key. Before this, those bots just took the FIRST few
// entries in the knowledge base, so anything after entry 8 was invisible.
//
// A small BM25-style score: words that appear in fewer entries count more,
// and a match in an FAQ question counts double (that's what guests ask).
// Unicode-aware, so Arabic and other scripts work the same as English.

export interface RankableEntry {
  type?: string;
  question?: string;
  answer?: string;
  content?: string;
  sourceUrl?: string;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'be', 'do', 'does', 'did', 'you', 'your', 'we', 'our', 'i', 'me', 'my',
  'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'it', 'its', 'this', 'that', 'can', 'what', 'how', 'when',
  'where', 'which', 'who', 'have', 'has', 'any', 'with', 'there', 'please', 'hi', 'hello', 'about', 'tell',
]);

export function tokenize(text: string): string[] {
  // Explicitly typed: some TypeScript versions infer `match(...) || []` as
  // a union whose .filter() callback param becomes `never`.
  const words: string[] = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words
    .filter((w: string) => w.length > 1 && !STOPWORDS.has(w))
    // crude plural folding: "burgers" ~ "burger", "dishes" ~ "dish"
    .map((w) => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

export function rankByKeywords<T extends RankableEntry>(entries: T[], query: string, limit: number): T[] {
  if (entries.length <= limit) return entries;
  const queryTerms = [...new Set(tokenize(query))];
  if (!queryTerms.length) return entries.slice(0, limit);

  const docs = entries.map((e) => ({
    entry: e,
    question: tokenize(e.question || ''),
    body: tokenize([e.answer, e.content].filter(Boolean).join(' ')),
  }));
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set([...d.question, ...d.body])) df.set(t, (df.get(t) || 0) + 1);

  const n = docs.length;
  const scored = docs.map((d, index) => {
    let score = 0;
    for (const term of queryTerms) {
      const docFreq = df.get(term);
      if (!docFreq) continue;
      const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5));
      const tf = d.question.filter((t) => t === term).length * 2 + d.body.filter((t) => t === term).length;
      if (tf) score += idf * ((tf * 2.2) / (tf + 1.2)); // BM25 saturation, k1 = 1.2
    }
    return { entry: d.entry, score, index };
  });

  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  // Nothing matched (e.g. "hi") — keep the old behaviour of the first entries.
  if (!matched.length) return entries.slice(0, limit);
  return matched.slice(0, limit).map((s) => s.entry);
}
