const complexPromptPattern =
  /\b(analy[sz]e|compare|contrast|evaluate|explain|design|debug|derive|prove|reason|plan|strategy|step[- ]by[- ]step|trade[- ]offs?|pros and cons|in depth|comprehensive|architecture)\b/i;
const complexArabicPromptPattern =
  /تعمق|حلل|قارن|اشرح|صمم|خطوات|استراتيجية|بالتفصيل|ما الفرق|لماذا/;

export function shouldUseThinkingMode(message: string): boolean {
  const normalized = message.trim();
  const isSimpleGreeting = /^(hi|hello|hey|thanks|thank you|مرحبا|أهلا|اهلا|السلام عليكم)[.!؟?]*$/i.test(normalized);

  if (!normalized || isSimpleGreeting) return false;
  return complexPromptPattern.test(normalized) || complexArabicPromptPattern.test(normalized);
}
