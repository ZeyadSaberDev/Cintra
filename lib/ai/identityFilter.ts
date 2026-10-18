const IDENTITY_RESPONSE = 'أنا Cintra، مساعد الذكاء الاصطناعي الخاص بك، تم تطويري وتصميمي بالكامل بواسطة المهندس زياد صابر.';

const identityQuestionPatterns = [
  /^(?:(?:من|مين)\s+(?:أنت|انت|عملك|طورك|صممك|أنشأك|المطور|المبرمج)|(?:ما|ايه|إيه)\s+(?:اسمك|هويتك|موديلك|نموذجك)|اسمك\s+(?:ايه|إيه|ما)|انت\s+مين|أنت\s+مين)[\s؟?!.،]*$/iu,
  /^(?:(?:tell|introduce)\s+me\s+about\s+yourself|who\s+are\s+you|what(?:'s|\s+is)\s+your\s+name|who\s+(?:created|made|developed|built)\s+you|what\s+is\s+your\s+model|which\s+model\s+are\s+you(?:\s+using)?|what\s+model\s+are\s+you(?:\s+using)?)[\s?!.]*$/i,
];

export function isIdentityOnlyQuestion(message: string): boolean {
  const normalized = message
    .trim()
    .replace(/^[\s¿¡"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ');
  return normalized.length <= 120 && identityQuestionPatterns.some((pattern) => pattern.test(normalized));
}

const attributionPatterns: RegExp[] = [
  /\bI\s+am\s+(?:an?\s+)?(?:(?:AI|artificial intelligence|language|large language|LLM)\s+)?(?:language\s+)?model\s+(?:trained|created|developed)\s+by\s+(?:OpenAI|Anthropic|Claude(?:\s+[A-Z0-9][\w.-]*){0,3}|Gemini|Google|ChatGPT)\b/gi,
  /\bI['’]m\s+(?:an?\s+)?(?:(?:AI|artificial intelligence|language|large language|LLM)\s+)?(?:language\s+)?model\s+(?:trained|created|developed)\s+by\s+(?:OpenAI|Anthropic|Claude(?:\s+[A-Z0-9][\w.-]*){0,3}|Gemini|Google|ChatGPT)\b/gi,
  /\bI\s+am\s+an?\s+AI\s+(?:created|developed|built|trained)\s+by\s+(?:OpenAI|Anthropic|Claude(?:\s+[A-Z0-9][\w.-]*){0,3}|Gemini|Google|ChatGPT)\b/gi,
  /\bI['’]m\s+an?\s+AI\s+(?:created|developed|built|trained)\s+by\s+(?:OpenAI|Anthropic|Claude(?:\s+[A-Z0-9][\w.-]*){0,3}|Gemini|Google|ChatGPT)\b/gi,
  /\bAs\s+an?\s+AI\s+(?:created|developed|built|trained)\s+by\s+(?:OpenAI|Anthropic|Claude(?:\s+[A-Z0-9][\w.-]*){0,3}|Gemini|Google|ChatGPT)\b/gi,
  /\bAs\s+an?\s+(?:language|large language|LLM)\s+model\s+(?:created|developed|built|trained)\s+by\s+(?:OpenAI|Anthropic|Claude(?:\s+[A-Z0-9][\w.-]*){0,3}|Gemini|Google|ChatGPT)\b/gi,
  /أنا\s+(?:نموذج|مساعد)(?:\s+ذكاء\s+اصطناعي)?\s+(?:(?:تم\s+)?(?:تطويري|إنشائي|تدريبي)\s+(?:من\s+قبل|بواسطة)|من\s+تطوير)\s+(?:OpenAI|Anthropic|Claude(?:\s+[A-Z0-9][\w.-]*){0,3}|Gemini|Google|ChatGPT)\b/giu,
];

const incompleteClaimPatterns = [
  /^(?:I\s+am|I['’]m)(?:\s+(?:an?\s+)?(?:(?:AI|artificial intelligence|language|large language|LLM)\s+)?(?:language\s+)?model(?:\s+(?:trained|created|developed))?(?:\s+by)?)?(?:\s+an?)?\s*$/i,
  /^As\s+an?\s+(?:(?:AI|artificial intelligence|language|large language|LLM)(?:\s+(?:language\s+)?model)?|(?:language|large language|LLM)\s+model)(?:\s+(?:created|developed|built|trained))?(?:\s+by)?\s*$/i,
  /^أنا\s+(?:نموذج|مساعد)(?:\s+ذكاء\s+اصطناعي)?(?:\s+(?:(?:تم\s+)?(?:تطويري|إنشائي|تدريبي)(?:\s+(?:من\s+قبل|بواسطة))?|من\s+تطوير))?\s*$/u,
];

const claimStarts = [
  /\bI\s+am\s+/i,
  /\bI['’]m\s+/i,
  /\bAs\s+an?\s+/i,
  /أنا\s+(?:نموذج|مساعد)/u,
];

function findFirstAttribution(text: string): { index: number; length: number } | null {
  let first: { index: number; length: number } | null = null;
  for (const pattern of attributionPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match && (first === null || match.index < first.index)) {
      first = { index: match.index, length: match[0].length };
    }
  }
  return first;
}

export function replaceFalseIdentityClaims(text: string): string {
  let output = '';
  let remaining = text;
  while (remaining) {
    const match = findFirstAttribution(remaining);
    if (!match) return output + remaining;
    output += `${remaining.slice(0, match.index)}Cintra المطوّر بواسطة المهندس زياد صابر`;
    remaining = remaining.slice(match.index + match.length);
  }
  return output;
}

export function createIdentityAwareStreamFilter(): {
  push: (chunk: string) => string;
  finish: () => string;
} {
  let pending = '';

  const drain = (final: boolean): string => {
    let output = '';
    while (pending) {
      const attribution = findFirstAttribution(pending);
      if (attribution) {
        output += pending.slice(0, attribution.index);
        output += 'Cintra المطوّر بواسطة المهندس زياد صابر';
        pending = pending.slice(attribution.index + attribution.length);
        continue;
      }

      let potentialStart = -1;
      for (const startPattern of claimStarts) {
        const match = startPattern.exec(pending);
        if (match && (potentialStart === -1 || match.index < potentialStart)) potentialStart = match.index;
      }

      if (!final && potentialStart !== -1) {
        const candidate = pending.slice(potentialStart);
        if (incompleteClaimPatterns.some((pattern) => pattern.test(candidate))) {
          output += pending.slice(0, potentialStart);
          pending = candidate;
          return output;
        }
      }

      output += pending;
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

export { IDENTITY_RESPONSE };
