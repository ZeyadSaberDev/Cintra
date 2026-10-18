function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function getChatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  const apiRoot = normalized.replace(/\/models$/i, '');
  return `${apiRoot}${/\/v1$/i.test(apiRoot) ? '' : '/v1'}/chat/completions`;
}

export function getModelsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/models$/i.test(normalized)) return normalized;
  const apiRoot = normalized.replace(/\/chat\/completions$/i, '');
  return `${apiRoot}${/\/v1$/i.test(apiRoot) ? '' : '/v1'}/models`;
}

export function getWebSearchUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/search$/i.test(normalized)) return normalized;
  const apiRoot = normalized
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '');
  return `${apiRoot}${/\/v1$/i.test(apiRoot) ? '' : '/v1'}/search`;
}

function getApiEndpoint(baseUrl: string, endpoint: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  const apiRoot = normalized
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/search$/i, '')
    .replace(/\/images\/generations$/i, '')
    .replace(/\/audio\/(?:speech|transcriptions)$/i, '')
    .replace(/\/embeddings$/i, '');
  return `${apiRoot}${/\/v1$/i.test(apiRoot) ? '' : '/v1'}/${endpoint}`;
}

export function getAudioSpeechUrl(baseUrl: string): string {
  return getApiEndpoint(baseUrl, 'audio/speech');
}

export function getAudioTranscriptionsUrl(baseUrl: string): string {
  return getApiEndpoint(baseUrl, 'audio/transcriptions');
}

export function getEmbeddingsUrl(baseUrl: string): string {
  return getApiEndpoint(baseUrl, 'embeddings');
}
