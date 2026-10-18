import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { load } from 'cheerio';
import ipaddr from 'ipaddr.js';
import { YoutubeTranscript } from 'youtube-transcript';

const MAX_URLS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_PAGE_CHARS = 8_000;
const LINK_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;

function extractUrls(message: string): URL[] {
  const candidates = message.match(LINK_PATTERN) || [];
  const urls: URL[] = [];

  for (const candidate of candidates) {
    const trimmed = candidate.replace(/[\])}>.,!?;:]+$/g, '');
    try {
      const url = new URL(trimmed);
      if (!urls.some((existing) => existing.href === url.href)) urls.push(url);
    } catch {
      continue;
    }
    if (urls.length === MAX_URLS) break;
  }

  return urls;
}

export function messageHasLinks(message: string): boolean {
  return extractUrls(message).length > 0;
}

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

async function validatePublicUrl(url: URL): Promise<Array<{ address: string; family: number }>> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Unsupported URL');
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Unsupported port');

  const hostname = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Private host');
  }

  const family = isIP(hostname);
  const addresses = family
    ? [{ address: hostname, family }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Private host');
  }
  return addresses;
}

async function readResponse(response: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of response) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) {
      response.destroy();
      throw new Error('Page is too large');
    }
    chunks.push(bytes);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function fetchPage(url: URL, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    let currentUrl = url;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const addresses = await validatePublicUrl(currentUrl);
      const makeRequest = currentUrl.protocol === 'https:' ? httpsRequest : httpRequest;
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const request = makeRequest(currentUrl, {
          headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9' },
          signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal,
          lookup: (_hostname, options, callback) => {
            if (typeof options === 'object' && options.all) {
              callback(null, addresses);
            } else {
              callback(null, addresses[0].address, addresses[0].family);
            }
          },
        }, resolve);
        request.once('error', reject);
        request.end();
      });

      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location;
        response.destroy();
        if (!location || redirects === 3) throw new Error('Too many redirects');
        currentUrl = new URL(Array.isArray(location) ? location[0] : location, currentUrl);
        continue;
      }

      if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
        response.destroy();
        throw new Error(`Page request failed (${response.statusCode})`);
      }
      const contentType = String(response.headers['content-type'] || '');
      if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(?:;|$)/i.test(contentType)) {
        response.destroy();
        throw new Error('Unsupported page type');
      }
      const contentLength = Number(response.headers['content-length'] || 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        response.destroy();
        throw new Error('Page is too large');
      }
      return await readResponse(response);
    }
    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timeout);
  }
}

function extractPageText(html: string): string {
  const $ = load(html);
  const title = $('meta[property="og:title"]').attr('content') || $('title').first().text();
  const description = $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content');
  $('script, style, noscript, svg, iframe, nav, footer, header').remove();
  const main = $('article').first().text() || $('main').first().text() || $('body').text();
  const body = main.replace(/\s+/g, ' ').trim();
  return [
    title && `Title: ${title.trim()}`,
    description && `Description: ${description.trim()}`,
    body && `Page text: ${body.slice(0, MAX_PAGE_CHARS)}`,
  ].filter(Boolean).join('\n');
}

function getYoutubeVideoId(url: URL): string | null {
  const hostname = url.hostname.toLowerCase();
  let videoId: string | null = null;
  if (hostname === 'youtu.be' || hostname === 'www.youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0] || null;
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname)) {
    videoId = url.searchParams.get('v')
      || url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1]
      || null;
  }
  return videoId && /^[\w-]{11}$/.test(videoId) ? videoId : null;
}

async function readYoutubeTranscript(videoId: string, signal?: AbortSignal): Promise<string> {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
    fetch: (input, init) => fetch(input, {
      ...init,
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        ...(signal ? [signal] : []),
        AbortSignal.timeout(12_000),
      ]),
    }),
  });
  return transcript.map((segment) => segment.text).join(' ').slice(0, MAX_PAGE_CHARS);
}

export async function readLinkedContent(message: string, maxChars: number, signal?: AbortSignal): Promise<string> {
  const urls = extractUrls(message);
  if (!urls.length || maxChars <= 0) return '';

  const perUrlBudget = Math.ceil(maxChars / urls.length);
  const contents = await Promise.all(urls.map(async (url) => {
    if (signal?.aborted) throw new Error('Research task was cancelled.');
    let source = '';
    const videoId = getYoutubeVideoId(url);

    if (videoId) {
      try {
        const transcript = await readYoutubeTranscript(videoId, signal);
        source = transcript
          ? `[YouTube video: ${url.href}]\nTranscript:\n${transcript}`
          : `[YouTube video: ${url.href}]\nNo transcript was available.`;
      } catch {
        if (signal?.aborted) throw new Error('Research task was cancelled.');
        source = `[YouTube video: ${url.href}]\nThe transcript could not be retrieved. It may be unavailable or blocked by YouTube.`;
      }
    } else {
      try {
        const html = await fetchPage(url, signal);
        const pageText = extractPageText(html);
        source = pageText ? `[Web page: ${url.href}]\n${pageText}` : `[Web page: ${url.href}]\nNo readable text was found.`;
      } catch {
        if (signal?.aborted) throw new Error('Research task was cancelled.');
        source = `[Web page: ${url.href}]\nThe page could not be retrieved. It may require sign-in or block automated access.`;
      }
    }

    return source.slice(0, perUrlBudget);
  }));

  return contents.join('\n\n').slice(0, maxChars);
}