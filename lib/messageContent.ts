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

const questionPattern = /^\s*(?:#{1,4}\s*)?(?:\d+[.)、]\s+|(?:question|q|سؤال)\s*\d*\s*[:.)：-]\s*)(.+?)\s*$/iu;
const optionPattern = /^\s*(?:[-*+•▪◦‣]\s*)?\[(?:\s|x|X)\]\s*(.+?)\s*$/u;
const bulletOptionPattern = /^\s*[-*+•▪◦‣]\s+(.+?)\s*$/u;
const radioPattern = /^\s*(?:○|◯|◉|●|⚪|🔘)\s*(.+?)\s*$/u;
const actionPattern = /^\s*(?:[-*+]\s*)?(?:👉\s*)?(?:\*\*)?(?:button|زر)\s*[:：]\s*(.+?)(?:\*\*)?\s*$/iu;
const knownActionPattern = /^\s*(?:👉\s*)?(?:\*\*)?(اشرح لي الخطوات|تأكيد الإجابة|تأكيد الاجابة|ابدأ الاختبار|تحقق من الإجابة|تحقق من الاجابة|إرسال الإجابة|ارسال الاجابة|explain the steps|confirm answer|submit answer|check answer|start quiz)(?:\*\*)?[.!؟]?\s*$/iu;
const embeddedActionPattern = /(اشرح لي الخطوات|تأكيد الإجابة|تأكيد الاجابة|ابدأ الاختبار|تحقق من الإجابة|تحقق من الاجابة|إرسال الإجابة|ارسال الاجابة|explain the steps|confirm answer|submit answer|check answer|start quiz)/iu;

function getQuestion(line: string): string | null {
  return questionPattern.exec(line)?.[1]?.trim() || null;
}

function getOption(line: string): string | null {
  return optionPattern.exec(line)?.[1]?.trim()
    || bulletOptionPattern.exec(line)?.[1]?.trim()
    || radioPattern.exec(line)?.[1]?.trim()
    || null;
}

function getAction(line: string): string | null {
  const explicit = actionPattern.exec(line)?.[1]?.trim();
  if (explicit) return explicit.replace(/\*\*/g, '');
  return knownActionPattern.exec(line)?.[1]?.trim()
    || knownActionPattern.exec(line.replace(/\*\*/g, ''))?.[1]?.trim()
    || embeddedActionPattern.exec(line.replace(/\*\*/g, ''))?.[1]?.trim()
    || null;
}

export function parseInteractiveOptions(content: string): MessageContentBlock[] {
  const lines = content.split('\n');
  const blocks: MessageContentBlock[] = [];
  let markdownStart = 0;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const firstQuestion = getQuestion(lines[lineIndex]);
    if (!firstQuestion) {
      lineIndex += 1;
      continue;
    }

    const questions: InteractiveQuestion[] = [];
    let cursor = lineIndex;
    while (cursor < lines.length) {
      const prompt = getQuestion(lines[cursor]);
      if (!prompt) break;

      let optionCursor = cursor + 1;
      while (optionCursor < lines.length && !lines[optionCursor].trim()) optionCursor += 1;
      const options: string[] = [];
      while (optionCursor < lines.length) {
        const option = getOption(lines[optionCursor]);
        if (!option) break;
        options.push(option);
        optionCursor += 1;
      }
      if (options.length < 2) break;

      questions.push({ prompt, options });
      cursor = optionCursor;
      while (cursor < lines.length && !lines[cursor].trim()) cursor += 1;
      if (!getQuestion(lines[cursor] || '')) break;
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
