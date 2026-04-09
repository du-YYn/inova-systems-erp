'use client';

import { useEffect, useRef, useState } from 'react';
import { X, MessageSquare } from 'lucide-react';
import FocusTrap from '@/components/ui/FocusTrap';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sensitive } from '@/components/ui/Sensitive';
import { api } from '@/lib/api';

interface ProspectMessage {
  id: number;
  prospect: number;
  direction: 'inbound' | 'outbound';
  content: string;
  channel: string;
  sent_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ChatModalProps {
  prospectId: number;
  prospectName: string;
  companyName: string;
  onClose: () => void;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();

  if (isSameDay(date, today)) return 'Hoje';
  if (isSameDay(date, yesterday)) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function groupMessagesByDate(messages: ProspectMessage[]): Map<string, ProspectMessage[]> {
  const groups = new Map<string, ProspectMessage[]>();
  for (const msg of messages) {
    const dateKey = new Date(msg.sent_at).toLocaleDateString('pt-BR');
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(msg);
  }
  return groups;
}

export function ChatModal({ prospectId, prospectName, companyName, onClose }: ChatModalProps) {
  const [messages, setMessages] = useState<ProspectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await api.get<{ results: ProspectMessage[] }>(
          `/sales/prospects/${prospectId}/messages/`,
          { page_size: '200' }
        );
        setMessages(res.results || []);
      } catch {
        setMessages([]);
      } finally {
        setLoading(false);
      }
    }
    fetchMessages();
  }, [prospectId]);

  useEffect(() => {
    if (!loading && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [loading, messages]);

  const grouped = groupMessagesByDate(messages);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
      <FocusTrap onClose={onClose}>
        <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-2xl shadow-modal flex flex-col overflow-hidden" style={{ maxHeight: '85vh' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-green-600 to-green-700 dark:from-green-800 dark:to-green-900 text-white">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <Sensitive as="h3" className="text-sm font-semibold truncate">{companyName}</Sensitive>
              <Sensitive as="p" className="text-xs text-green-100 truncate">{prospectName}</Sensitive>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-[#ECE5DD] dark:bg-gray-900" style={{ minHeight: '300px' }}>
            {loading ? (
              <ChatSkeleton />
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-white/60 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Nenhuma mensagem registrada</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">As mensagens da Beatriz aparecerão aqui</p>
              </div>
            ) : (
              <>
                {Array.from(grouped.entries()).map(([, msgs]) => (
                  <div key={msgs[0].sent_at}>
                    {/* Date separator */}
                    <div className="flex justify-center my-3">
                      <span className="bg-white/80 dark:bg-gray-700/80 text-gray-500 dark:text-gray-400 text-[11px] font-medium px-3 py-1 rounded-full shadow-sm">
                        {formatDateLabel(msgs[0].sent_at)}
                      </span>
                    </div>

                    {/* Messages for this date */}
                    {msgs.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex mb-1.5 ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`relative max-w-[78%] px-3 py-2 shadow-sm ${
                            msg.direction === 'outbound'
                              ? 'bg-[#DCF8C6] dark:bg-green-900/50 rounded-tl-xl rounded-tr-xl rounded-bl-xl rounded-br-sm'
                              : 'bg-white dark:bg-gray-700 rounded-tl-sm rounded-tr-xl rounded-bl-xl rounded-br-xl'
                          }`}
                        >
                          {/* Sender label */}
                          <p className={`text-[11px] font-semibold mb-0.5 ${
                            msg.direction === 'outbound'
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {msg.direction === 'outbound' ? 'Beatriz (SDR)' : prospectName}
                          </p>

                          {/* Content */}
                          <Sensitive as="p" className="text-[13px] text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                            {msg.content}
                          </Sensitive>

                          {/* Timestamp */}
                          <p className={`text-[10px] mt-1 text-right ${
                            msg.direction === 'outbound'
                              ? 'text-green-600/60 dark:text-green-400/50'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {formatTime(msg.sent_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
              Conversas registradas automaticamente via WhatsApp
            </p>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-3 py-4">
      {/* Date separator skeleton */}
      <div className="flex justify-center">
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      {/* Outbound */}
      <div className="flex justify-end">
        <Skeleton className="h-16 w-3/5 rounded-xl" />
      </div>
      {/* Inbound */}
      <div className="flex justify-start">
        <Skeleton className="h-12 w-2/5 rounded-xl" />
      </div>
      {/* Outbound */}
      <div className="flex justify-end">
        <Skeleton className="h-20 w-3/4 rounded-xl" />
      </div>
      {/* Inbound */}
      <div className="flex justify-start">
        <Skeleton className="h-14 w-1/2 rounded-xl" />
      </div>
      {/* Outbound */}
      <div className="flex justify-end">
        <Skeleton className="h-12 w-2/5 rounded-xl" />
      </div>
    </div>
  );
}
