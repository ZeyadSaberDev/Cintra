export interface InteractiveQuestion {
  prompt: string;
  options: string[];
}

export interface InteractiveOptionsBlock {
  kind: 'options';
  questions: InteractiveQuestion[];
  action: string | null;
}

export interface MarkdownBlock {
  kind: 'markdown';
  content: string;
}

export type MessageContentBlock = InteractiveOptionsBlock | MarkdownBlock;

export function sanitizeMarkdownUrl(value?: string, contentType: 'link' | 'image' = 'link'): string | undefined {
  const href = value?.trim();
  if (!href || /[\u0000-\u001f\u007f\\]/u.test(href)) return undefined;
  if (/^\/(?![\\/])|^(?:\.{1,2}\/|#|\?)/u.test(href)) return href;
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' || url.protocol === 'http:') return href;
    if (contentType === 'link' && (url.protocol === 'mailto:' || url.protocol === 'tel:')) return href;
    return undefined;
  } catch {
    return undefined;
  }
}

const questionPrefixPattern = /^\s*(?:#{1,4}\s*)?(?:(?:\d+[.)、]\s+)|(?:(?:question|q|سؤال)\s*\d*\s*[:.)：-]\s*))(.+?)\s*$/iu;
const unnumberedPromptPattern = /^\s*(?:#{1,4}\s*)?(.+?)\s*$/u;
const checkboxOptionPattern = /^\s*(?:[-*+]\s*)?\[(?:\s|x|X)\]\s*(.+?)\s*$/u;
const radioOptionPattern = /^\s*(?:[-*+•▪◦‣]\s*)?(?:○|◯|◉|●|⚪|🔘)\s*(.+?)\s*$/u;
const bulletOptionPattern = /^\s*[-*+•▪◦‣]\s+(.+?)\s*$/u;
const optionsHeadingPattern = /^\s*(?:options|choices|answer choices|الخيارات|الاختيارات|الاجابات|الإجابات)\s*[:：]\s*$/iu;
const actionPattern = /^\s*(?:[-*+]\s*)?(?:👉\s*)?(?:\*\*)?(?:button|زر)\s*[:：]\s*(.+?)(?:\*\*)?\s*$/iu;
const knownActionPattern = /^\s*(?:👉\s*)?(?:\*\*)?(اشرح لي الخطوات|تأكيد الإجابة|تأكيد الاجابة|ابدأ الاختبار|تحقق من الإجابة|تحقق من الاجابة|إرسال الإجابة|ارسال الاجابة|explain the steps|confirm answer|submit answer|check answer|start quiz)(?:\*\*)?[.!؟]?\s*$/iu;
const interrogativePromptPattern = /(?:[?؟]\s*[*_]*\s*$|^\s*(?:(?:which|what|who|where|when|why|how|would you prefer|do you prefer|are you using)\b|(?:هل|ما|ماذا|من|أي|أيه|أية|إيه|ايه|كيف|متى|أين|اين|لماذا|كم)(?=\s|$)))/iu;
const explicitSelectionPromptPattern = /^\s*(?:please\s+)?(?:choose|select|pick)\s+(?:one|an answer|an option|your answer|your preferred option)\b|^\s*(?:من فضلك\s*)?(?:اختر|حدد)\s+(?:الإجابة|الاجابة|إجابة|اجابة|خيار|اختياراً|اختيارًا)(?:\s|$)/iu;
const quotedLinePattern = /^\s*(?:["'“‘`]).*(?:["'”’`])\s*$/u;

function getAction(line: string): string | null {
  const explicit = actionPattern.exec(line)?.[1]?.trim();
  if (explicit) return explicit.replace(/\*\*/g, '');
  return knownActionPattern.exec(line)?.[1]?.trim()
    || knownActionPattern.exec(line.replace(/\*\*/g, ''))?.[1]?.trim()
    || null;
}

export function parseInteractiveOptions(content: string): MessageContentBlock[] {
  const lines = content.split('\n');
  const protectedLines = new Array(lines.length).fill(false) as boolean[];
  let activeFence: { marker: string; length: number } | null = null;
  lines.forEach((line, index) => {
    const fence = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (!activeFence && fence) {
      activeFence = { marker: fence[0], length: fence.length };
      protectedLines[index] = true;
      return;
    }
    if (activeFence) {
      protectedLines[index] = true;
      const fenceTail = line.replace(/^\s{0,3}[`~]+/u, '');
      if (
        fence
        && fence[0] === activeFence.marker
        && fence.length >= activeFence.length
        && !fenceTail.trim()
      ) activeFence = null;
      return;
    }
    protectedLines[index] = /^\s{0,3}>/u.test(line)
      || /^\s{4,}\S/u.test(line)
      || /^\s*(?:\|.*\||:{3,}\s*)$/u.test(line)
      || quotedLinePattern.test(line);
  });
  const questionAt = (index: number): string | null => {
    if (protectedLines[index]) return null;
    const line = lines[index] || '';
    const prompt = questionPrefixPattern.exec(line)?.[1]?.trim()
      || unnumberedPromptPattern.exec(line)?.[1]?.trim();
    if (!prompt || (!interrogativePromptPattern.test(prompt) && !explicitSelectionPromptPattern.test(prompt))) return null;
    return prompt.replace(/^(?:\*\*|__)(.+?)(?:\*\*|__)$/u, '$1').trim();
  };
  const optionAt = (index: number, allowBullets: boolean): string | null => {
    if (protectedLines[index]) return null;
    const line = lines[index] || '';
    return checkboxOptionPattern.exec(line)?.[1]?.trim()
      || radioOptionPattern.exec(line)?.[1]?.trim()
      || (allowBullets ? bulletOptionPattern.exec(line)?.[1]?.trim() : null)
      || null;
  };
  const blocks: MessageContentBlock[] = [];
  let markdownStart = 0;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    if (!questionAt(lineIndex)) {
      lineIndex += 1;
      continue;
    }

    const questions: InteractiveQuestion[] = [];
    let cursor = lineIndex;
    while (cursor < lines.length) {
      const prompt = questionAt(cursor);
      if (!prompt) break;

      let optionCursor = cursor + 1;
      while (optionCursor < lines.length && !lines[optionCursor].trim()) optionCursor += 1;
      let allowBullets = false;
      if (!protectedLines[optionCursor] && optionsHeadingPattern.test(lines[optionCursor] || '')) {
        allowBullets = true;
        optionCursor += 1;
        while (optionCursor < lines.length && !lines[optionCursor].trim()) optionCursor += 1;
      }
      const options: string[] = [];
      while (optionCursor < lines.length) {
        const option = optionAt(optionCursor, allowBullets);
        if (!option) break;
        options.push(option);
        optionCursor += 1;
      }
      if (options.length < 2) break;

      questions.push({ prompt, options });
      cursor = optionCursor;
      while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
      if (!questionAt(cursor)) break;
    }

    if (!questions.length) {
      lineIndex += 1;
      continue;
    }

    if (lineIndex > markdownStart) {
      blocks.push({ kind: 'markdown', content: lines.slice(markdownStart, lineIndex).join('\n') });
    }
    const action = getAction(lines[cursor] || '');
    const blockEnd = action ? cursor + 1 : cursor;
    blocks.push({ kind: 'options', questions, action });
    lineIndex = blockEnd;
    markdownStart = blockEnd;
  }

  if (markdownStart < lines.length || !blocks.length) {
    blocks.push({ kind: 'markdown', content: lines.slice(markdownStart).join('\n') });
  }
  return blocks;
}

export function normalizeMathDelimiters(content: string): string {
  return content
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, formula: string) => `$$\n${formula.trim()}\n$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, formula: string) => `$${formula.trim()}$`);
}
