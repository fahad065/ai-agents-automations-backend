import { rankByKeywords, tokenize } from './keyword-rank';

// A realistic restaurant knowledge base, longer than the old "first 8"
// cut-off, with the entries guests ask about placed near the end.
const filler = Array.from({ length: 24 }, (_, i) => ({
  type: 'faq', question: `General question number ${i}`, answer: `Standard answer text ${i}`,
}));
const kb = [
  ...filler,
  { type: 'faq', question: 'Do you have vegan options?', answer: 'Yes, our vegan menu has 6 dishes including the vegan burger.' },
  { type: 'faq', question: 'Is the food halal?', answer: 'All our meat is certified halal.' },
  { type: 'faq', question: 'What are your opening hours?', answer: 'We open 12pm to midnight every day.' },
  { type: 'faq', question: 'Do you deliver?', answer: 'Yes, delivery through our app and Deliveroo.' },
  { type: 'text', content: 'Parking: free valet parking at the main entrance.' },
  { type: 'faq', question: 'هل عندكم توصيل؟', answer: 'إيه، نوصل عن طريق التطبيق.' },
];

describe('rankByKeywords', () => {
  it('finds an entry far past the old first-8 cut-off', () => {
    const top = rankByKeywords(kb, 'Do you have vegan food?', 6);
    expect(top[0].question).toBe('Do you have vegan options?');
  });

  it('matches plurals and words that only appear in the answer/content', () => {
    expect(rankByKeywords(kb, 'any vegan burgers?', 6)[0].question).toBe('Do you have vegan options?');
    expect(rankByKeywords(kb, 'where can I park? is there parking', 6)[0].content).toContain('valet parking');
  });

  it('works for Arabic questions too', () => {
    expect(rankByKeywords(kb, 'عندكم توصيل للبيت؟', 6)[0].question).toBe('هل عندكم توصيل؟');
  });

  it('falls back to the first entries when nothing matches (e.g. a greeting)', () => {
    expect(rankByKeywords(kb, 'hello!', 3)).toEqual(kb.slice(0, 3));
  });

  it('returns everything untouched when the knowledge base is already small', () => {
    const small = kb.slice(-3);
    expect(rankByKeywords(small, 'halal', 6)).toBe(small);
  });

  it('never returns more than the limit', () => {
    expect(rankByKeywords(kb, 'question answer text', 6)).toHaveLength(6);
  });
});

describe('tokenize', () => {
  it('drops stopwords and folds simple plurals', () => {
    expect(tokenize('Do you have the burgers?')).toEqual(['burger']);
  });
});
