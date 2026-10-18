function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\u0640/g, '');
}

export function hasExplicitWebSearchIntent(message: string): boolean {
  const text = normalizeSearchText(message);
  const englishRequest = /\b(?:search(?:\s+the\s+web|\s+online|\s+for(?:\s+me)?)|look\s+(?:it\s+)?up(?:\s+online)?|check\s+(?:it\s+)?online|browse\s+the\s+web|find\s+(?:it|this)\s+online)\b/i;
  const arabicRequest = /(?:ابحث(?:\s+لي)?(?:\s+عن|\s+في)?|دور(?:\s+لي)?(?:\s+في)?|شوف(?:\s+لي)?\s+في\s+(?:المواقع|النت|الانترنت|الويب)|تحقق\s+من\s+(?:النت|الانترنت|الويب)|(?:في|على)\s+(?:النت|الانترنت|الويب)|ما\s+(?:هي\s+)?اخر\s+اخبار|اخر\s+الاخبار)/;
  const currentNewsRequest = /\b(?:latest|recent|current)\s+news\b|\bnews\s+(?:today|right\s+now)\b/i;

  return englishRequest.test(text) || arabicRequest.test(text) || currentNewsRequest.test(text);
}
