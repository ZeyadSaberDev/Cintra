import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Facebook,
  Globe2,
  Github,
  Layers3,
  Lightbulb,
  Menu,
  MessageSquareText,
  Moon,
  PenLine,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

type AboutLanguage = 'ar' | 'en';

const content = {
  ar: {
    home: 'الرئيسية',
    featuresNav: 'المميزات',
    aboutNav: 'عن Cintra',
    developerNav: 'المطور',
    start: 'ابدأ الآن',
    discover: 'اكتشف Cintra',
    eyebrow: 'مساحة واحدة، خيارات أوسع',
    heroTitle: 'الذكاء الاصطناعي، كما يجب أن يكون.',
    heroText: 'منصة ذكية تجمع المحادثة والبحث والإبداع وتحليل المستندات في مساحة واحدة، مصممة لتكون سريعة ومريحة للمستخدم العربي.',
    powered: 'أربع قدرات ذكية في مساحة واحدة',
    viewFeatures: 'تعرّف على المميزات',
    why: 'لماذا Cintra؟',
    whyText: 'Cintra ليست مجرد نافذة للمحادثة؛ إنها مساحة متكاملة للمحادثة والبحث والإبداع وتحليل المستندات.',
    speed: 'السرعة',
    speedText: 'استجابة سريعة وتجربة محادثة مصممة لتقليل الانتظار.',
    models: 'قدرات متخصصة',
    modelsText: 'اختر من أربع قدرات Cintra المصممة لأنواع مختلفة من المهام.',
    flexibility: 'المرونة',
    flexibilityText: 'اختر النموذج المناسب لمهمتك وخصّص تجربة استخدامك.',
    arabicFirst: 'العربية أولًا',
    arabicFirstText: 'دعم RTL وتجربة عربية طبيعية وواضحة.',
    chatExperience: 'تجربة محادثة حديثة',
    chatExperienceText: 'تدفق مباشر، Markdown، كتل كود، نسخ، إعادة المحاولة وأدوات للردود.',
    security: 'الأمان',
    securityText: 'بنية تعتمد على المصادقة والصلاحيات وإدارة آمنة للاتصالات.',
    strength: 'قوة Cintra',
    strengthTitle: 'قدرات Cintra في مكان واحد',
    strengthText: 'اختر القدرة الملائمة لمهمتك ضمن تجربة عربية واضحة وسهلة.',
    multipleModels: 'أربع قدرات متخصصة',
    oneWorkspace: 'Cintra',
    workspaceTypes: ['المحادثة', 'البرمجة', 'التعلّم', 'الإنتاجية'],
    capabilitiesNote: 'تختلف القدرات المتاحة بحسب النموذج والإعدادات المفعّلة.',
    useCases: 'استخدامات Cintra',
    useCasesTitle: 'ماذا يمكنك أن تفعل مع Cintra؟',
    learning: 'التعلّم',
    learningText: 'شرح المفاهيم، تلخيص المعلومات، والمساعدة في الدراسة.',
    coding: 'البرمجة',
    codingText: 'كتابة الكود، تحليل الأخطاء، وشرح الحلول.',
    writing: 'الكتابة',
    writingText: 'صياغة النصوص، إعادة الكتابة، والتلخيص.',
    analysis: 'التفكير والتحليل',
    analysisText: 'تحليل الأفكار والمعلومات ومساعدتك في الوصول إلى حلول.',
    productivity: 'الإنتاجية',
    productivityText: 'تنظيم الأفكار والمعلومات والمهام.',
    contentWork: 'العمل مع المحتوى',
    contentWorkText: 'استخدم الرؤية أو الأدوات عندما يدعمها النموذج المختار.',
    selectedModelNote: 'قد تختلف إتاحة هذه القدرات من نموذج إلى آخر.',
    modelChoice: 'نماذج Cintra',
    modelChoiceTitle: 'أربع قدرات، لاختيار أبسط',
    modelChoiceText: 'اختر Cintra Core للمحادثة والبرمجة، أو Research للبحث، أو Creative للصور، أو Analyst للملفات والمستندات.',
    modelGeneral: 'Core · محادثة وبرمجة',
    modelReasoning: 'Research · بحث ويب',
    modelCoding: 'Analyst · مستندات',
    modelVision: 'Creative · صور',
    modelWriting: 'Analyst · ملفات وPDF',
    modelFootnote: 'تعمل هذه الأسماء كقدرات Cintra وتستخدم الاتصالات المهيأة داخلياً.',
    arabicSection: 'تجربة عربية حقيقية',
    arabicTitle: 'مصممة للمستخدم العربي',
    arabicText: 'من اتجاه الصفحة إلى طريقة عرض المحادثة، صُممت Cintra لتجعل التعامل مع الذكاء الاصطناعي باللغة العربية تجربة طبيعية.',
    rtlFeature: 'اتجاه RTL',
    clearInterface: 'واجهة واضحة',
    comfortableReading: 'قراءة وكتابة مريحة',
    mobileSupport: 'دعم الهاتف',
    darkLight: 'الوضع الداكن والفاتح',
    developer: 'وراء Cintra',
    developerTitle: 'صُنعت Cintra بشغف بالتقنية',
    developerText: 'مشروع شخصي أعتني فيه بتجربة الاستخدام العربية، والتفاصيل التي تجمع بين التقنية والتصميم وتجعل المنتج قابلًا للتطوير.',
    developerQuestion: 'كيف يمكن أن نجعل الذكاء الاصطناعي أكثر قربًا ووضوحًا للمستخدم العربي؟',
    developerName: 'زياد صابر',
    developerRole: 'مهندس برمجيات ومطوّر Full-Stack',
    developerImageAlt: 'صورة زياد صابر',
    githubProfile: 'حساب زياد على GitHub',
    facebookProfile: 'حساب زياد على Facebook',
    developerQuote: 'بنيت Cintra لأصنع تجربة أستخدمها أنا أولًا، ثم أجعلها مفيدة لأي شخص يريد أن يتعلم، يعمل، يبرمج، أو يستكشف إمكانيات الذكاء الاصطناعي.',
    slogans: 'عبارات Cintra',
    sloganOptions: ['قوة نماذج متعددة، في تجربة واحدة.', 'ذكاء يفهمك.', 'فكّر. تعلّم. أنجز.', 'مساحتك الذكية.', 'نموذجك، مهمتك، طريقتك.', 'أكثر من مجرد محادثة.', 'ذكاء أقرب إليك.'],
    finalTitle: 'جاهز لتجربة Cintra؟',
    finalText: 'ابدأ محادثتك الأولى واكتشف كيف يمكن للذكاء الاصطناعي أن يعمل بالطريقة التي تناسبك.',
    footer: 'Cintra — مساحة ذكية للمحادثة والبحث والإبداع.',
    privacy: 'الخصوصية',
    terms: 'الشروط',
    contact: 'تواصل',
    language: 'اللغة',
    openMenu: 'فتح القائمة',
    closeMenu: 'إغلاق القائمة',
    themeLight: 'تفعيل الوضع الفاتح',
    themeDark: 'تفعيل الوضع الداكن',
    menu: 'القائمة الرئيسية',
  },
  en: {
    home: 'Home',
    featuresNav: 'Features',
    aboutNav: 'About Cintra',
    developerNav: 'Developer',
    start: 'Get started',
    discover: 'Discover Cintra',
    eyebrow: 'One workspace, more choice',
    heroTitle: 'AI, as it should be.',
    heroText: 'A focused AI workspace for conversation, research, image creation, and document analysis—designed for clear, productive work.',
    powered: 'Four focused Cintra capabilities',
    viewFeatures: 'Explore the features',
    why: 'Why Cintra?',
    whyText: 'Cintra is more than a chat window. It brings conversation, research, creativity, and document analysis into one workspace.',
    speed: 'Speed',
    speedText: 'Responsive conversations designed to keep waiting to a minimum.',
    models: 'Focused capabilities',
    modelsText: 'Choose one of four Cintra capabilities that fits your task.',
    flexibility: 'Flexibility',
    flexibilityText: 'Choose the model that fits your task and personalize your experience.',
    arabicFirst: 'Arabic first',
    arabicFirstText: 'RTL support and a clear, natural Arabic experience.',
    chatExperience: 'Modern chat',
    chatExperienceText: 'Streaming, Markdown, code blocks, copy, retry, and response tools.',
    security: 'Security',
    securityText: 'An architecture built around authentication, permissions, and secure connection management.',
    strength: 'The Cintra experience',
    strengthTitle: 'Cintra capabilities, in one place',
    strengthText: 'Choose the capability that fits your task in a clear, bilingual workspace.',
    multipleModels: 'Four focused capabilities',
    oneWorkspace: 'Cintra',
    workspaceTypes: ['Chat', 'Coding', 'Learning', 'Productivity'],
    capabilitiesNote: 'Available capabilities vary by model and enabled settings.',
    useCases: 'Use cases',
    useCasesTitle: 'What can you do with Cintra?',
    learning: 'Learning',
    learningText: 'Explore concepts, summarize information, and get study support.',
    coding: 'Coding',
    codingText: 'Write code, analyze errors, and understand solutions.',
    writing: 'Writing',
    writingText: 'Draft, rewrite, and summarize text.',
    analysis: 'Thinking and analysis',
    analysisText: 'Examine ideas and information as you work toward solutions.',
    productivity: 'Productivity',
    productivityText: 'Organize ideas, information, and tasks.',
    contentWork: 'Working with content',
    contentWorkText: 'Use vision or tools when supported by the selected model.',
    selectedModelNote: 'Availability can differ from one model to another.',
    modelChoice: 'Cintra models',
    modelChoiceTitle: 'Four capabilities, one simple choice',
    modelChoiceText: 'Choose Core for chat and coding, Research for web research, Creative for images, or Analyst for files and documents.',
    modelGeneral: 'Core · Chat and coding',
    modelReasoning: 'Research · Web research',
    modelCoding: 'Analyst · Documents',
    modelVision: 'Creative · Images',
    modelWriting: 'Analyst · Files and PDF',
    modelFootnote: 'These Cintra names represent focused capabilities routed through the configured services.',
    arabicSection: 'An Arabic-first experience',
    arabicTitle: 'Designed with Arabic speakers in mind',
    arabicText: 'From page direction to conversation layout, Cintra aims to make using AI in Arabic feel natural and clear.',
    rtlFeature: 'RTL direction',
    clearInterface: 'Clear interface',
    comfortableReading: 'Comfortable reading and writing',
    mobileSupport: 'Mobile support',
    darkLight: 'Dark and light themes',
    developer: 'Behind Cintra',
    developerTitle: 'Cintra was built with a passion for technology',
    developerText: 'A personal project focused on an approachable Arabic experience and the details that bring technology and design together in a product built to grow.',
    developerQuestion: 'How can AI feel closer and clearer for Arabic speakers?',
    developerName: 'Zeyad Saber',
    developerRole: 'Software Engineer · Full-Stack Developer',
    developerImageAlt: 'Portrait of Zeyad Saber',
    githubProfile: 'Zeyad’s GitHub profile',
    facebookProfile: 'Zeyad’s Facebook profile',
    developerQuote: 'I built Cintra to create an experience I would use myself first, then make it useful for anyone who wants to learn, work, code, or explore what AI can do.',
    slogans: 'Cintra phrases',
    sloganOptions: ['Multiple models, one experience.', 'Intelligence that understands you.', 'Think. Learn. Get things done.', 'Your intelligent workspace.', 'Your model, your task, your way.', 'More than a conversation.', 'Intelligence, closer to you.'],
    finalTitle: 'Ready to try Cintra?',
    finalText: 'Start your first conversation and discover how AI can work in a way that suits you.',
    footer: 'Cintra — an AI workspace for conversation, research, and creation.',
    privacy: 'Privacy',
    terms: 'Terms',
    contact: 'Contact',
    language: 'Language',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    themeLight: 'Switch to light mode',
    themeDark: 'Switch to dark mode',
    menu: 'Main navigation',
  },
} as const;

