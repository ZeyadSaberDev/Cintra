import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { ChatMessageDisplay, MessageItem } from './MessageItem';
import { useLanguage } from '../../contexts/LanguageContext';

interface SharedConversationData {
  conversation: { title: string };
  messages: ChatMessageDisplay[];
}

export function SharedConversation({ shareId }: { shareId: string }) {
  const { currentLang } = useLanguage();
  const [data, setData] = useState<SharedConversationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/share/${encodeURIComponent(shareId)}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error?.message || 'This shared conversation is unavailable.');
        setData(result);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name !== 'AbortError') {
          setError(requestError.message);
        }
      });
    return () => controller.abort();
  }, [shareId]);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="h-14 border-b border-[#f0f0f0] px-6 flex items-center font-semibold">
        Cintra
      </header>
      {error ? (
        <div className="mx-auto mt-20 max-w-xl px-6 text-center text-sm text-neutral-600">
          {currentLang === 'ar' ? 'رابط المشاركة غير متاح أو انتهت صلاحيته.' : error}
        </div>
      ) : !data ? (
        <div className="flex justify-center py-24" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
        </div>
      ) : (
        <section className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="mb-8 text-xl font-semibold">{data.conversation.title}</h1>
          <div className="space-y-5">
            {data.messages.map((message) => (
              <MessageItem key={message.id} message={message} readOnly />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
