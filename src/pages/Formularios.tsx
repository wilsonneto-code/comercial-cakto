
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Plus, ChevronLeft, Pencil, Trash2, Eye, Copy, GripVertical, Settings, Link, Loader2, Globe, Image, Search, Send, Gift, FileText } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { Header } from '@/components/Header';
import { PillTabs } from '@/components/ui/PillTabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, Sel } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase/client';
import { logAudit } from '@/lib/supabase/audit';
import type { FormType, FormStatus, Json } from '@/lib/supabase/database.types';

type FormField = {
  id: number;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string; // comma-separated, only for Select
  width?: 'full' | 'half';
  inventory_linked?: boolean; // Se true, opções carregadas do estoque em tempo real
};

type DbForm = {
  id: string;
  name: string;
  type: FormType;
  slug: string;
  responses: number;
  active: boolean;
  color: string;
  status: FormStatus;
  fields: Json;
  embed_code: string;
  webhook: string;
  custom_domain: string;
  background_image: string;
  bg_color: string;
  field_bg_color: string;
  field_text_color: string;
  bg_opacity: number;
  redirect_url: string;
  logo_url: string;
  logo_width: number;
};

type SubView = 'list' | 'editor' | 'responses';

const FORM_FIELD_TYPES = ['Texto', 'Email', 'Telefone', 'CPF', 'CEP', 'Endereço', 'Select', 'Textarea', 'Data'];

const EMPTY_FORM: DbForm = {
  id: '', name: 'Novo Formulário', type: 'Cadastro', slug: '', responses: 0,
  active: true, color: '#2997FF', status: 'Rascunho', fields: [], embed_code: '',
  webhook: '', custom_domain: '', background_image: '',
  bg_color: '#0f172a', field_bg_color: '#1e293b', field_text_color: '#ffffff', bg_opacity: 60, redirect_url: '', logo_url: '', logo_width: 120,
};

export default function FormulariosPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [user, loading, navigate]);
  if (loading || !user) return null;
  return <FormulariosContent />;
}

const PAGE_TABS = ['Premiação', 'Contrato'];

