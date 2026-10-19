const IDENTITY_RESPONSE = 'أنا Cintra، مساعد الذكاء الاصطناعي الاحترافي الخاص بك. تم تطويري وتصميمي بالكامل بواسطة المهندس زياد صابر (Eng. Ziad Saber).';

const identityQuestionPatterns = [
  /^(?:(?:(?:ممكن|هل)\s+)?(?:من|مين)\s+(?:(?:هو|هي)\s+)?(?:أنت|انت|عملك|طورك|مطورك|صممك|مصممك|أنشأك|المطور|المبرمج|طور|أنشأ)|(?:ما|ايه|إيه)\s+(?:اسمك|هويتك|موديلك|نموذجك)|اسمك\s+(?:ايه|إيه|ما)|انت\s+مين|أنت\s+مين)(?:\s+(?:من فضلك|لو سمحت))?[\s؟?!.،]*$/iu,
  /^(?:(?:(?:please\s+)?(?:tell|introduce)\s+me\s+about\s+yourself)|who\s+are\s+you|what(?:'s|\s+is)\s+your\s+name|who\s+(?:created|made|developed|built)\s+you|what\s+is\s+your\s+model|which\s+model\s+are\s+you(?:\s+using)?|what\s+model\s+are\s+you(?:\s+using)?)(?:\s+please)?[\s?!.]*$/i,
];

export function isIdentityOnlyQuestion(message: string): boolean {
  const normalized = message
    .trim()
    .replace(/^[\s¿¡"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ');
  return normalized.length <= 120 && identityQuestionPatterns.some((pattern) => pattern.test(normalized));
}

const modelOrProvider = /(?:\bGemma(?:\s+\d+(?:\.\d+)?(?:\s+[A-Z0-9]+)*)?|\bGoogle\b|\bOpenAI\b|\bChatGPT\b|\bAnthropic\b|\bClaude(?:\s+[A-Z0-9][\w.-]*){0,3}|\bGemini\b|\bBayan\b|\bMeta\b|\bMistral(?:\s+AI)?\b|\bLlama(?:\s+\d+(?:\.\d+)?)?\b|\bMicrosoft\b|\bCopilot\b|\bxAI\b|\bGrok\b|\bDeepSeek\b|\bQwen\b)/iu;
const englishIdentityStart = /^(?:(?:I\s+am|I['’]m)\b|As\s+an?\b)/iu;
const englishAttribution = /\b(?:trained|created|developed|built|made|powered|provided)\s+(?:by|for)\b|\bfrom\b|\bby\b/iu;
const arabicFirstPersonStart = /^أنا(?=\s|$)/u;
const arabicAsIdentityStart = /^(?:بصفتي|باعتباري)\s+/u;
const arabicAttribution = /(?:من\s+(?:(?:قِبل|قبل|شركة)\s+)?(?:تطوير|إنشاء|تدريب)|(?:تم|جرى)\s+(?:تطويري|إنشائي|تدريبي)|(?:طورني|طورتني|أنشأني|درّبني|صممني)|تابع(?:ة)?\s+(?:ل(?:شركة)?|لشركة)|من\s+(?:Google|OpenAI|ChatGPT|Anthropic|Claude|Gemini|Gemma|Bayan|Meta|Mistral|Llama))/iu;
const arabicAsAttribution = /(?:من\s+(?:قِبل|قبل|جهة|شركة)|(?:تم|جرى)\s+(?:تطوير|إنشاء|بناء)|(?:صنع|طور|أنشأ)\s+(?:بواسطة|من))/iu;
const arabicAsPhrase = /^(?:بصفتي|باعتباري)\s+(?:منصة\s+)?(?:ذكاء\s+اصطناعي|الذكاء\s+الاصطناعي|نموذج|مساعد)/u;
const englishAsPhrase = /^As\s+an?\s+(?:AI|artificial intelligence|language model|large language model)\b/iu;

function isFalseIdentitySentence(sentence: string): boolean {
  const normalized = sentence.trim().replace(/^[>"'“”‘’]+/u, '').trim();
  if (!modelOrProvider.test(normalized)) return false;
  if (englishIdentityStart.test(normalized)) return englishAttribution.test(normalized);
  if (arabicAsIdentityStart.test(normalized)) {
    return arabicAsPhrase.test(normalized) && arabicAsAttribution.test(normalized);
  }
  return arabicFirstPersonStart.test(normalized) && arabicAttribution.test(normalized);
}

function replacementForSentence(sentence: string): string {
  if (arabicAsIdentityStart.test(sentence) && arabicAsPhrase.test(sentence)) {
    return 'بصفتي منصة Cintra الذكية المطورة بواسطة المهندس زياد صابر.';
  }
  if (arabicFirstPersonStart.test(sentence)) {
    return 'أنا Cintra، تم تطويري بواسطة المهندس زياد صابر.';
  }
  if (englishAsPhrase.test(sentence)) {
    return 'As Cintra, an AI platform developed by Eng. Ziad Saber.';
  }
  return 'I am Cintra, your professional AI assistant, developed by Eng. Ziad Saber.';
}

function replaceSentenceIfNeeded(segment: string): string {
  const leadingWhitespace = segment.match(/^\s*/u)?.[0] || '';
  const trailingWhitespace = segment.match(/\s*$/u)?.[0] || '';
  const sentence = segment.slice(leadingWhitespace.length, segment.length - trailingWhitespace.length);
  return isFalseIdentitySentence(sentence)
    ? `${leadingWhitespace}${replacementForSentence(sentence)}${trailingWhitespace}`
    : segment;
}

export function replaceFalseIdentityClaims(text: string): string {
  let output = '';
  let sentenceStart = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '\n' || character === '\r') {
      output += replaceSentenceIfNeeded(text.slice(sentenceStart, index + 1));
      sentenceStart = index + 1;
      continue;
    }
    if (character !== '.' && character !== '!' && character !== '?' && character !== '؟') continue;

    let end = index + 1;
    while (end < text.length && /[.!?؟]/u.test(text[end])) end++;
    if (end < text.length && !/\s/u.test(text[end])) {
      index = end - 1;
      continue;
    }

    output += replaceSentenceIfNeeded(text.slice(sentenceStart, end));
    sentenceStart = end;
    index = end - 1;
  }

  output += replaceSentenceIfNeeded(text.slice(sentenceStart));
  return output;
}

export function filterIdentityResponse(value: unknown): unknown {
  if (typeof value === 'string') return replaceFalseIdentityClaims(value);
  if (Array.isArray(value)) return value.map(filterIdentityResponse);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, filterIdentityResponse(entry)]));
  }
  return value;
}

function findCompleteSentenceBoundary(text: string): number {
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '\n' || character === '\r') return index + 1;
    if (character !== '.' && character !== '!' && character !== '?' && character !== '؟') continue;

    let end = index + 1;
    while (end < text.length && /[.!?؟]/u.test(text[end])) end++;
    if (end < text.length && !/\s/u.test(text[end])) {
      index = end - 1;
      continue;
    }
    if (end < text.length) return end;
  }
  return -1;
}

function mayBeIdentitySentence(text: string): boolean {
  const normalized = text.trimStart().replace(/^[>"'“”‘’]+/u, '').trimStart();
  if (!normalized) return false;
  return /^(?:I(?:\s+(?:a(?:m)?)?)?|I['’]m?|As(?:\s+an?)?|أنا|بصفتي|باعتباري)(?:$|\s|[.,:;!?؟])/iu.test(normalized);
}

export function createIdentityAwareStreamFilter(): {
  push: (chunk: string) => string;
  finish: () => string;
} {
  let pending = '';

  const drain = (final: boolean): string => {
    let output = '';
    while (pending) {
      const boundary = findCompleteSentenceBoundary(pending);
      if (boundary >= 0) {
        output += replaceFalseIdentityClaims(pending.slice(0, boundary));
        pending = pending.slice(boundary);
        continue;
      }
      if (!final && mayBeIdentitySentence(pending)) return output;
      output += replaceFalseIdentityClaims(pending);
      pending = '';
    }
    return output;
  };

  return {
    push(chunk) {
      pending += chunk;
      return drain(false);
    },
    finish() {
      return drain(true);
    },
  };
}

export type InlineImageStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'image'; prompt: string };

const INLINE_IMAGE_MARKER = '[[CINTRA_IMAGE:';

export function createInlineImageStreamFilter(maxImages = 2): {
  push: (chunk: string) => InlineImageStreamEvent[];
  finish: () => InlineImageStreamEvent[];
} {
  let pending = '';
  let imageCount = 0;

  const drain = (final: boolean): InlineImageStreamEvent[] => {
    const events: InlineImageStreamEvent[] = [];
    while (pending) {
      const markerStart = pending.indexOf(INLINE_IMAGE_MARKER);
      if (markerStart < 0) {
        const safeLength = final ? pending.length : Math.max(0, pending.length - INLINE_IMAGE_MARKER.length + 1);
        if (safeLength) {
          events.push({ type: 'text', content: pending.slice(0, safeLength) });
          pending = pending.slice(safeLength);
        }
        break;
      }
      if (markerStart > 0) {
        events.push({ type: 'text', content: pending.slice(0, markerStart) });
        pending = pending.slice(markerStart);
      }

      const markerEnd = pending.indexOf(']]', INLINE_IMAGE_MARKER.length);
      if (markerEnd < 0) {
        if (pending.length > INLINE_IMAGE_MARKER.length + 1000) {
          events.push({ type: 'text', content: pending.slice(0, INLINE_IMAGE_MARKER.length) });
          pending = pending.slice(INLINE_IMAGE_MARKER.length);
          continue;
        }
        if (final) {
          pending = '';
        }
        break;
      }

      const prompt = pending.slice(INLINE_IMAGE_MARKER.length, markerEnd).trim();
      pending = pending.slice(markerEnd + 2);
      if (!prompt || prompt.length > 1000) continue;
      if (imageCount < maxImages) {
        events.push({ type: 'image', prompt });
        imageCount++;
      }
    }
    return events;
  };

  return {
    push(chunk) {
      pending += chunk;
      return drain(false);
    },
    finish() {
      return drain(true);
    },
  };
}

export { IDENTITY_RESPONSE };
