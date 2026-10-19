export type ResponseLayoutKind =
  | 'standard'
  | 'structured'
  | 'tutorial'
  | 'plan'
  | 'comparison'
  | 'mathematical'
  | 'programming';

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface InlineChartSpec {
  type: 'bar' | 'line';
  title: string;
  description: string;
  labels: string[];
  series: ChartSeries[];
}

function stripCodeFences(content: string): string {
  return content.replace(/(^|\n)\s{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\s{0,3}\2[ \t]*(?=\n|$)|$)/gu, '$1');
}

export function selectResponseLayout(content: string): ResponseLayoutKind {
  const prose = escapeCurrencyDelimiters(stripCodeFences(content))
    .replace(/(`+)[\s\S]*?\1/gu, '');
  if (/^```cintra-chart\b/mu.test(content)) return 'structured';
  if (/^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/mu.test(prose)) return 'comparison';
  if (/^\s*(?:#{1,6}\s*)?(?:project plan|implementation plan|milestones|خطة المشروع|خطة التنفيذ|المراحل)(?:\b|(?=\s|$))/imu.test(prose)) return 'plan';
  if (/(?:\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\s)[^$\n]{1,160}(?<!\s)\$)/u.test(prose)) return 'mathematical';
  if (/^```/mu.test(content) || /^\s{0,3}(?:#{1,6}\s*)?(?:code|implementation|الكود|التنفيذ)\b/imu.test(prose)) return 'programming';
  if (/^\s*(?:[\d٠-٩۰-۹]+[.)、]\s+|[-*+]\s+\[[ xX]\]\s+)/mu.test(prose)) return 'tutorial';
  if (/^#{1,6}\s+/mu.test(prose)) return 'structured';
  return 'standard';
}

function cleanText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > maximumLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return null;
  return text;
}

export function parseInlineChartSpec(source: string): InlineChartSpec | null {
  if (source.length > 16_000) return null;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type !== 'bar' && record.type !== 'line') return null;
  const title = cleanText(record.title, 120);
  const description = cleanText(record.description, 240);
  if (!title || !description || !Array.isArray(record.labels) || !Array.isArray(record.series)) return null;
  if (record.labels.length < 2 || record.labels.length > 12 || record.series.length < 1 || record.series.length > 4) return null;
  const labels = record.labels.map((label) => cleanText(label, 40));
  if (labels.some((label) => !label)) return null;
  const series: ChartSeries[] = [];
  for (const candidate of record.series) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const item = candidate as Record<string, unknown>;
    const name = cleanText(item.name, 80);
    if (!name || !Array.isArray(item.values) || item.values.length !== labels.length) return null;
    if (item.values.some((number) => typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 1e12)) return null;
    series.push({ name, values: item.values as number[] });
  }
  return {
    type: record.type,
    title,
    description,
    labels: labels as string[],
    series,
  };
}

export function escapeCurrencyDelimiters(content: string): string {
  return content.replace(
    /(^|\n)[ \t]*(?:`{3,}|~{3,})[^\n]*(?:\n[\s\S]*?\n[ \t]*(?:`{3,}|~{3,})[ \t]*(?=\n|$)|$)|(`+)[\s\S]*?\2|(?<!\\)\$(?=\d+(?:,\d{3})*(?:\.\d{1,2})?(?=\s|[,.!?;:]|$))/gu,
    (match) => (/^\n?[ \t]*(?:`{3,}|~{3,})/u.test(match) || match.startsWith('`') ? match : `\\${match}`),
  );
}
