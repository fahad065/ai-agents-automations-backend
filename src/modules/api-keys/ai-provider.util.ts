import { ApiKeyProvider } from './schemas/api-key.schema';

// Shared provider-adapter for every AI-calling step that goes through a
// customer's own BYOK key (chat completions + embeddings today). Each
// provider has a genuinely different request/response shape — this is
// what actually branches on that, so ChatService/ChatbotsService never
// have to know the wire format of whichever provider a given chatbot is
// configured to use.
//
// "auto" model resolution deliberately does NOT make a live models.list()
// call per request (unlike core/model_health.py's get_best_openai_*
// helpers on the Python side) — for a customer-facing chat endpoint, an
// extra network round trip on every single message isn't worth it. Each
// provider's "auto" model below is a fixed, known-good default instead.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  provider: ApiKeyProvider;
  model?: string; // 'auto' or omitted -> provider default
  apiKey: string;
  messages: ChatMessage[]; // a 'system' entry, if present, is pulled out for providers that need it separate
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface EmbeddingOptions {
  provider: ApiKeyProvider;
  model?: string;
  apiKey: string;
  text: string;
}

const DEFAULT_CHAT_MODEL: Partial<Record<ApiKeyProvider, string>> = {
  [ApiKeyProvider.OPENAI]: 'gpt-4o-mini',
  [ApiKeyProvider.ANTHROPIC]: 'claude-3-5-haiku-latest',
  [ApiKeyProvider.GEMINI]: 'gemini-2.0-flash',
};

const DEFAULT_EMBEDDING_MODEL: Partial<Record<ApiKeyProvider, string>> = {
  [ApiKeyProvider.OPENAI]: 'text-embedding-3-small',
  [ApiKeyProvider.GEMINI]: 'text-embedding-004',
};

export function isChatCapableProvider(provider: ApiKeyProvider): boolean {
  return !!DEFAULT_CHAT_MODEL[provider];
}

// Anthropic has no embeddings API at all — only OpenAI/Gemini are valid
// here. Callers must validate this BEFORE saving a chatbot's
// embeddingModelConfig, not just at call time.
export function isEmbeddingCapableProvider(provider: ApiKeyProvider): boolean {
  return !!DEFAULT_EMBEDDING_MODEL[provider];
}

export function resolveChatModel(provider: ApiKeyProvider, model?: string): string {
  if (!model || model === 'auto') {
    return DEFAULT_CHAT_MODEL[provider] || DEFAULT_CHAT_MODEL[ApiKeyProvider.OPENAI]!;
  }
  return model;
}

export function resolveEmbeddingModel(provider: ApiKeyProvider, model?: string): string {
  if (!model || model === 'auto') {
    return DEFAULT_EMBEDDING_MODEL[provider] || DEFAULT_EMBEDDING_MODEL[ApiKeyProvider.OPENAI]!;
  }
  return model;
}

export async function callChatCompletion(opts: ChatCompletionOptions): Promise<string> {
  const model = resolveChatModel(opts.provider, opts.model);
  const maxTokens = opts.maxTokens ?? 512;
  const temperature = opts.temperature ?? 0.7;

  if (opts.provider === ApiKeyProvider.ANTHROPIC) {
    const systemMsg = opts.messages.find((m) => m.role === 'system')?.content;
    const rest = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        ...(systemMsg ? { system: systemMsg } : {}),
        max_tokens: maxTokens,
        temperature,
        messages: rest.length ? rest : [{ role: 'user', content: '' }],
      }),
    });
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic chat completion failed (${response.status}): ${errBody}`);
    }
    const data = (await response.json()) as any;
    return (data.content?.[0]?.text || '').trim();
  }

  if (opts.provider === ApiKeyProvider.GEMINI) {
    const systemMsg = opts.messages.find((m) => m.role === 'system')?.content;
    const contents = opts.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

    const body: any = {
      contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '' }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature,
        ...(opts.jsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg }] };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Gemini chat completion failed (${response.status}): ${errBody}`);
    }
    const data = (await response.json()) as any;
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  }

  // OpenAI (default)
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      max_tokens: maxTokens,
      temperature,
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI chat completion failed (${response.status}): ${errBody}`);
  }
  const data = (await response.json()) as any;
  return (data.choices?.[0]?.message?.content || '').trim();
}

export async function getEmbeddingVector(opts: EmbeddingOptions): Promise<number[]> {
  if (!isEmbeddingCapableProvider(opts.provider)) {
    throw new Error(`Provider ${opts.provider} does not support embeddings`);
  }
  const model = resolveEmbeddingModel(opts.provider, opts.model);

  if (opts.provider === ApiKeyProvider.GEMINI) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${opts.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: { parts: [{ text: opts.text }] } }),
      },
    );
    if (!response.ok) throw new Error(`Gemini embeddings error: ${response.status}`);
    const data = (await response.json()) as any;
    return data.embedding?.values as number[];
  }

  // OpenAI (default)
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: opts.text }),
  });
  if (!response.ok) throw new Error(`OpenAI embeddings error: ${response.status}`);
  const data = (await response.json()) as any;
  return data.data[0].embedding as number[];
}
