import React, { createContext, useContext, useEffect, useState } from 'react';
import arAdditional from '../../lib/i18n/ar.json';

export type LanguageMode = 'auto' | 'ar' | 'en';
export type ActiveLanguage = 'ar' | 'en';

interface LanguageContextType {
  mode: LanguageMode;
  currentLang: ActiveLanguage;
  isRtl: boolean;
  setLanguageMode: (mode: LanguageMode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const translations: Record<ActiveLanguage, Record<string, string>> = {
  en: {
    // Brand
    brandName: 'Cintra',
    brandNameAr: 'Cintra',
    tagline: 'AI Workspace',

    // Top bar & actions
    share: 'Share',
    modelSelector: 'Model',
    newChat: 'New chat',
    searchChats: 'Search chats...',
    noChatsFound: 'No chats found',
    renameConversation: 'Rename',
    pinConversation: 'Pin',
    unpinConversation: 'Unpin',
    deleteConversation: 'Delete',
    pinned: 'Pinned',
    toggleSidebar: 'Toggle sidebar',
    aboutBayan: 'About Cintra',
    thinkingMode: 'Enable Thinking Mode',
    thinkingModeDescription: 'Use a more deliberate response for complex questions.',
    typing: 'Generating response...',

    // Sidebar groups
    today: 'Today',
    yesterday: 'Yesterday',
    previous7Days: 'Previous 7 Days',
    older: 'Older',
    noConversationsYet: 'No conversations yet',
    startNewChatPrompt: 'Start typing below to create your first chat.',

    // Empty state
    greetingTitle: 'How can I help you today?',
    greetingTitleNamed: 'How can I help you today, {name}?',
    emptyStateDescription: 'Ask a question, explore an idea, or start with a suggestion.',
    chipBilingual: 'Bilingual Synthesis',
    chipPoetics: 'Arabic Poetics & NLP',
    chipCode: 'Code & Systems',
    chipFinance: 'Financial Audit',

    // Starters
    starter1Title: 'Analyze Arabic Poetry Meter',
    starter1Category: 'Poetics',
    starter1Desc: 'Explain Bahr Al-Tawil with classical examples and meter notation.',

    starter2Title: 'Summarize Financial Report',
    starter2Category: 'Finance',
    starter2Desc: 'Extract key KPIs, operating cash flows, and balance sheet variances.',

    starter3Title: 'Refactor TypeScript Handler',
    starter3Category: 'TypeScript',
    starter3Desc: 'Optimize Next.js App Router streaming logic and caching.',

    starter4Title: 'Draft Executive Briefing',
    starter4Category: 'Executive',
    starter4Desc: 'Create bilingual board deck summary in Arabic & English with key risks.',

    engineInfo: 'Cintra Core • High Precision Bilingual Engine',
    contextInfo: 'Context: 128k',
    latencyInfo: 'Latency: ~180ms',
    disclaimer: 'Cintra can make mistakes. Verify important info.',
    inputPlaceholder: 'Message Cintra...',
    attachFile: 'Attach file',
    voiceInput: 'Voice input',
    featuresMenu: 'Features and shortcuts',
    modesAndTools: 'Modes & tools',
    promptShortcuts: 'Prompt shortcuts',
    explainStepByStep: 'Explain step by step',
    workedExample: 'Give a worked example',
    createQuizShortcut: 'Create a short quiz',
    generateImage: 'Generate an image',
    generatingImage: 'Generating image...',
    imagePromptPlaceholder: 'Describe the image you want to create...',
    imageGenerationPrivacy: 'Your prompt is sent to the configured image provider. Generated images are saved in this conversation.',
    imageGenerationFailed: 'Image generation failed. Please try again.',
    sendMessage: 'Send message',
    editMessage: 'Edit message',
    saveEdit: 'Save and regenerate',
    cancelEdit: 'Cancel edit',
    historyBeforeEdit: 'Earlier conversation, before this edit',
    expandChat: 'Expand chat width',
    collapseChat: 'Restore chat width',
    stopGenerating: 'Stop generating',
    thinking: 'Thinking...',
    reconnecting: 'Reconnecting...',

    // Auth
    welcomeTitle: 'Welcome to Cintra',
    welcomeTitleAr: 'مرحباً بك في Cintra',
    loginSubtitle: 'Log in to continue to your AI workspace',
    signupSubtitle: 'Create your account to start with Cintra',
    signInTab: 'Sign In',
    createAccountTab: 'Create Account',
    continueWithGoogle: 'Continue with Google',
    continueAsGuest: 'Continue as Guest',
    skipForNow: 'Skip for now',
    orDivider: 'OR',
    fullNameLabel: 'Full name',
    fullNamePlaceholder: 'Nour Al-Sabah',
    emailLabel: 'Email address',
    emailPlaceholder: 'name@example.com',
    passwordLabel: 'Password',
    forgotPasswordLink: 'Forgot password?',
    continueButton: 'Continue',
    createAccountButton: 'Create account',
    dontHaveAccount: "Don't have an account?",
    alreadyHaveAccount: 'Already have an account?',
    signUpAction: 'Sign up',
    signInAction: 'Sign in',
    termsOfService: 'Terms of Service',
    privacyPolicy: 'Privacy Policy',
    security: 'Security',

    // Forgot password & reset
    forgotPasswordTitle: 'Reset your password',
    forgotPasswordDesc: 'Enter your email address and we will send you a reset link.',
    sendResetLink: 'Send reset link',
    backToLogin: 'Back to sign in',
    resetSuccessTitle: 'Reset link sent',
    resetSuccessDesc: 'If an account exists for this email, you can use the link below to set a new password:',

    // User menu & settings
    freePlan: 'Free plan',
    proPlan: 'Pro',
    guestUser: 'Guest User',
    guestBannerText: "You're using Cintra as a guest. Sign up to save your chats and settings.",
    guestBannerCta: 'Sign up',
    guestSettingsNotice: 'You are using a temporary guest session. Sign up to save your preferences, chats, and custom settings.',
    settings: 'Settings',
    upgradeToPro: 'Upgrade to Pro',
    logout: 'Log out',
    accountSettings: 'Account settings',
    generalSettings: 'General',
    personalization: 'Personalization',
    dataControls: 'Data Controls',
    accountTab: 'Account',
    languageSettingLabel: 'Language (اللغة)',
    languageSettingDesc: 'Primary workspace layout orientation and system prompts.',
    autoFollowDevice: 'Auto (Follow device)',
    directionLtr: 'Direction: Left-to-Right',
    directionRtl: 'Direction: Right-to-Left (RTL)',
    defaultModelSetting: 'Default AI Model',
    done: 'Done',
    changesSaveAuto: 'Changes save automatically',
    studyMode: 'Study Mode',
    studyModeOn: 'Study Mode: ON',
    startConversationToShare: 'Start a conversation before sharing it.',
    creditsRemaining: 'Credits remaining: {credits}',
    searchModels: 'Search models...',
    noMatchingModels: 'No matching models found',
    attachFileHelp: 'Attach images or documents (up to 5 files; PDFs up to 50 MB)',
    attachFiles: 'Attach files',
    removeFile: 'Remove {file}',
    uploadingFile: 'Uploading file...',
    uploadSuccess: 'File uploaded successfully.',
    uploadFailed: 'The file could not be uploaded. Please try again.',
    recording: 'Recording...',
    fileSizeIndividual: 'Each file must be 10 MB or smaller (PDFs may be up to 50 MB).',
    fileSizeCombined: 'The combined upload size must be 20 MB or smaller, or 50 MB for PDFs only.',
    longTextConvertedToFile: 'Long pasted text was attached as a TXT file.',
    copyMessage: 'Copy message',
    copyDownload: 'Copy / Download',
    copyText: 'Copy text',
    downloadText: 'Download as text',
    downloadImage: 'Download as image',
    downloadPdf: 'Download as PDF',
    preparingExport: 'Preparing {format}...',
    exportFailed: 'Could not export this response. Please try again.',
    regenerateAnswer: 'Regenerate answer',
    goodResponse: 'Good response',
    badResponse: 'Bad response',
    hideStudyTools: 'Hide study tools',
    showStudyTools: 'Study tools',
    copyDisabled: 'Copy disabled',
    summary: 'Summary',
    keyPoints: 'Key points',
    collapse: 'click to collapse',
    quizMe: 'Quiz Me',
    suggestedReading: 'Suggested reading',
    generatingStudyMaterial: 'Generating {kind}...',
    yourAnswers: 'Your answers',
    writeAnswers: 'Write your answers here...',
    checkAnswers: 'Check my answers',
    notes: 'Notes',
    selectTextToHighlight: 'Select response text to add it to your notes',
    selectSentence: 'Select a sentence in the response to add a study note.',
    yourNote: 'Your note',
    notePlaceholder: 'Important concept / Study for exam',
    saveNote: 'Save note',
    copiedToClipboard: 'Copied to clipboard',
    generatingTextFile: 'Generating text file...',
    fileDownloaded: 'File downloaded: {filename}',
    couldNotLoadStudyMaterials: 'Could not load study materials.',
    couldNotGenerateStudyMaterial: 'Could not generate study material.',
    couldNotSaveStudyNote: 'Could not save study note.',
    theme: 'Theme',
    themeDescription: 'Choose a light, dark, or system-matched appearance.',
    fontSettings: 'Font settings',
    fontSettingsDescription: 'Choose a font, adjust its size, or make text bolder.',
    fontFamilyLabel: 'Font family',
    bayanFont: 'Cintra default',
    systemFont: 'System font',
    fontSizeLabel: 'Font size',
    boldTextLabel: 'Bold text',
    boldTextDescription: 'Increase text weight for easier reading.',
    fontPreview: 'Preview: Cintra makes AI feel clear, natural, and easy to read.',
    accentColorLabel: 'Accent color',
    accentColorDescription: 'Personalize chat bubbles and active controls across Cintra.',
    accentColorSaveFailed: 'Could not save the accent color.',
    chooseColor: 'Choose',
    lightTheme: 'Light',
    darkTheme: 'Dark',
    autoTheme: 'Auto',
    studyModeDescription: 'Get summaries, key points, quizzes, suggested reading, and save notes.',
    studyModeShortcut: 'Switch to Study Mode',
    studyModeExit: 'Exit Study Mode',
    studyWorkspaceTitle: 'Study Mode',
    studyWorkspaceDescription: 'Upload a lesson PDF or ask a question. Cintra will explain step by step, add worked examples and practice questions, and prepare a thorough study guide. Web browsing is not enabled, so live search results are unavailable.',
    languageVariant: 'Language variant',
    languageVariantDescription: 'Set the dialect or spelling for AI responses.',
    defaultVariant: 'Default',
    autoLanguage: 'Auto',
    englishLtr: 'English (LTR)',
    arabicRtl: 'Arabic (RTL)',
    appliedToNewChats: 'Applied across all newly created conversations.',
    formalTone: 'Formal',
    conversationalTone: 'Conversational',
    creativeTone: 'Creative',
    academicTone: 'Academic',
    professionalTone: 'Professional',
    briefLength: 'Brief',
    normalLength: 'Normal',
    detailedLength: 'Detailed',
    simpleStyle: 'Simple',
    technicalStyle: 'Technical',
    poeticStyle: 'Poetic',
    casualStyle: 'Casual',
    saveChanges: 'Save changes',
    saving: 'Saving...',
    changesSaved: 'Changes saved successfully',
    planAndCredits: 'Plan & credits',
    estimatedCreditsPerMessage: 'Estimated credits per message',
    highTierModels: 'High · Cintra Analyst and advanced reasoning',
    mediumTierModels: 'Medium · Cintra Research and Creative',
    lowTierModels: 'Low · Cintra Core v1',
    creditsPerMessage: '{credits} credits',
    creditPriceDisclaimer: 'Prices are estimates. Free-plan messages do not consume credits.',
    exportAllData: 'Export All Data',
    guestExportDisabled: 'Guest chats are temporary. Sign up to enable conversation exports.',
    exportDataDescription: 'Download your profile and conversations as a JSON file.',
    exporting: 'Exporting...',
    exportJson: 'Export JSON',
    exportStudyNotes: 'Export Study Notes',
    studyNotesExportDescription: 'Download saved highlights, summaries, and quiz results as Markdown.',
    exportMarkdown: 'Export Markdown',
    studyNotesExported: 'Study notes exported.',
    studyNotesExportFailed: 'Could not export study notes.',
    couldNotExportConversations: 'Could not export conversations.',
    couldNotLoadConversation: 'Unable to load this conversation.',
    connectionFailedLoadingConversation: 'Could not connect to load this conversation.',
    couldNotSaveModel: 'Could not save the model for this conversation.',
    couldNotRenameConversation: 'Could not rename the conversation.',
    couldNotUpdatePin: 'Could not update the conversation pin.',
    couldNotDeleteConversation: 'Could not delete the conversation.',
    couldNotCreateShareLink: 'Could not create a share link.',
    cancel: 'Cancel',
    deleteConversationConfirmation: 'Delete this conversation permanently?',
    uploadingConversations: 'Loading conversations',
    loadingConversation: 'Loading conversation',
    generating: 'Generating...',
    voiceRecognitionFailed: 'Voice recognition failed. Check microphone permission and try again.',
    voiceUnsupported: 'Voice input is not supported in your browser.',
    accountType: 'Account Type',
    temporaryGuestSession: 'Temporary Guest Session',
    registeredUser: 'Registered User',
    email: 'Email',
    plan: 'Plan',
    creditBalance: 'Credit balance',
    createPermanentAccount: 'Create Permanent Account',
    languageVariants: 'Language variants',
    copyDisabledInStudyMode: 'Copy is disabled in Study Mode',
    themeGeneral: 'Theme',
    studyModeStatusOn: 'Study Mode: ON',
    studyModeStatusOff: 'Study Mode: OFF',
    lowTier: 'Low',
    mediumTier: 'Medium',
    highTier: 'High',
    freePlanName: 'Free plan',
    proPlanName: 'Pro plan',
    couldNotUpgrade: 'Pro upgrades will be available in a future phase.',
    settingsThemeSaved: 'Theme saved.',
    studyModeSaveFailed: 'Could not save the Study Mode setting.',
    about: 'About Cintra',
    conversationLoading: 'Loading conversation...',
    loadingChats: 'Loading conversations...',
    emptySearch: 'No conversations found',
    modelCostTooltip: 'This model costs about {credits} credits per message.',
    uploadPercent: 'Uploading {progress}%',
    removeAttachment: 'Remove attachment {file}',
    closeSidebar: 'Close sidebar',
    deleteConfirm: 'Delete this conversation permanently?',
    shareLinkUnavailable: 'Start a conversation before sharing it.',
    toastError: 'Something went wrong. Please try again.',
    studyTools: 'Study tools',
    copyCode: 'Copy code',
    noConversationShare: 'There is no conversation to share yet.',
    credits: 'Credits',
    user: 'User',
    noModelsAvailable: 'No matching models found',
    languageEnglishName: 'English',
    languageArabicName: 'Arabic',
    englishOption: 'English',
    arabicOption: 'Arabic',
    aboutBack: 'Back to Cintra',
    aboutWorkspaceTagline: 'A thoughtful AI workspace',
    aboutTitle: 'About Cintra',
    aboutTagline: 'AI conversations, your way. Built by engineers, for everyone.',
    aboutStartChatting: 'Start chatting now',
    aboutMission: 'Our mission',
    aboutMissionTitle: 'Make AI feel more human',
    aboutMissionText: 'Cintra is a bilingual AI workspace for conversation, research, image creation, and document analysis. It helps people think, learn, and create in the language and style that feels natural to them.',
    aboutBuiltBy: 'Built by',
    aboutDeveloperBio: 'Full-Stack Developer | Computer Science & IT Student at EELU | AI Enthusiast',
    aboutProfileNotice: 'The profile image and contact links will be completed after their details are verified.',
    featureChat: 'Thoughtful chat',
    featureChatDescription: 'A clear, streaming chat experience for everyday questions and focused work.',
    featureModels: 'Model choice',
    featureModelsDescription: 'Choose the model that fits your task.',
    featurePrivacy: 'Privacy-minded',
    featurePrivacyDescription: 'Private conversations stay scoped to your account, with secure session cookies.',
    featureFlexible: 'Fast and flexible',
    featureFlexibleDescription: 'Tune tone, writing style, response length, and language variant.',
    aboutFooterCopyright: '© {year} Cintra. All rights reserved.',
    grade: 'Grading',
    resources: 'Resources',
    quiz: 'Quiz',
    tone: 'Tone',
    responseLength: 'Response length',
    writingStyle: 'Writing style',
    customInstructions: 'Custom Instructions',
    customInstructionsDescription: 'What would you like Cintra to know about you to provide better responses?',
    customInstructionsPlaceholder: 'e.g. Always respond in fluent English, adopt an academic tone...',
    saveInstructions: 'Save Instructions',
    settingsHeaderPlan: 'Plan & credits',
    planLabel: 'Plan',
    creditsLabel: 'Credit balance',
    loadingConversationsAria: 'Loading conversations',
    proUpgradeUnavailable: 'Pro upgrades will be available in a future phase.',
    conversationCount: '{count} conversations',
    profileSaveFailed: 'Could not save changes.',
    exportSuccess: 'Export complete.',
    aboutBuiltWith: 'Built with',
    privacy: 'Privacy',
    terms: 'Terms',
    contact: 'Contact',
    close: 'Close',
  },
  ar: {
    ...arAdditional,
    // Brand
    brandName: 'Cintra',
    brandNameAr: 'Cintra',
    tagline: 'مساحة عمل الذكاء الاصطناعي',

    // Top bar & actions
    share: 'مشاركة',
    modelSelector: 'النموذج',
    newChat: 'محادثة جديدة',
    searchChats: 'بحث في المحادثات...',
    noChatsFound: 'لا توجد محادثات مطابقة',
    renameConversation: 'إعادة التسمية',
    pinConversation: 'تثبيت',
    unpinConversation: 'إلغاء التثبيت',
    deleteConversation: 'حذف',
    cancel: 'إلغاء',
    pinned: 'مثبتة',
    toggleSidebar: 'إظهار أو إخفاء القائمة',
    aboutBayan: 'عن Cintra',
    thinkingMode: 'تفعيل وضع التفكير',
    thinkingModeDescription: 'استخدم إجابة أكثر تعمقاً للأسئلة المعقدة.',
    typing: 'جارٍ إعداد الإجابة...',

    // Sidebar groups
    today: 'اليوم',
    yesterday: 'أمس',
    previous7Days: 'آخر 7 أيام',
    older: 'أقدم',
    noConversationsYet: 'لا توجد محادثات بعد',
    startNewChatPrompt: 'ابدأ بالكتابة في الأسفل لبدء أول محادثة لك.',

    // Empty state
    greetingTitle: 'كيف يمكنني مساعدتك اليوم؟',
    greetingTitleNamed: 'كيف يمكنني مساعدتك اليوم، {name}؟',
    emptyStateDescription: 'اسأل عمّا تريد، استكشف فكرة، أو ابدأ بأحد الاقتراحات.',
    chipBilingual: 'الترجمة والتوليد ثنائي اللغة',
    chipPoetics: 'علم العروض وبحور الشعر',
    chipCode: 'البرمجة وهندسة النظم',
    chipFinance: 'التدقيق المالي والميزانيات',

    // Starters
    starter1Title: 'تحليل أوزان وبحور الشعر العربي',
    starter1Category: 'العروض',
    starter1Desc: 'شرح بحر الطويل مع شواهد تراثية وتقطيع عروضي تفصيلي.',

    starter2Title: 'تلخيص التقرير المالي الختامي',
    starter2Category: 'المالية',
    starter2Desc: 'استخراج المؤشرات المالية ومطابقة قائمة التدفقات النقدية والميزانية.',

    starter3Title: 'تحسين بنية معالج TypeScript',
    starter3Category: 'TypeScript',
    starter3Desc: 'تحسين تدفق الاستجابات اللحظية ومعالجة الحالات الحدية.',

    starter4Title: 'صياغة إحاطة تنفيذية ثنائية اللغة',
    starter4Category: 'تنفيذي',
    starter4Desc: 'إعداد ملخص استراتيجي لمجلس الإدارة باللغتين العربية والإنجليزية.',

    engineInfo: 'محرك Cintra Core • ذكاء اصطناعي دقيق ثنائي اللغة',
    contextInfo: 'سياق: 128 ألف رمز',
    latencyInfo: 'الاستجابة: ~180 مللي ثانية',
    disclaimer: 'قد يقع Cintra في بعض الأخطاء. يُرجى التحقق من المعلومات المهمة.',
    inputPlaceholder: 'اكتب رسالة لـ Cintra...',
    attachFile: 'إرفاق ملف',
    attachFiles: 'إرفاق الملفات',
    removeFile: 'إزالة {file}',
    uploadingFile: 'جاري رفع الملف...',
    uploadSuccess: 'تم رفع الملف بنجاح.',
    uploadFailed: 'تعذر رفع الملف، حاول مرة أخرى.',
    voiceInput: 'إدخال صوتي',
    sendMessage: 'إرسال الرسالة',
    editMessage: 'تعديل الرسالة',
    saveEdit: 'حفظ التعديل وإعادة الرد',
    cancelEdit: 'إلغاء التعديل',
    historyBeforeEdit: 'محادثة سابقة لهذا التعديل',
    expandChat: 'توسيع عرض المحادثة',
    collapseChat: 'استعادة عرض المحادثة',
    stopGenerating: 'إيقاف التوليد',
    thinking: 'جارٍ التفكير...',
    reconnecting: 'جارٍ إعادة الاتصال...',

    // Auth
    welcomeTitle: 'مرحباً بك في Cintra',
    welcomeTitleAr: 'مرحباً بك في Cintra',
    loginSubtitle: 'سجّل الدخول للمتابعة إلى مساحة عملك الذكية',
    signupSubtitle: 'أنشئ حسابك الجديد للبدء مع Cintra',
    signInTab: 'تسجيل الدخول',
    createAccountTab: 'حساب جديد',
    continueWithGoogle: 'المتابعة باستخدام Google',
    continueAsGuest: 'المتابعة كضيف',
    skipForNow: 'تخطي الآن',
    orDivider: 'أو',
    fullNameLabel: 'الاسم الكامل',
    fullNamePlaceholder: 'نور الصباح',
    emailLabel: 'البريد الإلكتروني',
    emailPlaceholder: 'name@example.com',
    passwordLabel: 'كلمة المرور',
    forgotPasswordLink: 'نسيت كلمة المرور؟',
    continueButton: 'متابعة',
    createAccountButton: 'إنشاء الحساب',
    dontHaveAccount: 'ليس لديك حساب؟',
    alreadyHaveAccount: 'لديك حساب بالفعل؟',
    signUpAction: 'إنشاء حساب',
    signInAction: 'تسجيل الدخول',
    termsOfService: 'شروط الخدمة',
    privacyPolicy: 'سياسة الخصوصية',
    security: 'الأمان',

    // Forgot password & reset
    forgotPasswordTitle: 'استعادة كلمة المرور',
    forgotPasswordDesc: 'أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين.',
    sendResetLink: 'إرسال الرابط',
    backToLogin: 'العودة لتسجيل الدخول',
    resetSuccessTitle: 'تم إرسال رابط التعيين',
    resetSuccessDesc: 'إذا كان هناك حساب مسجل، استخدم الرابط أدناه لتعيين كلمة مرور جديدة:',

    // User menu & settings
    freePlan: 'الخطة المجانية',
    proPlan: 'الخطة الاحترافية (Pro)',
    guestUser: 'مستخدم ضيف',
    guestBannerText: 'أنت تستخدم Cintra كضيف. أنشئ حساباً لحفظ محادثاتك وإعداداتك.',
    guestBannerCta: 'إنشاء حساب',
    guestSettingsNotice: 'أنت تستخدم جلسة ضيف مؤقتة. أنشئ حساباً لحفظ تفضيلاتك ومحادثاتك وتخصيص الإعدادات.',
    settings: 'الإعدادات',
    upgradeToPro: 'الترقية إلى الخطة الاحترافية',
    logout: 'تسجيل الخروج',
    accountSettings: 'إعدادات الحساب',
    generalSettings: 'عام',
    personalization: 'التخصيص والتعليمات',
    dataControls: 'التحكم في البيانات',
    accountTab: 'الحساب',
    languageSettingLabel: 'اللغة',
    languageSettingDesc: 'اتجاه واجهة مساحة العمل واللغة التلقائية للرسائل.',
    autoFollowDevice: 'تلقائي (حسب لغة الجهاز)',
    directionLtr: 'الاتجاه: من اليسار إلى اليمين',
    directionRtl: 'الاتجاه: من اليمين إلى اليسار',
    defaultModelSetting: 'نموذج الذكاء الاصطناعي الافتراضي',
    done: 'تم',
    changesSaveAuto: 'تُحفظ التغييرات تلقائياً',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<LanguageMode>(() => {
    const saved = localStorage.getItem('bayan_language_mode');
    if (saved === 'ar' || saved === 'en' || saved === 'auto') return saved;
    return 'auto';
  });

  // Calculate actual active language
  const resolveActiveLanguage = (currentMode: LanguageMode): ActiveLanguage => {
    if (currentMode === 'ar') return 'ar';
    if (currentMode === 'en') return 'en';

    // Auto detection from browser
    if (typeof window !== 'undefined' && window.navigator) {
      const navLang = (window.navigator.language || '').toLowerCase();
      if (navLang.startsWith('ar')) return 'ar';
    }
    return 'en';
  };

  const [currentLang, setCurrentLang] = useState<ActiveLanguage>(() => resolveActiveLanguage(mode));

  const setLanguageMode = (newMode: LanguageMode) => {
    setModeState(newMode);
    localStorage.setItem('bayan_language_mode', newMode);
    const resolved = resolveActiveLanguage(newMode);
    setCurrentLang(resolved);
  };

  // Sync document dir and lang attributes
  useEffect(() => {
    const resolved = resolveActiveLanguage(mode);
    setCurrentLang(resolved);
    const isRtl = resolved === 'ar';

    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = resolved;
  }, [mode]);

  const isRtl = currentLang === 'ar';

  const t = (key: string, params?: Record<string, string | number>): string => {
    let str = translations[currentLang]?.[key] || translations.en[key] || key;
    if (params) {
      for (const [pKey, pVal] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${pKey}\\}`, 'g'), String(pVal));
      }
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ mode, currentLang, isRtl, setLanguageMode, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
