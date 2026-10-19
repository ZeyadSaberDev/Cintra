export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

export function getImageGenerationsUrl(configuredUrl: string): string {
  const endpoint = new URL(configuredUrl.trim());
  const pathname = endpoint.pathname.replace(/\/+$/, '');

  if (/\/images\/generations$/i.test(pathname)) return endpoint.toString();
  if (/\/chat\/completions$/i.test(pathname)) {
    endpoint.pathname = pathname.replace(/\/chat\/completions$/i, '/images/generations');
  } else if (/\/images$/i.test(pathname)) {
    endpoint.pathname = `${pathname}/generations`;
  } else if (/\/v1$/i.test(pathname)) {
    endpoint.pathname = `${pathname}/images/generations`;
  } else {
    endpoint.pathname = `${pathname}/v1/images/generations`;
  }

  return endpoint.toString();
}

export function getImageSize(model: string, aspectRatio: ImageAspectRatio): string {
  if (/^dall-e-3$/i.test(model.trim())) {
    if (aspectRatio === '16:9' || aspectRatio === '4:3') return '1792x1024';
    if (aspectRatio === '9:16') return '1024x1792';
    return '1024x1024';
  }

  if (aspectRatio === '16:9' || aspectRatio === '4:3') return '1536x1024';
  if (aspectRatio === '9:16') return '1024x1536';
  return '1024x1024';
}

export function buildImageGenerationPayload(
  model: string,
  prompt: string,
  aspectRatio: ImageAspectRatio,
): Record<string, string | number> {
  if (/^@?cf\//i.test(model.trim())) return { model, prompt };
  return { model, prompt, n: 1, size: getImageSize(model, aspectRatio) };
}

const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_RESPONSE_BYTES = 30 * 1024 * 1024;

async function readLimitedResponse(response: Response, limit: number): Promise<Buffer> {
  if (!response.body) throw new Error('The image provider returned an empty response.');
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > limit) throw new Error('The image provider response exceeds the size limit.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error('The image provider response exceeds the size limit.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function getVerifiedImageMimeType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  throw new Error('The image provider returned an unsupported or invalid image.');
}

export async function generateInlineImage({
  configuredUrl,
  apiKey,
  model,
  prompt,
  signal,
}: {
  configuredUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<{ bytes: Buffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }> {
  const endpoint = new URL(getImageGenerationsUrl(configuredUrl));
  if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('The image API endpoint protocol is unsupported.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildImageGenerationPayload(model, prompt.slice(0, 1000), '4:3')),
    signal,
  });
  if (!response.ok) throw new Error(`The image provider returned status ${response.status}.`);

  const responseType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (responseType.startsWith('image/')) {
    const bytes = await readLimitedResponse(response, MAX_GENERATED_IMAGE_BYTES);
    return { bytes, mimeType: getVerifiedImageMimeType(bytes) };
  }

  const responseBytes = await readLimitedResponse(response, MAX_IMAGE_RESPONSE_BYTES);
  let payload: unknown;
  try {
    payload = JSON.parse(responseBytes.toString('utf8'));
  } catch {
    throw new Error('The image provider returned an invalid response.');
  }
  const generated = extractGeneratedImage(payload);
  if (!generated) throw new Error('The image provider did not return an image.');

  let bytes: Buffer;
  if (generated.base64) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(generated.base64)
      || generated.base64.length > 28_000_000) {
      throw new Error('The image provider returned invalid image data.');
    }
    bytes = Buffer.from(generated.base64, 'base64');
  } else if (generated.url) {
    let imageUrl: URL;
    try {
      imageUrl = new URL(generated.url);
    } catch {
      throw new Error('The image provider returned an invalid image URL.');
    }
    if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password) {
      throw new Error('The image provider returned an unsupported image URL.');
    }
    const imageResponse = await fetch(imageUrl, { signal });
    if (!imageResponse.ok) throw new Error(`The generated image download returned status ${imageResponse.status}.`);
    bytes = await readLimitedResponse(imageResponse, MAX_GENERATED_IMAGE_BYTES);
  } else {
    throw new Error('The image provider did not return an image.');
  }

  if (!bytes.length || bytes.length > MAX_GENERATED_IMAGE_BYTES) {
    throw new Error('The generated image is empty or exceeds the size limit.');
  }
  return { bytes, mimeType: getVerifiedImageMimeType(bytes) };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sanitizeProviderMessage(value: string): string | null {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{12,}\b/g, '[redacted key]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 240) || null;
}

export function extractGeneratedImage(payload: unknown): { base64?: string; url?: string } | null {
  const root = asRecord(payload);
  if (!root) return null;

  const data = Array.isArray(root.data) ? asRecord(root.data[0]) : null;
  const result = asRecord(root.result);
  const candidates = [data, result, root];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const encoded = candidate.b64_json ?? candidate.image;
    if (typeof encoded === 'string' && encoded) {
      const dataUri = encoded.match(/^data:image\/(?:png|jpeg|webp);base64,(.+)$/i);
      return { base64: dataUri?.[1] || encoded };
    }
    if (typeof candidate.url === 'string' && candidate.url) return { url: candidate.url };
  }
  return null;
}

export function extractImageProviderError(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return sanitizeProviderMessage(payload.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
  }
  const root = asRecord(payload);
  if (!root) return null;
  const error = asRecord(root.error);
  const message = error?.message ?? root.message ?? root.detail;
  if (typeof message !== 'string') return null;
  return sanitizeProviderMessage(message);
}

export function imageProviderError(status: number): {
  code: string;
  message: string;
  messageAr: string;
} & { providerMessage?: string } {
  if (status === 429) {
    return {
      code: 'IMAGE_RATE_LIMITED',
      message: 'The image service is busy. Please try again shortly.',
      messageAr: 'خدمة الصور مشغولة حالياً. يرجى المحاولة بعد قليل.',
    };
  }
  if (status === 400 || status === 422) {
    return {
      code: 'IMAGE_MODEL_REJECTED',
      message: 'The image provider rejected the configured model or image options. Check the image model in Admin settings.',
      messageAr: 'رفض مزوّد الصور النموذج أو الإعدادات. تحقق من اسم نموذج الصور في إعدادات الإدارة.',
    };
  }
  if (status === 401 || status === 403) {
    return {
      code: 'IMAGE_PROVIDER_AUTH_ERROR',
      message: 'The image provider rejected the API key or does not allow image generation for this account.',
      messageAr: 'رفض مزوّد الصور مفتاح API أو أن الحساب لا يملك صلاحية إنشاء الصور.',
    };
  }
  if (status === 404 || status === 405 || status === 501) {
    return {
      code: 'IMAGE_PROVIDER_UNAVAILABLE',
      message: 'This API does not provide the OpenAI-compatible image generation endpoint. Configure an image-capable endpoint and model.',
      messageAr: 'واجهة الـAPI الحالية لا تدعم مسار إنشاء الصور المتوافق مع OpenAI. أضف مساراً ونموذجاً يدعمان إنشاء الصور.',
    };
  }
  return {
    code: 'IMAGE_PROVIDER_ERROR',
    message: 'The image could not be generated right now. Please try again later.',
    messageAr: 'تعذر إنشاء الصورة حاليًا. يرجى المحاولة لاحقًا.',
  };
}