const features = [
  { icon: Zap, title: 'speed', text: 'speedText' },
  { icon: Layers3, title: 'models', text: 'modelsText' },
  { icon: WandSparkles, title: 'flexibility', text: 'flexibilityText' },
  { icon: Globe2, title: 'arabicFirst', text: 'arabicFirstText' },
  { icon: MessageSquareText, title: 'chatExperience', text: 'chatExperienceText' },
  { icon: ShieldCheck, title: 'security', text: 'securityText' },
] as const;

const useCases = [
  { icon: BookOpen, title: 'learning', text: 'learningText' },
  { icon: Braces, title: 'coding', text: 'codingText' },
  { icon: PenLine, title: 'writing', text: 'writingText' },
  { icon: Lightbulb, title: 'analysis', text: 'analysisText' },
  { icon: Target, title: 'productivity', text: 'productivityText' },
  { icon: Sparkles, title: 'contentWork', text: 'contentWorkText' },
] as const;

const modelTaskTypes = [
  { icon: Sparkles, key: 'modelGeneral' },
  { icon: Lightbulb, key: 'modelReasoning' },
  { icon: Braces, key: 'modelCoding' },
  { icon: Globe2, key: 'modelVision' },
  { icon: PenLine, key: 'modelWriting' },
] as const;

