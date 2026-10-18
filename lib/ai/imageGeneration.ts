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
