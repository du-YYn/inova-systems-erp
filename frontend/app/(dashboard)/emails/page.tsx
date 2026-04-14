'use client';

import { useEffect, useState, useCallback } from 'react';
import { Mail, X, Eye, Send, Loader2, CheckCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import FocusTrap from '@/components/ui/FocusTrap';
import api from '@/lib/api';

interface Variable { key: string; description: string; }

interface EmailTemplate {
  id: number;
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  variables: Variable[];
  recipient_type: string;
  is_active: boolean;
  updated_at: string;
}

const RECIPIENT_LABELS: Record<string, string> = {
  client: 'Cliente',
  partner: 'Parceiro',
  team: 'Equipe Inova',
  requester: 'Solicitante',
};

export default function EmailsPage() {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await api.get<EmailTemplate[] | { results?: EmailTemplate[] }>('/notifications/email-templates/');
      // Suporta resposta paginada ou array direto
      const list = Array.isArray(res) ? res : (res.results || []);
      setTemplates(list);
    } catch (err) {
      console.error('Erro ao carregar templates:', err);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiErr = err as any;
      const status = apiErr?.status || '';
      const msg = apiErr?.message || String(err);
      toast.error(`Erro (${status}): ${msg}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const openEdit = (t: EmailTemplate) => {
    setEditing(t);
    setEditSubject(t.subject);
    setEditBody(t.body_html);
    setEditActive(t.is_active);
    setPreviewHtml('');
    setShowPreview(false);
    setTestEmail('');
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/notifications/email-templates/${editing.id}/`, {
        subject: editSubject,
        body_html: editBody,
        is_active: editActive,
      });
      toast.success('Template salvo!');
      setEditing(null);
      fetchTemplates();
    } catch {
      toast.error('Erro ao salvar.');
    }
    setSaving(false);
  };

  const handlePreview = async () => {
    if (!editing) return;
    try {
      const data = await api.post<{ subject: string; html: string }>(`/notifications/email-templates/${editing.id}/preview/`);
      setPreviewHtml(data.html);
      setShowPreview(true);
    } catch {
      toast.error('Erro ao gerar preview.');
    }
  };

  const handleSendTest = async () => {
    if (!editing || !testEmail) return;
    setSending(true);
    try {
      await api.post(`/notifications/email-templates/${editing.id}/test/`, { email: testEmail });
      toast.success(`Email de teste enviado para ${testEmail}`);
    } catch {
      toast.error('Erro ao enviar teste. Verifique a configuração de email.');
    }
    setSending(false);
  };

  const insertVariable = (key: string) => {
    const textarea = document.getElementById('body-editor') as HTMLTextAreaElement;
    if (!textarea) return;
    const pos = textarea.selectionStart;
    const tag = `{{${key}}}`;
    setEditBody(prev => prev.slice(0, pos) + tag + prev.slice(pos));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(pos + tag.length, pos + tag.length);
    }, 0);
  };

  if (loading) return <TableSkeleton />;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Templates de E-mail</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gerencie os emails enviados pelo sistema</p>
      </div>

      {/* Grid de templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <button
            key={t.id}
            onClick={() => openEdit(t)}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 text-left hover:border-accent-gold/50 hover:shadow-card transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 bg-accent-gold/10 rounded-lg flex items-center justify-center">
                <Mail className="w-4 h-4 text-accent-gold" />
              </div>
              <Badge variant={t.is_active ? 'success' : 'neutral'} dot>
                {t.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">{t.slug}</p>
            <div className="flex items-center justify-between mt-3">
              <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                {RECIPIENT_LABELS[t.recipient_type] || t.recipient_type}
              </span>
              <span className="text-[10px] text-gray-400">
                {new Date(t.updated_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Modal de edição */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setEditing(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              {/* Header */}
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editing.name}</h2>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{editing.slug} &middot; {RECIPIENT_LABELS[editing.recipient_type]}</p>
                </div>
                <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Ativo/Inativo */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditActive(!editActive)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      editActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                    }`}
                  >
                    {editActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {editActive ? 'Ativo' : 'Inativo'}
                  </button>
                </div>

                {/* Assunto */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Assunto</label>
                  <input
                    type="text"
                    value={editSubject}
                    onChange={e => setEditSubject(e.target.value)}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>

                {/* Variáveis disponíveis */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Variáveis (clique para inserir)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {editing.variables.map(v => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="px-2.5 py-1 bg-accent-gold/10 text-accent-gold border border-accent-gold/20 rounded-lg text-xs font-mono hover:bg-accent-gold/20 transition-colors"
                        title={v.description}
                      >
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Corpo HTML */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Corpo HTML</label>
                  <textarea
                    id="body-editor"
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={16}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-mono text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold resize-y"
                    spellCheck={false}
                  />
                </div>

                {/* Preview inline */}
                {showPreview && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Preview</label>
                    <div
                      className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                )}

                {/* Enviar teste */}
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    placeholder="email@teste.com"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-gold/30"
                  />
                  <button
                    onClick={handleSendTest}
                    disabled={sending || !testEmail}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar Teste
                  </button>
                </div>

                {/* Botões */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handlePreview}
                    className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Preview
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => setEditing(null)}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-5 py-2 bg-accent-gold text-white rounded-xl text-sm font-medium hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