function FormulariosContent() {
  const { user } = useAuth();
  const toast = useToast();
  const [pageTab, setPageTab] = useState('Premiação');
  const [view, setView] = useState<SubView>('list');
  const [forms, setForms] = useState<DbForm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedForm, setSelectedForm] = useState<DbForm | null>(null);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [typeModal, setTypeModal] = useState(false);

  useEffect(() => {
    supabase.from('forms')
      .select('id,name,type,slug,responses,active,color,status,fields,embed_code,webhook,custom_domain,background_image')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast(error.message, 'error');
        if (data) setForms(data as DbForm[]);
        setIsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openEditor(form?: DbForm, type?: FormType) {
    setSelectedForm(form || { ...EMPTY_FORM, type: type ?? pageTab as FormType });
    setView('editor');
  }

  function openResponses(form: DbForm) {
    setSelectedForm(form);
    setView('responses');
  }

  async function deleteForm(id: string) {
    const target = forms.find(f => f.id === id);
    const { error } = await supabase.from('forms').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setForms(p => p.filter(f => f.id !== id));
    if (user && target) logAudit(user.id, user.name, `Excluiu formulário: ${target.name}`, 'Formulários');
    toast('Formulário removido', 'info');
    setDeleteModal(null);
  }

  async function handleSave(updated: DbForm) {
    setIsSaving(true);
    const slug = updated.slug || updated.name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60)
      || `form-${Date.now()}`;

    if (!updated.id) {
      const { data, error } = await supabase.from('forms').insert({
        name: updated.name, type: updated.type, slug, responses: 0,
        active: updated.active, color: updated.color, status: updated.status as FormStatus,
        fields: updated.fields, embed_code: '', webhook: updated.webhook,
        custom_domain: updated.custom_domain, background_image: updated.background_image,
        bg_color: updated.bg_color, field_bg_color: updated.field_bg_color,
        field_text_color: updated.field_text_color, bg_opacity: updated.bg_opacity,
        redirect_url: updated.redirect_url, logo_url: updated.logo_url, logo_width: updated.logo_width,
      }).select().single();
      if (error) { toast(error.message, 'error'); setIsSaving(false); return; }
      setForms(p => [data as DbForm, ...p]);
      if (user) logAudit(user.id, user.name, `Criou formulário: ${updated.name}`, 'Formulários');
    } else {
      const { error } = await supabase.from('forms').update({
        name: updated.name, status: updated.status as FormStatus, fields: updated.fields,
        webhook: updated.webhook, color: updated.color, active: updated.active,
        custom_domain: updated.custom_domain, background_image: updated.background_image,
        bg_color: updated.bg_color, field_bg_color: updated.field_bg_color,
        field_text_color: updated.field_text_color, bg_opacity: updated.bg_opacity,
        redirect_url: updated.redirect_url, logo_url: updated.logo_url, logo_width: updated.logo_width,
      }).eq('id', updated.id);
      if (error) { toast(error.message, 'error'); setIsSaving(false); return; }
      setForms(p => p.map(f => f.id === updated.id ? { ...f, ...updated } : f));
    }
    setIsSaving(false);

    // Dispara webhook quando o formulário é publicado e tem URL configurada
    if (updated.status === 'Publicado' && updated.webhook) {
      fetch(updated.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'form.published', formId: updated.id || 'new', formName: updated.name }),
      }).catch(() => { /* webhook failure is non-blocking */ });
    }

    setView('list');
    toast('Formulário salvo!', 'success');
  }

  if (view === 'editor' && selectedForm) {
    return <FormEditor form={selectedForm} onBack={() => setView('list')} onSave={handleSave} isSaving={isSaving} />;
  }
  if (view === 'responses' && selectedForm) {
    return <FormResponses form={selectedForm} onBack={() => setView('list')} />;
  }

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando formulários…</span>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Formulários</h1>
          <Button icon={Plus} onClick={() => setTypeModal(true)}>Novo Formulário</Button>
        </div>

        <PillTabs tabs={PAGE_TABS} active={pageTab} onChange={setPageTab} style={{ marginBottom: 24 }} />

        {(() => {
          const displayForms = pageTab === 'Contrato'
            ? forms.filter(f => f.type === 'Contrato')
            : forms.filter(f => f.type !== 'Contrato')
          return (
            <>
              {displayForms.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text2)', padding: '48px 0' }}>
                  Nenhum formulário criado ainda.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {displayForms.map(f => (
                  <div key={f.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{f.name}</div>
                      <Badge label={f.status} color={f.status === 'Publicado' ? 'var(--green)' : f.status === 'Rascunho' ? 'var(--orange)' : 'var(--text2)'} />
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text2)' }}>
                      <span>{Array.isArray(f.fields) ? (f.fields as unknown[]).length : 0} campos</span>
                      <span>{f.responses} respostas</span>
                      {f.custom_domain && <span style={{ color: 'var(--action)' }}>🌐 {f.custom_domain}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button size="sm" icon={Pencil} onClick={() => openEditor(f)}>Editar</Button>
                      <Button size="sm" variant="secondary" icon={Eye} onClick={() => openResponses(f)}>Respostas</Button>
                      <Button size="sm" variant="ghost" icon={Copy} onClick={() => {
                        navigator.clipboard.writeText(`<iframe src="${window.location.origin}/f/${f.id}" width="100%" height="600" />`);
                        toast('Embed copiado!', 'success');
                      }}>Embed</Button>
                      <Button size="sm" variant="destructive" icon={Trash2} onClick={() => setDeleteModal(f.id)} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        })()}

        {/* ── Modal: Escolher tipo de formulário ── */}
        {typeModal && (
          <div
            onClick={() => setTypeModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'linear-gradient(145deg,#111113,#18181c)',
                border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 20, padding: '36px 32px', width: '100%', maxWidth: 480,
                boxShadow: '0 32px 80px rgba(0,0,0,.6)',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 6, letterSpacing: '-.02em' }}>
                Qual tipo de formulário?
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 28 }}>
                Escolha a categoria para o novo formulário
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {([
                  { type: 'Premiação' as FormType, icon: Gift,     title: 'Premiação', desc: 'Formulário para resgate de prêmios' },
                  { type: 'Contrato'  as FormType, icon: FileText, title: 'Contrato',  desc: 'Formulário para propostas e contratos' },
                ] as { type: FormType; icon: React.ComponentType<{ size?: number; color?: string }>; title: string; desc: string }[]).map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => { setTypeModal(false); openEditor(undefined, opt.type); }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      gap: 10, padding: '20px 18px', borderRadius: 14, border: '1px solid rgba(255,255,255,.1)',
                      background: 'rgba(255,255,255,.04)', cursor: 'pointer', fontFamily: 'inherit',
                      textAlign: 'left', transition: 'all .15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,.2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,.04)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,.1)'; }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(41,151,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <opt.icon size={20} color="#2997FF" />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{opt.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setTypeModal(false)}
                style={{ marginTop: 20, width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', background: 'transparent', color: 'var(--text2)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <Modal open={deleteModal !== null} onClose={() => setDeleteModal(null)} title="Excluir Formulário">
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            Esta ação é irreversível. Todas as respostas serão perdidas.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDeleteModal(null)}>Cancelar</Button>
            <Button variant="destructive" icon={Trash2} onClick={() => deleteForm(deleteModal!)}>Excluir</Button>
          </div>
        </Modal>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}

/* ───────── FormEditor ───────── */
const EDITOR_TABS = ['Design', 'Campos', 'Configurações', 'Integrações'];

function FormEditor({ form, onBack, onSave, isSaving }: {
  form: DbForm; onBack: () => void; onSave: (f: DbForm) => void; isSaving: boolean;
}) {
  const [tab, setTab]               = useState('Campos');
  const [name, setName]             = useState(form.name);
  const [status, setStatus]         = useState<FormStatus>(form.status);
  const [color, setColor]           = useState(form.color || '#2997FF');
  const [fields, setFields]         = useState<FormField[]>(Array.isArray(form.fields) ? form.fields as FormField[] : []);
  const [webhook, setWebhook]       = useState(form.webhook || '');
  const [customDomain, setCustomDomain]     = useState(form.custom_domain || '');
  const [backgroundImage, setBackgroundImage] = useState(form.background_image || '');
  const [bgColor, setBgColor]               = useState(form.bg_color || '#0f172a');
  const [fieldBgColor, setFieldBgColor]     = useState(form.field_bg_color || '#1e293b');
  const [bgOpacity, setBgOpacity]           = useState(form.bg_opacity ?? 60);
  const [redirectUrl, setRedirectUrl]       = useState(form.redirect_url || '');
  const [fieldTextColor, setFieldTextColor] = useState(form.field_text_color || '#ffffff');
  const [logoUrl, setLogoUrl]               = useState(form.logo_url || '');
  const [logoWidth, setLogoWidth]           = useState(form.logo_width ?? 120);

  // Behavior toggles — persisted in embed_code as JSON
  const parsedBehaviors = (() => { try { return JSON.parse(form.embed_code || '{}').behaviors || {} } catch { return {} } })();
  const [behaviors, setBehaviors] = useState<Record<string, boolean>>({
    multi: parsedBehaviors.multi ?? false,
    progress: parsedBehaviors.progress ?? false,
    email: parsedBehaviors.email ?? false,
    redirect: parsedBehaviors.redirect ?? false,
  });

  async function toggleBehavior(key: string) {
    const next = { ...behaviors, [key]: !behaviors[key] };
    setBehaviors(next);
    if (form.id) {
      await supabase.from('forms').update({ embed_code: JSON.stringify({ behaviors: next }) }).eq('id', form.id);
    }
  }

  // ── Add field state ──
  const [addingField, setAddingField]         = useState(false);
  const [newFieldType, setNewFieldType]       = useState('Texto');
  const [newFieldLabel, setNewFieldLabel]     = useState('');
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [newFieldWidth, setNewFieldWidth]               = useState<'full' | 'half'>('full');
  const [newFieldInventoryLinked, setNewFieldInventoryLinked] = useState(false);

  // ── Edit field state ──
  const [editingId, setEditingId]                     = useState<number | null>(null);
  const [editLabel, setEditLabel]                     = useState('');
  const [editPlaceholder, setEditPlaceholder]         = useState('');
  const [editOptions, setEditOptions]                 = useState('');
  const [editWidth, setEditWidth]                     = useState<'full' | 'half'>('full');
  const [editInventoryLinked, setEditInventoryLinked] = useState(false);

  function addField() {
    if (!newFieldLabel) return;
    setFields(p => [...p, {
      id: Date.now(), type: newFieldType, label: newFieldLabel,
      placeholder: newFieldPlaceholder || undefined,
      required: false,
      options: newFieldType === 'Select' ? newFieldOptions : undefined,
      width: newFieldWidth,
      inventory_linked: newFieldType === 'Select' ? newFieldInventoryLinked : undefined,
    }]);
    setNewFieldLabel(''); setNewFieldPlaceholder(''); setNewFieldOptions(''); setNewFieldWidth('full'); setNewFieldInventoryLinked(false);
    setAddingField(false);
  }

  function startEdit(f: FormField) {
    setEditingId(f.id);
    setEditLabel(f.label);
    setEditPlaceholder(f.placeholder || '');
    setEditOptions(f.options || '');
    setEditWidth(f.width || 'full');
    setEditInventoryLinked(f.inventory_linked ?? false);
  }

  function saveEdit() {
    setFields(p => p.map(f => f.id === editingId
      ? { ...f, label: editLabel, placeholder: editPlaceholder || undefined, options: f.type === 'Select' ? editOptions : f.options, width: editWidth, inventory_linked: f.type === 'Select' ? editInventoryLinked : undefined }
      : f
    ));
    setEditingId(null);
  }

  function removeField(id: number) { setFields(p => p.filter(f => f.id !== id)); }
  function toggleRequired(id: number) { setFields(p => p.map(f => f.id === id ? { ...f, required: !f.required } : f)); }

  function buildForm(): DbForm {
    return {
      ...form, name, status, fields: fields as unknown as Json,
      webhook, color, custom_domain: customDomain, background_image: backgroundImage,
      bg_color: bgColor, field_bg_color: fieldBgColor, field_text_color: fieldTextColor,
      bg_opacity: bgOpacity, redirect_url: redirectUrl, logo_url: logoUrl, logo_width: logoWidth,
    };
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <h1 style={{ fontSize: 22, fontWeight: 800, flex: 1 }}>{name}</h1>
          <Sel value={status} onChange={v => setStatus(v as FormStatus)}
            options={['Rascunho', 'Arquivado', 'Publicado']} placeholder="Status" />
          <Button onClick={() => onSave(buildForm())} disabled={isSaving}>
            {isSaving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>

        <PillTabs tabs={EDITOR_TABS} active={tab} onChange={setTab} />

        <div style={{ marginTop: 20 }}>
          {/* ── Design ── */}
          {tab === 'Design' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Painel de controles */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Cores & Visual</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Field label="Título do Formulário">
                    <input className="inp" value={name} onChange={e => setName(e.target.value)} />
                  </Field>

                  {/* Cores lado a lado */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Cor Primária / Botão">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="color" value={color} onChange={e => setColor(e.target.value)}
                          style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{color}</span>
                      </div>
                    </Field>
                    <Field label="Cor de Fundo da Página">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                          style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{bgColor}</span>
                      </div>
                    </Field>
                    <Field label="Fundo dos Campos">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="color" value={fieldBgColor} onChange={e => setFieldBgColor(e.target.value)}
                          style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{fieldBgColor}</span>
                      </div>
                    </Field>
                    <Field label="Cor do Texto dos Campos">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="color" value={fieldTextColor} onChange={e => setFieldTextColor(e.target.value)}
                          style={{ width: 36, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'monospace' }}>{fieldTextColor}</span>
                      </div>
                    </Field>
                  </div>

                  <Field label="URL da Logo (Topo)">
                    <div style={{ position: 'relative' }}>
                      <input className="inp" value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
                        placeholder="https://..." style={{ paddingLeft: 38 }} />
                      <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
                        <Image size={15} color="var(--text2)" />
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                      Exibida centralizada no topo do formulário público.
                    </p>
                  </Field>

                  <Field label={`Tamanho da Logo — ${logoWidth}px`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="range" min={50} max={400} value={logoWidth}
                        onChange={e => setLogoWidth(Number(e.target.value))}
                        style={{ flex: 1, accentColor: color }} />
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 44, textAlign: 'right' }}>{logoWidth}px</span>
                    </div>
                  </Field>

                  <Field label="Imagem de Fundo (URL)">
                    <div style={{ position: 'relative' }}>
                      <input className="inp" value={backgroundImage} onChange={e => setBackgroundImage(e.target.value)}
                        placeholder="https://..." style={{ paddingLeft: 38 }} />
                      <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
                        <Image size={15} color="var(--text2)" />
                      </div>
                    </div>
                  </Field>

                  <Field label={`Opacidade do Container do Form — ${bgOpacity}%`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input type="range" min={0} max={100} value={bgOpacity}
                        onChange={e => setBgOpacity(Number(e.target.value))}
                        style={{ flex: 1, accentColor: color }} />
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>{bgOpacity}%</span>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                      0% = totalmente transparente · 100% = sólido
                    </p>
                  </Field>
                </div>
              </div>

              {/* Preview */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Preview</div>
                <div style={{
                  borderRadius: 12, overflow: 'hidden', minHeight: 200,
                  background: backgroundImage ? undefined : bgColor,
                  backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }}>
                  <div style={{
                    padding: 20,
                    background: `rgba(0,0,0,${(100 - bgOpacity) / 100})`,
                  }}>
                    {logoUrl && <div style={{ textAlign: 'center', marginBottom: 10 }}><img src={logoUrl} alt="logo" style={{ maxWidth: Math.min(logoWidth, 160), maxHeight: 40, objectFit: 'contain' }} /></div>}
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 12 }}>{name}</div>
                    {fields.slice(0, 2).map(f => (
                      <div key={f.id} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.65)', marginBottom: 4 }}>{f.label}{f.required && ' *'}</div>
                        <div style={{ height: 28, background: fieldBgColor, borderRadius: 6, border: '1px solid rgba(255,255,255,.1)' }} />
                      </div>
                    ))}
                    {fields.length === 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 10 }}>Nenhum campo ainda…</div>}
                    {fields.length > 2 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginBottom: 10 }}>+{fields.length - 2} campos…</div>}
                    <div style={{ marginTop: 8, height: 32, background: color, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Enviar</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Campos ── */}
          {tab === 'Campos' && (
            <div style={{ maxWidth: 600 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 12 }}>
                {fields.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text2)', fontSize: 14 }}>
                    Nenhum campo. Adicione o primeiro abaixo.
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fields.map(f => (
                    <div key={f.id}>
                      {editingId === f.id ? (
                        /* ── Inline edit form ── */
                        <div style={{ padding: 16, background: 'color-mix(in srgb, var(--action) 8%, var(--bg-card2))', borderRadius: 10, border: '1px solid var(--action)' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Editar Campo — {f.type}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Field label="Rótulo">
                              <input className="inp" value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus />
                            </Field>
                            {f.type !== 'Select' && (
                              <Field label="Placeholder">
                                <input className="inp" value={editPlaceholder} onChange={e => setEditPlaceholder(e.target.value)} placeholder="Texto de exemplo…" />
                              </Field>
                            )}
                            {f.type === 'Select' && (
                              <>
                                <Field label="Opções (separadas por vírgula)">
                                  <input className="inp" value={editOptions} onChange={e => setEditOptions(e.target.value)}
                                    placeholder="Opção 1, Opção 2, Opção 3" disabled={editInventoryLinked}
                                    style={{ opacity: editInventoryLinked ? 0.4 : 1 }} />
                                </Field>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <Toggle value={editInventoryLinked} onChange={() => setEditInventoryLinked(p => !p)} />
                                  <span style={{ fontSize: 13 }}>Vincular ao Estoque</span>
                                  <span style={{ fontSize: 11, color: 'var(--text2)' }}>— opções carregadas do inventário em tempo real</span>
                                </div>
                              </>
                            )}
                            <Field label="Largura do Campo">
                              <div style={{ display: 'flex', gap: 8 }}>
                                {(['full', 'half'] as const).map(w => (
                                  <button key={w} onClick={() => setEditWidth(w)} type="button"
                                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${editWidth === w ? 'var(--action)' : 'var(--border)'}`, background: editWidth === w ? 'color-mix(in srgb, var(--action) 15%, transparent)' : 'var(--bg-card2)', color: editWidth === w ? 'var(--action)' : 'var(--text2)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                                    {w === 'full' ? 'Largura Total' : 'Metade'}
                                  </button>
                                ))}
                              </div>
                            </Field>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <Button size="sm" onClick={saveEdit}>Salvar</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ── Field row ── */
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: 'var(--bg-card2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                          <GripVertical size={16} color="var(--text2)" style={{ cursor: 'grab', flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                              {f.type}{f.required ? ' · Obrigatório' : ''}{f.type === 'Select' && f.options && !f.inventory_linked ? ` · ${f.options.split(',').length} opções` : ''}{f.inventory_linked ? ' · 📦 Estoque' : ''}{f.width === 'half' ? ' · Metade' : ' · Largura Total'}
                            </div>
                          </div>
                          <Toggle value={f.required} onChange={() => toggleRequired(f.id)} />
                          <button onClick={() => startEdit(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--action)', padding: 4 }} title="Editar campo">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => removeField(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 4 }} title="Remover campo">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {addingField ? (
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--action)', borderRadius: 14, padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Novo Campo</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label="Tipo do Campo">
                      <Sel value={newFieldType} onChange={v => { setNewFieldType(v); setNewFieldOptions(''); }} options={FORM_FIELD_TYPES} placeholder="Tipo" />
                    </Field>
                    <Field label="Rótulo">
                      <input className="inp" value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} placeholder="Ex: Nome completo" autoFocus />
                    </Field>
                    {newFieldType !== 'Select' && (
                      <Field label="Placeholder">
                        <input className="inp" value={newFieldPlaceholder} onChange={e => setNewFieldPlaceholder(e.target.value)} placeholder="Texto de exemplo…" />
                      </Field>
                    )}
                    {newFieldType === 'Select' && (
                      <>
                        <Field label="Opções (separadas por vírgula)">
                          <input className="inp" value={newFieldOptions} onChange={e => setNewFieldOptions(e.target.value)}
                            placeholder="Opção 1, Opção 2, Opção 3" disabled={newFieldInventoryLinked}
                            style={{ opacity: newFieldInventoryLinked ? 0.4 : 1 }} />
                        </Field>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Toggle value={newFieldInventoryLinked} onChange={() => setNewFieldInventoryLinked(p => !p)} />
                          <span style={{ fontSize: 13 }}>Vincular ao Estoque</span>
                          <span style={{ fontSize: 11, color: 'var(--text2)' }}>— opções carregadas do inventário em tempo real</span>
                        </div>
                      </>
                    )}
                    <Field label="Largura do Campo">
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['full', 'half'] as const).map(w => (
                          <button key={w} onClick={() => setNewFieldWidth(w)} type="button"
                            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1px solid ${newFieldWidth === w ? 'var(--action)' : 'var(--border)'}`, background: newFieldWidth === w ? 'color-mix(in srgb, var(--action) 15%, transparent)' : 'var(--bg-card2)', color: newFieldWidth === w ? 'var(--action)' : 'var(--text2)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                            {w === 'full' ? 'Largura Total' : 'Metade'}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button onClick={addField}>Adicionar Campo</Button>
                      <Button variant="ghost" onClick={() => { setAddingField(false); setNewFieldLabel(''); setNewFieldOptions(''); setNewFieldWidth('full'); }}>Cancelar</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button icon={Plus} variant="secondary" onClick={() => setAddingField(true)} style={{ width: '100%' }}>
                  Adicionar Campo
                </Button>
              )}
            </div>
          )}

          {/* ── Configurações ── */}
          {tab === 'Configurações' && (
            <div style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Redirecionamento */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Link size={18} color="var(--purple)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Redirecionamento Personalizado</div>
                </div>
                <Field label="URL de Redirecionamento (após o envio)">
                  <input className="inp" type="url" value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)}
                    placeholder="https://obrigado.seusite.com" />
                </Field>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>
                  Se preenchido, o visitante será redirecionado para esta URL após enviar o formulário. Deixe vazio para exibir a mensagem de sucesso padrão.
                </p>
              </div>

              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Globe size={18} color="var(--action)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Domínio Customizado</div>
                </div>
                <Field label="Domínio Customizado (Opcional)">
                  <input className="inp" value={customDomain} onChange={e => setCustomDomain(e.target.value.toLowerCase())}
                    placeholder="premiacaocakto.site" />
                </Field>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, lineHeight: 1.5 }}>
                  Aponte o DNS do seu domínio para a Vercel. Quando acessado, este formulário será exibido automaticamente.
                </p>
                {!customDomain && form.id && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bg-card2)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Link Padrão</div>
                    <div style={{ fontSize: 12, color: 'var(--action)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                      {window.location.origin}/f/{form.id}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Comportamento</div>
                {[
                  { label: 'Múltiplas respostas por usuário', key: 'multi' },
                  { label: 'Exibir progresso no formulário', key: 'progress' },
                  { label: 'Confirmação por e-mail', key: 'email' },
                  { label: 'Redirecionar após envio', key: 'redirect' },
                ].map((opt, i, arr) => (
                  <div key={opt.key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{ fontSize: 14 }}>{opt.label}</span>
                    <Toggle value={behaviors[opt.key] ?? false} onChange={() => toggleBehavior(opt.key)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Integrações ── */}
          {tab === 'Integrações' && (
            <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Link size={18} color="var(--action)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Embed</div>
                </div>
                <div style={{ background: 'var(--bg-card2)', borderRadius: 8, padding: 12, fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)', wordBreak: 'break-all', marginBottom: 12 }}>
                  {`<iframe src="${window.location.origin}/f/${form.id || '[id após salvar]'}" width="100%" height="600" />`}
                </div>
                <Button variant="secondary" icon={Copy} onClick={() => navigator.clipboard.writeText(`<iframe src="${window.location.origin}/f/${form.id}" />`)}>
                  Copiar Embed
                </Button>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <Settings size={18} color="var(--purple)" />
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Webhook</div>
                </div>
                <Field label="URL do Webhook">
                  <input className="inp" value={webhook} onChange={e => setWebhook(e.target.value)} placeholder="https://..." />
                </Field>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ───────── FormResponses ───────── */
type Submission = { id: string; form_id: string; data: Record<string, string>; submitted_at: string }

function FormResponses({ form, onBack }: { form: DbForm; onBack: () => void }) {
  const toast = useToast();
  const [rows, setRows]             = useState<Submission[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [editRow, setEditRow]       = useState<Submission | null>(null);
  const [editData, setEditData]     = useState<Record<string, string>>({});
  const [isSaving, setIsSaving]     = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    supabase
      .from('form_submissions')
      .select('id,form_id,data,submitted_at')
      .eq('form_id', form.id)
      .order('submitted_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) toast(error.message, 'error');
        if (data) setRows(data as Submission[]);
        setIsLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.id]);

  // Dynamic column headers from first row's data keys
  const columns = rows.length > 0 ? Object.keys(rows[0].data) : [];

  const filteredRows = searchTerm.trim()
    ? rows.filter(r => Object.values(r.data).some(v => String(v).toLowerCase().includes(searchTerm.toLowerCase())))
    : rows;

  async function handleDelete(id: string) {
    const { error } = await supabase.from('form_submissions').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setRows(p => p.filter(r => r.id !== id));
    setDeleteId(null);
    toast('Resposta excluída', 'info');
  }

  function openEdit(row: Submission) {
    setEditRow(row);
    setEditData({ ...row.data });
  }

  const [resendingId, setResendingId] = useState<string | null>(null);

  async function handleSaveEdit() {
    if (!editRow) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('form_submissions')
      .update({ data: editData })
      .eq('id', editRow.id);
    if (error) { toast(error.message, 'error'); setIsSaving(false); return; }
    setRows(p => p.map(r => r.id === editRow.id ? { ...r, data: editData } : r));
    setEditRow(null);
    setIsSaving(false);
    toast('Resposta atualizada', 'success');
  }

  async function handleResendWebhook(row: Submission) {
    if (!form.webhook) { toast('Este formulário não tem webhook configurado.', 'error'); return; }
    setResendingId(row.id);
    try {
      const rawData = (row.data ?? {}) as Record<string, unknown>
      const cleanData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(rawData)) {
        const k = key.replace(/^(data_|data-)/i, '').trim().toLowerCase()
        let uk: string
        if      (k === 'nome completo' || k === 'nome')                        uk = 'name'
        else if (k === 'e-mail'        || k === 'email')                       uk = 'email'
        else if (k === 'whatsapp'      || k === 'telefone' || k === 'celular') uk = 'phone'
        else if (k === 'cpf'           || k === 'documento')                   uk = 'document'
        else if (k === 'cep')                                                  uk = 'zipcode'
        else if (k === 'rua'           || k === 'endereço' || k === 'endereco')uk = 'street'
        else if (k === 'número'        || k === 'numero')                      uk = 'number'
        else if (k === 'bairro')                                               uk = 'neighborhood'
        else if (k === 'cidade')                                               uk = 'city'
        else if (k === 'estado'        || k === 'uf')                          uk = 'state'
        else if (k === 'premiação'     || k === 'premiacao')                   uk = 'award'
        else uk = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
        cleanData[uk] = value
      }
      const res = await fetch(form.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_id: form.id, form_name: form.name, data: cleanData, submitted_at: row.submitted_at }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast('Webhook reenviado com sucesso!', 'success');
    } catch {
      toast('Falha ao reenviar o webhook.', 'error');
    } finally {
      setResendingId(null);
    }
  }

  // ── Styles ──────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em',
    whiteSpace: 'nowrap', background: 'var(--bg-card)',
    position: 'sticky', top: 0, zIndex: 10,
    borderBottom: '1px solid var(--border)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '11px 16px', fontSize: 13,
    borderBottom: '1px solid var(--border)',
    maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
  const actionBtn = (color: string): React.CSSProperties => ({
    background: 'none', border: 'none', cursor: 'pointer', color,
    padding: '5px 6px', borderRadius: 6, display: 'flex', alignItems: 'center',
    transition: 'background .15s',
  });

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Button variant="ghost" icon={ChevronLeft} onClick={onBack}>Voltar</Button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{form.name}</h1>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{rows.length} respostas</div>
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)', padding: '48px 0', justifyContent: 'center' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14 }}>Carregando respostas…</span>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 48, textAlign: 'center', color: 'var(--text2)' }}>
            <div style={{ fontSize: 14 }}>Nenhuma resposta recebida ainda.</div>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
                <Search size={15} color="var(--text2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input className="inp" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Buscar respostas..." style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                {filteredRows.length} de {rows.length}
              </span>
            </div>

            {/* Table */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
              maxHeight: '70vh', overflowY: 'auto', overflowX: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr>
                    {columns.map(col => <th key={col} style={thStyle}>{col}</th>)}
                    <th style={thStyle}>Data de Envio</th>
                    <th style={{ ...thStyle, textAlign: 'right', paddingRight: 20 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 && (
                    <tr><td colSpan={columns.length + 2} style={{ textAlign: 'center', color: 'var(--text2)', padding: 40, fontSize: 13 }}>
                      Nenhum resultado para "{searchTerm}".
                    </td></tr>
                  )}
                  {filteredRows.map((row, i) => (
                    <tr key={row.id}
                      style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)', transition: 'background .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--action) 6%, var(--bg-card2))')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)')}
                    >
                      {columns.map(col => (
                        <td key={col} style={tdStyle} title={row.data[col] || ''}>
                          {row.data[col] || <span style={{ color: 'var(--text2)', opacity: .45 }}>—</span>}
                        </td>
                      ))}
                      <td style={{ ...tdStyle, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                        {new Date(row.submitted_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', paddingRight: 12 }}>
                        <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                          <button onClick={() => openEdit(row)} title="Editar" style={actionBtn('var(--action)')}
                            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--action) 12%, transparent)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleResendWebhook(row)}
                            disabled={resendingId === row.id}
                            title="Reenviar Webhook"
                            style={actionBtn('var(--purple)')}
                            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--purple) 12%, transparent)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            {resendingId === row.id
                              ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                              : <Send size={13} />}
                          </button>
                          <button onClick={() => setDeleteId(row.id)} title="Excluir" style={actionBtn('var(--red)')}
                            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--red) 12%, transparent)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Delete confirm ── */}
      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Excluir Resposta">
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
          Esta ação é irreversível. A resposta será removida permanentemente.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancelar</Button>
          <Button variant="destructive" icon={Trash2} onClick={() => handleDelete(deleteId!)}>Excluir</Button>
        </div>
      </Modal>

      {/* ── Edit modal ── */}
      <Modal open={editRow !== null} onClose={() => setEditRow(null)} title="Editar Resposta">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Object.keys(editData).map(key => (
            <Field key={key} label={key}>
              <input className="inp" value={editData[key] || ''} onChange={e => setEditData(p => ({ ...p, [key]: e.target.value }))} />
            </Field>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <Button variant="secondary" onClick={() => setEditRow(null)}>Cancelar</Button>
          <Button onClick={handleSaveEdit} disabled={isSaving}>{isSaving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </Modal>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
