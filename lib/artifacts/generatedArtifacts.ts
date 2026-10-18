export type GeneratedArtifactKind = 'html' | 'css' | 'javascript' | 'json' | 'markdown' | 'text' | 'code';

export interface GeneratedArtifact {
  id: string;
  filename: string;
  language: string;
  kind: GeneratedArtifactKind;
  content: string;
}

const supportedLanguages: Record<string, GeneratedArtifactKind> = {
  html: 'html',
  htm: 'html',
  css: 'css',
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'javascript',
  ts: 'javascript',
  tsx: 'javascript',
  typescript: 'javascript',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  text: 'text',
  txt: 'text',
  py: 'code',
  python: 'code',
  bash: 'code',
  sh: 'code',
  shell: 'code',
  sql: 'code',
  java: 'code',
  c: 'code',
  cpp: 'code',
  csharp: 'code',
  cs: 'code',
  go: 'code',
  rust: 'code',
  ruby: 'code',
  php: 'code',
  swift: 'code',
  kotlin: 'code',
  yaml: 'code',
  yml: 'code',
  xml: 'code',
  toml: 'code',
  dockerfile: 'code',
};

const codeExtensions: Record<string, string> = {
  python: 'py',
  shell: 'sh',
  bash: 'sh',
  javascript: 'js',
  typescript: 'ts',
  csharp: 'cs',
};

const defaultExtensions: Record<GeneratedArtifactKind, string> = {
  html: 'html',
  css: 'css',
  javascript: 'js',
  json: 'json',
  markdown: 'md',
  text: 'txt',
  code: 'txt',
};

function safeFilename(value: string, kind: GeneratedArtifactKind, index: number): string {
  const cleaned = value
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 100);
  if (cleaned && /\.[a-z0-9]{1,8}$/i.test(cleaned)) return cleaned;
  if (cleaned) return `${cleaned}.${defaultExtensions[kind]}`;

  const defaults: Record<GeneratedArtifactKind, string> = {
    html: 'index',
    css: 'styles',
    javascript: 'script',
    json: 'data',
    markdown: 'document',
    text: 'document',
    code: 'code',
  };
  return `${defaults[kind]}${index > 1 ? `-${index}` : ''}.${defaultExtensions[kind]}`;
}

export function extractGeneratedArtifacts(content: string): GeneratedArtifact[] {
  const artifacts: GeneratedArtifact[] = [];
  const kindCounts = new Map<GeneratedArtifactKind, number>();
  const fencePattern = /^```([^\r\n]*)\r?\n([\s\S]*?)(?:\r?\n```[ \t]*(?=\r?\n|$)|(?![\s\S]))/gm;

  for (const match of content.matchAll(fencePattern)) {
    const info = match[1].trim();
    const [languageToken, ...metadata] = info.split(/\s+/);
    const normalizedLanguage = (languageToken || '').toLowerCase().replace(/^\{\.?/, '').replace(/\}$/, '');
    const kind = supportedLanguages[normalizedLanguage] || 'code';
    const language = normalizedLanguage || 'text';

    const index = (kindCounts.get(kind) || 0) + 1;
    kindCounts.set(kind, index);
    const filenameMetadata = metadata.join(' ').match(/(?:^|\s)(?:filename|file|title)=["']?([^"'\s]+)|(?:^|\s)([^\s]+\.[a-z0-9]{1,10})\b/i);
    const requestedFilename = filenameMetadata?.[1] || filenameMetadata?.[2] || '';
    const filename = requestedFilename
      ? safeFilename(requestedFilename, kind, index)
      : kind === 'code'
        ? `code${index > 1 ? `-${index}` : ''}.${codeExtensions[language] || (/^[a-z0-9]{1,10}$/i.test(language) ? language : 'txt')}`
        : safeFilename('', kind, index);
    artifacts.push({
      id: `${artifacts.length}-${filename}`,
      filename,
      language,
      kind,
      content: match[2].replace(/\r?\n$/, ''),
    });
    if (artifacts.length >= 12) break;
  }

  return artifacts;
}

export function stripGeneratedCodeBlocks(content: string): string {
  return content.replace(/^```[^\r\n]*\r?\n[\s\S]*?(?:\r?\n```[ \t]*(?=\r?\n|$)|(?![\s\S]))/gm, '').trim();
}

function insertIntoHead(document: string, tag: string): string {
  if (/<\/head\s*>/i.test(document)) return document.replace(/<\/head\s*>/i, `${tag}\n</head>`);
  if (/<head\b[^>]*>/i.test(document)) return document.replace(/<head\b[^>]*>/i, `$&\n${tag}`);
  if (/<html\b[^>]*>/i.test(document)) return document.replace(/<html\b[^>]*>/i, `$&\n<head>${tag}</head>`);
  return `<!doctype html><html><head>${tag}</head><body>${document}</body></html>`;
}

export function createArtifactPreview(
  artifacts: GeneratedArtifact[],
  selectedArtifact: GeneratedArtifact,
): string {
  const htmlArtifact = selectedArtifact.kind === 'html'
    ? selectedArtifact
    : artifacts.find((artifact) => artifact.kind === 'html');
  const css = artifacts.filter((artifact) => artifact.kind === 'css').map((artifact) => artifact.content).join('\n\n');
  const scripts = artifacts.filter((artifact) => artifact.kind === 'javascript').map((artifact) => artifact.content).join('\n;\n');
  let document = htmlArtifact?.content || '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';

  const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; font-src data:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'; object-src \'none\'">';
  document = insertIntoHead(document, policy);
  if (css) {
    document = insertIntoHead(document, `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
  }
  if (scripts) {
    const script = `<script>${scripts.replace(/<\/script/gi, '<\\/script')}</script>`;
    document = /<\/body\s*>/i.test(document)
      ? document.replace(/<\/body\s*>/i, `${script}\n</body>`)
      : `${document}\n${script}`;
  }
  return document;
}