export function AboutPage() {
  const { currentLang, setLanguageMode } = useLanguage();
  const language: AboutLanguage = currentLang === 'ar' ? 'ar' : 'en';
  const copy = content[language];
  const isArabic = language === 'ar';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => (
    document.documentElement.dataset.theme === 'dark'
    || (document.documentElement.dataset.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ));

  useEffect(() => {
    const title = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    const twitterTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]');
    const previousDescription = description?.content;
    const previousOgTitle = ogTitle?.content;
    const previousOgDescription = ogDescription?.content;
    const previousTwitterTitle = twitterTitle?.content;
    const previousTwitterDescription = twitterDescription?.content;
    document.title = isArabic
      ? 'Cintra — ذكاء اصطناعي يفهمك.'
      : 'Cintra — AI, as it should be.';
    if (description) description.content = isArabic
      ? 'Cintra مساعد ذكاء اصطناعي متقدم للمحادثة والبحث والإبداع وتحليل المستندات.'
      : 'Cintra is an AI workspace for conversation, research, image creation, and document analysis.';
    if (ogTitle) ogTitle.content = document.title;
    if (ogDescription && description) ogDescription.content = description.content;
    if (twitterTitle) twitterTitle.content = document.title;
    if (twitterDescription && description) twitterDescription.content = description.content;
    return () => {
      document.title = title;
      if (description && previousDescription !== undefined) description.content = previousDescription;
      if (ogTitle && previousOgTitle !== undefined) ogTitle.content = previousOgTitle;
      if (ogDescription && previousOgDescription !== undefined) ogDescription.content = previousOgDescription;
      if (twitterTitle && previousTwitterTitle !== undefined) twitterTitle.content = previousTwitterTitle;
      if (twitterDescription && previousTwitterDescription !== undefined) twitterDescription.content = previousTwitterDescription;
    };
  }, [isArabic]);

  useEffect(() => {
    const updateTheme = () => {
      const theme = document.documentElement.dataset.theme;
      setDarkMode(theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches));
    };
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.about-reveal').forEach((element) => element.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.about-reveal').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [language]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  const toggleLanguage = () => setLanguageMode(isArabic ? 'en' : 'ar');
  const toggleTheme = () => {
    const next = darkMode ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('bayan_theme', next);
    setDarkMode(!darkMode);
  };
  const closeMenu = () => setMobileMenuOpen(false);

  const navLinks = [
    { href: '#top', label: copy.home },
    { href: '#features', label: copy.featuresNav },
    { href: '#about', label: copy.aboutNav },
    { href: '#developer', label: copy.developerNav },
  ];

  return (
    <main className="about-page" dir={isArabic ? 'rtl' : 'ltr'} lang={language}>
      <header className="about-header">
        <a href="#top" className="about-brand" aria-label="Cintra">
          <span className="about-brand-mark"><img src="/cintra-icon.svg" alt="" aria-hidden="true" /></span>
          <span>Cintra</span>
        </a>
        <nav className="about-desktop-nav" aria-label={copy.menu}>
          {navLinks.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className="about-header-actions">
          <button type="button" className="about-icon-button about-theme-button" onClick={toggleTheme} aria-label={darkMode ? copy.themeLight : copy.themeDark} title={darkMode ? copy.themeLight : copy.themeDark}>
            {darkMode ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button type="button" className="about-language-button" onClick={toggleLanguage} aria-label={copy.language}>
            {isArabic ? 'English' : 'العربية'}
          </button>
          <a href="/" className="about-button about-button-primary about-nav-cta">{copy.start}<ArrowUpRight size={15} /></a>
          <button type="button" className="about-icon-button about-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={mobileMenuOpen ? copy.closeMenu : copy.openMenu} aria-expanded={mobileMenuOpen} aria-controls="about-mobile-nav">
            {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav id="about-mobile-nav" className="about-mobile-nav" aria-label={copy.menu}>
            {navLinks.map((link) => <a key={link.href} href={link.href} onClick={closeMenu}>{link.label}</a>)}
            <a href="/" className="about-button about-button-primary" onClick={closeMenu}>{copy.start}<ArrowUpRight size={15} /></a>
          </nav>
        )}
      </header>

      <section id="top" className="about-hero">
        <div className="about-hero-copy">
          <div className="about-eyebrow"><Sparkles size={14} />{copy.eyebrow}</div>
          <h1>{copy.heroTitle}</h1>
          <p className="about-hero-description">{copy.heroText}</p>
          <div className="about-hero-actions">
            <a href="/" className="about-button about-button-primary">{copy.start}{isArabic ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</a>
            <a href="#features" className="about-button about-button-secondary">{copy.discover}<ArrowDown size={15} /></a>
          </div>
          <p className="about-powered"><span aria-hidden="true" />{copy.powered}</p>
        </div>
        <div className="about-hero-visual" aria-hidden="true">
          <div className="about-visual-topline"><span className="about-live-dot" />BAYAN AI <span className="about-visual-dots">···</span></div>
          <div className="about-visual-prompt">{isArabic ? 'كيف يمكنني مساعدتك اليوم؟' : 'How can I help you today?'}</div>
          <div className="about-visual-answer">
            <span className="about-visual-avatar">ب</span>
            <div><span className="about-visual-label">Cintra</span><span className="about-visual-line line-wide" /><span className="about-visual-line line-medium" /><span className="about-visual-line line-short" /></div>
          </div>
          <div className="about-visual-models"><Layers3 size={15} /><span>{isArabic ? 'اختر النموذج المناسب' : 'Choose a model for the task'}</span><ChevronDown size={14} /></div>
          <div className="about-visual-compose"><span>{isArabic ? 'اكتب رسالتك...' : 'Write a message...'}</span><span className="about-visual-send"><ArrowUpRight size={15} /></span></div>
        </div>
      </section>

      <section id="features" className="about-section about-reveal">
        <div className="about-section-heading">
          <p className="about-kicker">{copy.why}</p>
          <h2>{copy.why}</h2>
          <p>{copy.whyText}</p>
        </div>
        <div className="about-feature-grid">
          {features.map(({ icon: Icon, title, text }) => (
            <article className="about-feature" key={title}>
              <span className="about-feature-icon"><Icon size={19} strokeWidth={1.8} /></span>
              <h3>{copy[title]}</h3>
              <p>{copy[text]}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="about" className="about-strength about-reveal">
        <div className="about-section-heading">
          <p className="about-kicker">{copy.strength}</p>
          <h2>{copy.strengthTitle}</h2>
          <p>{copy.strengthText}</p>
        </div>
        <div className="about-flow" aria-label={isArabic ? 'Cintra، ثم القدرات والاستخدامات' : 'Cintra capabilities and use cases'}>
          <div className="about-flow-primary"><span className="about-brand-mark"><img src="/cintra-icon.svg" alt="" aria-hidden="true" /></span><strong>{copy.oneWorkspace}</strong></div>
          <div className="about-flow-connector" aria-hidden="true"><span /></div>
          <div className="about-flow-node"><span>{copy.multipleModels}</span><div className="about-model-symbols"><i /><i /><i /><i /></div></div>
          <div className="about-flow-connector" aria-hidden="true"><span /></div>
          <div className="about-flow-uses">{copy.workspaceTypes.map((type) => <span key={type}>{type}</span>)}</div>
        </div>
        <p className="about-note"><Check size={14} />{copy.capabilitiesNote}</p>
      </section>

      <section className="about-section about-reveal">
        <div className="about-section-heading">
          <p className="about-kicker">{copy.useCases}</p>
          <h2>{copy.useCasesTitle}</h2>
        </div>
        <div className="about-feature-grid about-usecase-grid">
          {useCases.map(({ icon: Icon, title, text }) => (
            <article className="about-feature" key={title}>
              <span className="about-feature-icon"><Icon size={19} strokeWidth={1.8} /></span>
              <h3>{copy[title]}</h3>
              <p>{copy[text]}</p>
            </article>
          ))}
        </div>
        <p className="about-note"><Check size={14} />{copy.selectedModelNote}</p>
      </section>

      <section className="about-model-choice about-reveal">
        <div className="about-model-copy">
          <p className="about-kicker">{copy.modelChoice}</p>
          <h2>{copy.modelChoiceTitle}</h2>
          <p>{copy.modelChoiceText}</p>
        </div>
        <div className="about-task-list">
          {modelTaskTypes.map(({ icon: Icon, key }) => (
            <div className="about-task-item" key={key}><span><Icon size={17} /></span><span>{copy[key]}</span><ArrowUpLeft size={15} className="about-task-arrow" /></div>
          ))}
          <p>{copy.modelFootnote}</p>
        </div>
      </section>

      <section className="about-arabic about-reveal">
        <div className="about-arabic-visual" aria-hidden="true">
          <span className="about-arabic-mark">ب</span>
          <span className="about-arabic-orbit orbit-one" />
          <span className="about-arabic-orbit orbit-two" />
          <span className="about-arabic-ltr">RTL · LTR</span>
        </div>
        <div className="about-arabic-copy">
          <p className="about-kicker">{copy.arabicSection}</p>
          <h2>{copy.arabicTitle}</h2>
          <p>{copy.arabicText}</p>
          <div className="about-pills">
            {[copy.rtlFeature, copy.clearInterface, copy.comfortableReading, copy.mobileSupport, copy.darkLight].map((feature) => <span key={feature}>{feature}</span>)}
          </div>
        </div>
      </section>

      <section id="developer" className="about-developer about-reveal">
        <div className="about-developer-intro">
          <p className="about-kicker">{copy.developer}</p>
          <h2>{copy.developerTitle}</h2>
          <p>{copy.developerText}</p>
        </div>
        <div className="about-developer-card">
          <img className="about-developer-image" src="/developer-zeyad.jpeg" alt={copy.developerImageAlt} />
          <div className="about-developer-details">
            <p className="about-developer-label">{copy.developer}</p>
            <h3>{copy.developerName}</h3>
            <p className="about-developer-role">{copy.developerRole}</p>
            <p className="about-developer-question">{copy.developerQuestion}</p>
            <div className="about-developer-socials">
              <a href="https://github.com/ZeyadSaberDev" target="_blank" rel="noreferrer" aria-label={copy.githubProfile}>
                <Github size={15} aria-hidden="true" />
                <span>GitHub</span>
              </a>
              <a href="https://www.facebook.com/share/1DLfgQjN7o/" target="_blank" rel="noreferrer" aria-label={copy.facebookProfile}>
                <Facebook size={15} aria-hidden="true" />
                <span>Facebook</span>
              </a>
            </div>
          </div>
        </div>
        <blockquote className="about-quote">
          <span aria-hidden="true">“</span>
          <p>{copy.developerQuote}</p>
          <footer>— {copy.developerName}</footer>
        </blockquote>
      </section>

      <details className="about-slogans">
        <summary>{copy.slogans}<ChevronDown size={15} /></summary>
        <ul>{copy.sloganOptions.map((slogan) => <li key={slogan}>{slogan}</li>)}</ul>
      </details>

      <section className="about-final-cta about-reveal">
        <span className="about-final-icon"><Sparkles size={20} /></span>
        <h2>{copy.finalTitle}</h2>
        <p>{copy.finalText}</p>
        <a href="/" className="about-button about-button-primary">{copy.start}{isArabic ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}</a>
      </section>

      <footer className="about-footer">
        <a href="#top" className="about-brand"><span className="about-brand-mark"><img src="/cintra-icon.svg" alt="" aria-hidden="true" /></span><span>Cintra</span></a>
        <p>{copy.footer}</p>
        <nav className="about-footer-links" aria-label={copy.menu}>
          <a href="/privacy">{copy.privacy}</a>
          <a href="/terms">{copy.terms}</a>
          <a href="/contact">{copy.contact}</a>
        </nav>
        <a href="#top" className="about-back-top" aria-label={copy.home}>{isArabic ? <ArrowUpRight size={16} /> : <ArrowUpLeft size={16} />}</a>
      </footer>
    </main>
  );
}
