
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Package, Plug, Plus, Pencil, Trash2, Link, Copy, RefreshCw, Loader2, Search, AlertTriangle, X, ShoppingCart, Truck, Send } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { Header } from '@/components/Header';
import { PillTabs } from '@/components/ui/PillTabs';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase/client';

type DbItem    = { id: string; name: string; category: string; qty: number; unit: string }
type Submission = {
  id: string; form_id: string; data: Record<string, string>; submitted_at: string
  status: string; tracking_code: string; carrier: string; me_cart_id: string
}
type ExtraItem  = { id: string; name: string }

const SUB_STATUSES = ['Pendente', 'No Carrinho', 'Em Trânsito', 'Entregue', 'Cancelado'] as const

const STATUS_COLORS: Record<string, string> = {
  'Pendente':    'var(--orange)',
  'No Carrinho': 'var(--purple)',
  'Em Trânsito': 'var(--action)',
  'Entregue':    'var(--green)',
  'Cancelado':   'var(--red)',
}

function extractNome(data: Record<string, string>): string {
  const k = Object.keys(data).find(k => /nome|cliente|name/i.test(k) && !k.startsWith('_'))
  return (k ? data[k] : Object.values(data).filter((_, i) => !Object.keys(data)[i].startsWith('_'))[0]) || '—'
}

function extractProduto(data: Record<string, string>): string {
  // 1. Campo com nome explícito de produto/prêmio
  const k = Object.keys(data).find(k => /prêmio|premio|produto|item|escolha|award/i.test(k) && !k.startsWith('_'))
  if (k) return data[k]
  // 2. Fallback: milestone/dimensão (ex: "250K", "Placa 250K") — evita retornar nome do cliente
  const meta = extractMeta(data)
  if (meta) return meta
  return '—'
}

/** Extracts the meta/milestone value from submission data */
function extractMeta(data: Record<string, string>): string {
  const k = Object.keys(data).find(k =>
    /meta|premiação|premiacao|plano|nível|nivel|milestone/i.test(k) && !k.startsWith('_')
  )
  if (k) return data[k]
  // Fallback: look for values that look like milestones
  const vals = Object.entries(data).filter(([key]) => !key.startsWith('_')).map(([, v]) => v)
  return vals.find(v => /\d+[kKmM]|\d{4,}/.test(v)) || ''
}

function metaBadgeStyle(meta: string): React.CSSProperties {
  const m = (meta ?? '').toLowerCase().replace(/\s/g, '')
  const bg =
    m.includes('1m')   || m.includes('1.000.000') ? '#b45309' :   // gold
    m.includes('500k') || m.includes('500.000')   ? '#7c3aed' :   // purple
    m.includes('100k') || m.includes('100.000')   ? '#059669' :   // green
    m.includes('50k')  || m.includes('50.000')    ? '#0284c7' :   // blue
    '#6b7280'                                                       // gray
  return { background: `color-mix(in srgb, ${bg} 18%, var(--bg-card2))`,
    color: bg, border: `1px solid color-mix(in srgb, ${bg} 35%, var(--border))`,
    borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }
}

function trackingUrl(code: string, carrier: string): string {
  const c = (carrier ?? '').toLowerCase()
  if (c.includes('correios')) return `https://rastreamento.correios.com.br/app/index.php?objetos=${code}`
  // Default: Melhor Envio / generic
  return `https://melhorrastreio.com.br/rastreio/${code}`
}

/** Retorna apenas o sufixo do link Melhor Rastreio (ex: /jadlog/123 ou /correios/AB123).
 *  A Meta exige somente o sufixo em botões de link dinâmico no WhatsApp. */
function meTrackingPath(code: string, carrier: string): string {
  const c = (carrier ?? '').toLowerCase()
  const slug = c.includes('jadlog') ? 'jadlog'
    : c.includes('correio') ? 'correios'
    : c.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'correios'
  return `/${slug}/${code}`
}

/** Returns package dimensions/weight based on meta milestone */
function getDimensions(meta: string) {
  const m = (meta ?? '').toLowerCase().replace(/[\s.]/g, '')
  if (m.includes('10k'))  return { width: 8,  height: 4,  length: 8,  weight: 0.1 }
  if (m.includes('100k') || m.includes('250k')) return { width: 30, height: 18, length: 35, weight: 3.0 }
  if (m.includes('500k')) return { width: 32, height: 4,  length: 43, weight: 3.8 }
  if (m.includes('1m') || m.includes('5m') || m.includes('10m')) return { width: 38, height: 17, length: 50, weight: 3.8 }
  return { width: 30, height: 18, length: 35, weight: 3.0 } // default
}

/** Extracts recipient shipping address from submission JSONB */
function extractRecipient(data: Record<string, string>) {
  const get = (re: RegExp) => {
    const k = Object.keys(data).find(k => re.test(k) && !k.startsWith('_'))
    return k ? data[k] ?? '' : ''
  }
  return {
    name:        get(/nome/i) || '—',
    phone:       normalizePhone(get(/telefone|celular|phone/i)),
    email:       get(/email|e-mail/i),
    document:    get(/cpf|cnpj|document/i).replace(/\D/g, ''),
    postal_code: get(/cep/i).replace(/\D/g, ''),
    address:     get(/endereço|rua|logradouro|address/i),
    number:      get(/número|numero|n°|nro/i) || 's/n',
    complement:  get(/complemento|comp/i),
    district:    get(/bairro|district/i),
    city:        get(/cidade|city/i),
    state_abbr:  normalizeStateAbbr(get(/estado|uf|state/i)),
    country_id:  'BR',
  }
}

/** Valida CPF matematicamente (dígitos verificadores) */
function isValidCPF(raw: string): boolean {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 || r === 11 ? 0 : r
  }
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10])
}

const STATE_MAP: Record<string, string> = {
  'acre':'AC','alagoas':'AL','amapá':'AP','amapa':'AP','amazonas':'AM',
  'bahia':'BA','ceará':'CE','ceara':'CE','distrito federal':'DF',
  'espírito santo':'ES','espirito santo':'ES','goiás':'GO','goias':'GO',
  'maranhão':'MA','maranhao':'MA','mato grosso do sul':'MS','mato grosso':'MT',
  'minas gerais':'MG','pará':'PA','para':'PA','paraíba':'PB','paraiba':'PB',
  'paraná':'PR','parana':'PR','pernambuco':'PE','piauí':'PI','piaui':'PI',
  'rio de janeiro':'RJ','rio grande do norte':'RN','rio grande do sul':'RS',
  'rondônia':'RO','rondonia':'RO','roraima':'RR','santa catarina':'SC',
  'são paulo':'SP','sao paulo':'SP','sergipe':'SE','tocantins':'TO',
}

function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  return d
}

function normalizeStateAbbr(raw: string): string {
  if (!raw) return ''
  const t = raw.trim().toLowerCase()
  if (t.length === 2) return raw.trim().toUpperCase()
  return STATE_MAP[t] ?? raw.trim().toUpperCase().slice(0, 2)
}

/** Finds the best matching inventory item for a raw produto string */
function matchInventoryItem(produto: string, invItems: DbItem[]): DbItem | undefined {
  if (!produto || produto === '—') return undefined
  const p = produto.toLowerCase().trim()
  // Exact match
  let found = invItems.find(it => it.name.toLowerCase() === p)
  if (found) return found
  // Inventory name includes produto token (e.g. "100K" inside "PLACA 100K")
  found = invItems.find(it => it.name.toLowerCase().includes(p))
  if (found) return found
  // Produto includes inventory name token
  found = invItems.find(it => p.includes(it.name.toLowerCase()))
  return found
}

const TABS = ['Itens Internos', 'Premiações', 'Integrações'];

export default function EstoquePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !user) navigate('/login'); }, [user, loading, navigate]);
  if (loading || !user) return null;
  return <EstoqueContent />;
}

function EstoqueContent() {
  const toast = useToast();
  const [tab, setTab]     = useState('Itens Internos');
  const [items, setItems] = useState<DbItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving]   = useState(false);
  const [modal, setModal]     = useState(false);
  const [editItem, setEditItem] = useState<DbItem | null>(null);
  const [form, setForm] = useState({ name: '', category: '', qty: '', unit: '' });
  const [apiKey, setApiKey] = useState('ME-sk-••••••••••••••••••••••••');
  const [webhook, setWebhook] = useState('https://api.cakto.com.br/webhooks/estoque');
  const [webhookWa, setWebhookWa] = useState(() => localStorage.getItem('webhookWa') ?? '');
  const [searchItems, setSearchItems] = useState('');

  // ── Submissions (Premiações / Logística) ──────────────────────────────────
  const [submissions, setSubmissions]         = useState<Submission[]>([]);
  const [subSearch, setSubSearch]             = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState('Todos');
  const [subShowNoStock, setSubShowNoStock]   = useState(false);
  const [subDeleteId, setSubDeleteId]         = useState<string | null>(null);
  const [subEditRow, setSubEditRow]           = useState<Submission | null>(null);
  const [subEditData, setSubEditData]         = useState<Record<string, string>>({});
  const [subEditStatus, setSubEditStatus]     = useState('Pendente');
  const [subEditPremioId, setSubEditPremioId] = useState('');
  const [subEditExtras, setSubEditExtras]     = useState<ExtraItem[]>([]);
  const [subEditExtraSelect, setSubEditExtraSelect] = useState('');
  const [subEditTracking, setSubEditTracking] = useState('');
  const [cartingId,     setCartingId]     = useState<string | null>(null);
  const [syncingId,     setSyncingId]     = useState<string | null>(null);
  const [sendingWaId,   setSendingWaId]   = useState<string | null>(null);
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [subEditCarrier, setSubEditCarrier]   = useState('');
  const [subIsSaving, setSubIsSaving]         = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [{ data: inv, error: ie }, { data: subs, error: se }] = await Promise.all([
        supabase.from('inventory').select('id,name,category,qty,unit').order('name'),
        supabase.from('form_submissions').select('id,form_id,data,submitted_at,status,tracking_code,carrier,me_cart_id').order('submitted_at', { ascending: false }),
      ]);
      if (ie) toast(ie.message, 'error');
      if (se) toast(se.message, 'error');
      if (inv) setItems(inv as DbItem[]);
      if (subs) setSubmissions(subs as Submission[]);
      setIsLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Inventory CRUD ─────────────────────────────────────────────────────────
  function openNew() {
    setEditItem(null);
    setForm({ name: '', category: '', qty: '', unit: '' });
    setModal(true);
  }
  function openEdit(item: DbItem) {
    setEditItem(item);
    setForm({ name: item.name, category: item.category, qty: String(item.qty), unit: item.unit });
    setModal(true);
  }
  async function saveItem() {
    if (!form.name || !form.qty) return;
    setIsSaving(true);
    if (editItem) {
      const patch = { name: form.name, category: form.category, qty: Number(form.qty), unit: form.unit };
      const { error } = await supabase.from('inventory').update(patch).eq('id', editItem.id);
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      setItems(p => p.map(it => it.id === editItem.id ? { ...it, ...patch } : it));
      toast('Item atualizado!', 'success');
    } else {
      const row = { name: form.name, category: form.category, qty: Number(form.qty), unit: form.unit };
      const { data, error } = await supabase.from('inventory').insert(row).select().single();
      setIsSaving(false);
      if (error) { toast(error.message, 'error'); return; }
      setItems(p => [...p, data as DbItem]);
      toast('Item adicionado!', 'success');
    }
    setModal(false);
  }
  async function deleteItem(id: string) {
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setItems(p => p.filter(it => it.id !== id));
    toast('Item removido', 'info');
  }

  // ── Submission helpers ─────────────────────────────────────────────────────
  /** Returns the matched DbItem for a submission (via _premio_id or fuzzy name match) */
  function getSubInvItem(sub: Submission): DbItem | undefined {
    if (sub.data._premio_id) return items.find(it => it.id === sub.data._premio_id)
    return matchInventoryItem(extractProduto(sub.data), items)
  }

  // ── Demand analysis (memoized) ─────────────────────────────────────────────
  const demandMap = useMemo(() => {
    const map = new Map<string, number>() // inventory id → pending count
    submissions.filter(s => s.status === 'Pendente').forEach(s => {
      const inv = getSubInvItem(s)
      if (inv) map.set(inv.id, (map.get(inv.id) || 0) + 1)
    })
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissions, items])

  const criticalItems = useMemo(
    () => items.filter(it => (demandMap.get(it.id) || 0) > it.qty),
    [items, demandMap]
  )

  // ── Submission actions ─────────────────────────────────────────────────────
  async function updateSubStatus(id: string, status: string) {
    const { error } = await supabase.from('form_submissions').update({ status }).eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setSubmissions(p => p.map(s => s.id === id ? { ...s, status } : s));
  }

  async function deleteSubmission(id: string) {
    const sub = submissions.find(s => s.id === id);
    const { error } = await supabase.from('form_submissions').delete().eq('id', id);
    if (error) { toast(error.message, 'error'); return; }
    setSubmissions(p => p.filter(s => s.id !== id));
    if (sub) {
      const { data: f } = await supabase.from('forms').select('responses').eq('id', sub.form_id).single();
      if (f) supabase.from('forms').update({ responses: Math.max(0, (f.responses || 1) - 1) }).eq('id', sub.form_id);
    }
    toast('Envio removido.', 'info');
    setSubDeleteId(null);
  }

  function openSubEdit(row: Submission) {
    setSubEditRow(row);
    setSubEditStatus(row.status);
    // Separate internal keys from editable data
    const { _premio_id, _extras, ...editableData } = row.data;
    setSubEditData(editableData);
    setSubEditPremioId(_premio_id || '');
    // Parse extras list
    let extras: ExtraItem[] = [];
    if (_extras) {
      try {
        const ids = JSON.parse(_extras) as string[];
        extras = ids.map(id => {
          const inv = items.find(it => it.id === id);
          return inv ? { id, name: inv.name } : null;
        }).filter(Boolean) as ExtraItem[];
      } catch { /* ignore */ }
    }
    setSubEditExtras(extras);
    setSubEditExtraSelect('');
    setSubEditTracking(row.tracking_code || '');
    setSubEditCarrier(row.carrier || '');
  }

  async function saveSubEdit() {
    if (!subEditRow) return;
    setSubIsSaving(true);

    // Build data payload (include internal tracking fields)
    const newData: Record<string, string> = { ...subEditData };
    if (subEditPremioId) newData._premio_id = subEditPremioId;
    if (subEditExtras.length > 0) newData._extras = JSON.stringify(subEditExtras.map(e => e.id));

    // Auto-promote to Em Trânsito when a tracking code is added from Pendente
    const finalStatus =
      subEditTracking.trim() && subEditStatus === 'Pendente'
        ? 'Em Trânsito'
        : subEditStatus;

    const { error } = await supabase.from('form_submissions')
      .update({ data: newData, status: finalStatus, tracking_code: subEditTracking.trim(), carrier: subEditCarrier.trim() })
      .eq('id', subEditRow.id);
    if (error) { toast(error.message, 'error'); setSubIsSaving(false); return; }

    // Decrement inventory when transitioning from Pendente → Em Trânsito / Entregue
    const wasNotDispatched = subEditRow.status === 'Pendente';
    const nowDispatched    = finalStatus === 'Em Trânsito' || finalStatus === 'Entregue';
    if (wasNotDispatched && nowDispatched) {
      const toDecrement: string[] = [];
      if (subEditPremioId) toDecrement.push(subEditPremioId);
      subEditExtras.forEach(e => toDecrement.push(e.id));

      for (const itemId of toDecrement) {
        const inv = items.find(it => it.id === itemId);
        if (inv && inv.qty > 0) {
          void (async () => {
            await supabase.from('inventory').update({ qty: inv.qty - 1 }).eq('id', itemId);
          })();
          setItems(p => p.map(it => it.id === itemId ? { ...it, qty: Math.max(0, it.qty - 1) } : it));
        }
      }
      if (toDecrement.length > 0) toast('Estoque decrementado automaticamente.', 'info');
    }

    setSubmissions(p => p.map(s => s.id === subEditRow.id
      ? { ...s, data: newData, status: finalStatus, tracking_code: subEditTracking.trim(), carrier: subEditCarrier.trim() }
      : s));
    setSubEditRow(null);
    setSubIsSaving(false);
    toast('Envio atualizado!', 'success');
  }

  // ── Melhor Envio integration ──────────────────────────────────────────────
  async function addToCart(row: Submission) {
    setCartingId(row.id)
    const meta      = extractMeta(row.data)
    const dims      = getDimensions(meta)
    const recipient = extractRecipient(row.data)

    const payload = {
      service: 1, // Correios PAC — altere conforme necessário
      from: {
        name:        import.meta.env.VITE_ME_FROM_NAME        || 'Cakto',
        phone:       import.meta.env.VITE_ME_FROM_PHONE       || '11999999999',
        email:       import.meta.env.VITE_ME_FROM_EMAIL       || 'envios@cakto.com.br',
        document:    import.meta.env.VITE_ME_FROM_DOCUMENT    || '00000000000000',
        address:     import.meta.env.VITE_ME_FROM_ADDRESS     || 'Rua Exemplo',
        number:      import.meta.env.VITE_ME_FROM_NUMBER      || '100',
        district:    import.meta.env.VITE_ME_FROM_DISTRICT    || 'Centro',
        city:        import.meta.env.VITE_ME_FROM_CITY        || 'São Paulo',
        state_abbr:  import.meta.env.VITE_ME_FROM_STATE       || 'SP',
        country_id:  'BR',
        postal_code: import.meta.env.VITE_ME_FROM_POSTAL_CODE || '01310100',
      },
      to: recipient,
      volumes: [{ height: dims.height, width: dims.width, length: dims.length, weight: dims.weight }],
      products: [{ name: meta || 'Premiação', quantity: 1, unitary_value: 1 }],
      options: { insurance_value: 0, receipt: false, own_hand: false, reverse: false, non_commercial: true },
      // ID único da submission — permite match exato no sync-bulk sem depender de CPF
      tags: [row.id],
    }

    // Valida CPF do destinatário
    const recipientDoc = recipient.document?.replace(/\D/g, '') ?? ''
    if (recipientDoc && !isValidCPF(recipientDoc)) {
      setCartingId(null)
      toast('O CPF do cliente é inválido. Corrija os dados da resposta antes de enviar.', 'error')
      return
    }

    // Valida telefone (mínimo DDD + 8 dígitos = 10)
    if (recipient.phone && recipient.phone.length < 10) {
      setCartingId(null)
      toast(`Telefone inválido (${recipient.phone}). Corrija os dados da resposta.`, 'error')
      return
    }

    // Valida UF (exatamente 2 letras)
    if (!recipient.state_abbr || recipient.state_abbr.length !== 2 || /\d/.test(recipient.state_abbr)) {
      setCartingId(null)
      toast(`Estado inválido ("${recipient.state_abbr || '—'}"). Corrija para a sigla UF (ex: SC, SP).`, 'error')
      return
    }

    const { data: fnData, error: fnErr } = await supabase.functions.invoke('me-proxy', {
      body: { action: 'cart', payload },
    })
    setCartingId(null)

    if (fnErr) {
      console.error('[addToCart] invoke error:', fnErr)
      toast(fnErr.message || 'Erro ao chamar Edge Function', 'error')
      return
    }
    if (fnData?.error || fnData?.errors || fnData?.message) {
      const msg = fnData?.message || JSON.stringify(fnData?.errors ?? fnData?.error)
      console.error('[addToCart] ME API error:', fnData)
      toast(`ME API: ${msg}`, 'error')
      return
    }

    const cartId: string = fnData?.id ?? ''
    if (!cartId) {
      console.error('[addToCart] resposta sem id:', fnData)
      toast('ME API não retornou ID do carrinho', 'error')
      return
    }

    // Só persiste APÓS confirmação real da ME API
    const { error: dbErr } = await supabase.from('form_submissions')
      .update({ me_cart_id: cartId, status: 'No Carrinho' })
      .eq('id', row.id)
    if (dbErr) { toast(dbErr.message, 'error'); return }

    setSubmissions(p => p.map(s => s.id === row.id
      ? { ...s, me_cart_id: cartId, status: 'No Carrinho' }
      : s))
    toast('Prêmio enviado com sucesso para o carrinho do Melhor Envio!', 'success')
  }

  // ── WhatsApp webhook ─────────────────────────────────────────────────────
  async function triggerWhatsAppWebhook(row: Submission, trackingCode: string, manual = false) {
    if (!webhookWa) { if (manual) toast('Configure a URL do Webhook WhatsApp nas Integrações.', 'info'); return }
    if (manual) setSendingWaId(row.id)
    const r   = extractRecipient(row.data)
    const cpf = Object.values(row.data).find(v => /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(String(v)) || /^\d{11}$/.test(String(v))) ?? ''
    const payload = {
      nome:          extractNome(row.data),
      telefone:      r.phone,
      cpf:           String(cpf).replace(/\D/g, ''),
      email:         r.email,
      rastreio:      trackingCode,
      link_rastreio: meTrackingPath(trackingCode, row.carrier || ''),
    }
    try {
      await fetch(webhookWa, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (manual) toast('Webhook WhatsApp disparado!', 'success')
    } catch (e) {
      console.error('[webhookWa]', e)
      if (manual) toast('Falha ao disparar webhook WhatsApp.', 'error')
    } finally {
      if (manual) setSendingWaId(null)
    }
  }

  async function syncTracking(row: Submission) {
    // Extrai CPF/CNPJ dos dados do cliente (campo com chave cpf/cnpj/documento, ou valor com 11/14 dígitos)
    const extractDoc = (): string => {
      // Prioriza campo com nome sugestivo
      const byKey = Object.entries(row.data).find(([k]) => /cpf|cnpj|documento|document/i.test(k))
      if (byKey) return String(byKey[1]).replace(/\D/g, '')
      // Fallback: primeiro valor que tenha 11 dígitos (CPF)
      return Object.values(row.data).map(v => String(v).replace(/\D/g, '')).find(v => v.length === 11) ?? ''
    }
    const document = extractDoc()

    // Extrai hint de dimensão dos dados da submission (ex: "250K", "100k") para desempate no ME
    const DIMENSION_KEYS = ['100k', '250k', '500k', '1m', '2m', '5m', '10m']
    const allDataText = Object.values(row.data).map(v => String(v).toLowerCase()).join(' ')
    const product_hint = DIMENSION_KEYS.find(k => allDataText.includes(k)) ?? ''
    console.log('[syncTracking] doc extraído:', document, '| me_cart_id:', row.me_cart_id, '| product_hint:', product_hint)

    setSyncingId(row.id)
    const { data: fnData, error: fnErr } = await supabase.functions.invoke('me-proxy', {
      body: { action: 'sync-tracking', payload: { me_cart_id: row.me_cart_id || '', document, product_hint } },
    })
    setSyncingId(null)

    if (fnErr) {
      console.error('[syncTracking] invoke error:', fnErr)
      toast(fnErr.message || 'Erro ao chamar Edge Function', 'error')
      return
    }
    if (fnData?.error) {
      console.error('[syncTracking] error:', fnData.error)
      toast(fnData.error, 'error')
      return
    }
    if (fnData?.reset) {
      await supabase.from('form_submissions').update({ me_cart_id: '', status: 'Pendente' }).eq('id', row.id)
      setSubmissions(p => p.map(s => s.id === row.id ? { ...s, me_cart_id: '', status: 'Pendente' } : s))
      toast('Item não encontrado no ME. Carrinho resetado — tente gerar novamente.', 'info')
      return
    }
    if (!fnData?.found) {
      toast('Nenhum pedido encontrado no Melhor Envio para este cliente.', 'info')
      return
    }

    const { me_cart_id: foundCartId, tracking, status: meStatus } = fnData as { me_cart_id: string; tracking: string; status: string }
    const patch: Record<string, string> = { status: meStatus }
    if (foundCartId) patch.me_cart_id = foundCartId
    if (tracking) patch.tracking_code = tracking

    const { error: dbErr } = await supabase.from('form_submissions').update(patch).eq('id', row.id)
    if (dbErr) { toast(dbErr.message, 'error'); return }
    setSubmissions(p => p.map(s => s.id === row.id ? { ...s, ...patch } : s))

    const code = tracking
    if (!code) { toast('Pedido localizado, etiqueta ainda não gerada/paga no ME.', 'info'); return }

    toast(`Rastreio sincronizado: ${code}`, 'success')
    // Dispara webhook WhatsApp automaticamente (individual apenas)
    void triggerWhatsAppWebhook(row, code)
  }

  async function bulkSync() {
    setIsBulkSyncing(true)
    toast('Buscando pedidos no Melhor Envio…', 'info')

    const { data: fnData, error: fnErr } = await supabase.functions.invoke('me-proxy', {
      body: { action: 'sync-bulk' },
    })
    setIsBulkSyncing(false)

    if (fnErr || fnData?.error) {
      console.error('[bulkSync]', fnErr ?? fnData)
      toast(fnData?.message || fnErr?.message || 'Erro na sincronização em massa.', 'error')
      return
    }

    if (fnData?.debug) {
      console.log('🔥 ALERTA DE DEBUG sync-bulk:', fnData.debug)
    }

    const { updated = 0, total = 0 } = fnData as { updated: number; total: number }

    // Re-fetch submissions to reflect DB changes
    const { data: subs } = await supabase
      .from('form_submissions')
      .select('id,form_id,data,submitted_at,status,tracking_code,carrier,me_cart_id')
      .order('submitted_at', { ascending: false })
    if (subs) setSubmissions(subs as Submission[])

    if (updated === 0) {
      toast(`Nenhum pedido atualizado (${total} envios verificados no ME).`, 'info')
    } else {
      toast(`Sincronização forçada concluída! ${updated} código${updated !== 1 ? 's' : ''} corrigido${updated !== 1 ? 's' : ''} (de ${total} envios no ME).`, 'success')
    }
  }

  function addExtra() {
    if (!subEditExtraSelect) return;
    if (subEditExtras.some(e => e.id === subEditExtraSelect)) return;
    const inv = items.find(it => it.id === subEditExtraSelect);
    if (!inv) return;
    setSubEditExtras(p => [...p, { id: inv.id, name: inv.name }]);
    setSubEditExtraSelect('');
  }

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 300, gap: 10, color: 'var(--text2)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 14 }}>Carregando estoque…</span>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em' }}>Estoque</h1>
          {tab === 'Itens Internos' && <Button icon={Plus} onClick={openNew}>Novo Item</Button>}
        </div>

        <PillTabs tabs={TABS} active={tab} onChange={setTab} />

        {/* ── Itens Internos ───────────────────────────────────────────────── */}
        {tab === 'Itens Internos' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Search size={15} color="var(--text2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input className="inp" value={searchItems} onChange={e => setSearchItems(e.target.value)}
                placeholder="Buscar produto..."
                style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box', maxWidth: 360 }} />
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
              <div className="scroll-x">
                <table className="tbl">
                  <thead>
                    <tr><th>Item</th><th>Categoria</th><th>Quantidade</th><th>Unidade</th><th>Ações</th></tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text2)', padding: 32 }}>
                        Nenhum item no estoque.
                      </td></tr>
                    )}
                    {items.filter(it =>
                      !searchItems.trim() ||
                      it.name.toLowerCase().includes(searchItems.toLowerCase()) ||
                      it.category.toLowerCase().includes(searchItems.toLowerCase())
                    ).map(it => (
                      <tr key={it.id}>
                        <td style={{ fontWeight: 600 }}>{it.name}</td>
                        <td><Badge label={it.category || '—'} color="var(--action)" /></td>
                        <td>
                          <span style={{ fontWeight: 700, color: it.qty <= 5 ? 'var(--red)' : it.qty <= 15 ? 'var(--orange)' : 'var(--green)' }}>
                            {it.qty}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text2)', fontSize: 13 }}>{it.unit}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(it)}>Editar</Button>
                            <Button variant="destructive" size="sm" icon={Trash2} onClick={() => deleteItem(it.id)}>Remover</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Premiações / Logística ────────────────────────────────────────── */}
        {tab === 'Premiações' && (() => {
          const filtered = submissions.filter(s => {
            if (subStatusFilter !== 'Todos' && s.status !== subStatusFilter) return false;
            if (subShowNoStock) {
              const inv = getSubInvItem(s);
              if (!inv || inv.qty > 0) return false;
            }
            const term = subSearch.trim().toLowerCase();
            if (term) {
              const publicVals = Object.entries(s.data)
                .filter(([k]) => !k.startsWith('_'))
                .map(([, v]) => String(v).toLowerCase());
              if (!publicVals.some(v => v.includes(term))) return false;
            }
            return true;
          });

          const actionBtn = (color: string): React.CSSProperties => ({
            background: 'none', border: 'none', cursor: 'pointer', color,
            padding: '5px 6px', borderRadius: 6, display: 'flex', alignItems: 'center',
          });

          return (
            <div style={{ marginTop: 20 }}>
              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                {SUB_STATUSES.map(s => (
                  <div key={s} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, cursor: 'pointer',
                    outline: subStatusFilter === s ? `2px solid ${STATUS_COLORS[s]}` : 'none' }}
                    onClick={() => setSubStatusFilter(p => p === s ? 'Todos' : s)}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: STATUS_COLORS[s] }}>
                      {submissions.filter(x => x.status === s).length}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{s}</div>
                  </div>
                ))}
              </div>

              {/* ── Resumo Logístico (Alerta de Estoque Crítico) ──────────── */}
              {criticalItems.length > 0 && (
                <div style={{ background: 'color-mix(in srgb, var(--red) 8%, var(--bg-card))',
                  border: '1px solid color-mix(in srgb, var(--red) 30%, var(--border))',
                  borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <AlertTriangle size={16} color="var(--red)" />
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--red)' }}>
                      Estoque Crítico — {criticalItems.length} {criticalItems.length === 1 ? 'item' : 'itens'} abaixo da demanda pendente
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {criticalItems.map(it => {
                      const pending = demandMap.get(it.id) || 0;
                      const faltam  = pending - it.qty;
                      return (
                        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                          background: 'var(--bg-card)', borderRadius: 8, padding: '8px 12px',
                          border: '1px solid var(--border)', fontSize: 13 }}>
                          <Package size={14} color="var(--red)" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, flex: 1 }}>{it.name}</span>
                          <span style={{ color: 'var(--orange)', fontWeight: 600, fontSize: 12 }}>
                            {pending} pendente{pending !== 1 ? 's' : ''}
                          </span>
                          <span style={{ color: 'var(--text2)', fontSize: 12 }}>|</span>
                          <span style={{ color: it.qty === 0 ? 'var(--red)' : 'var(--orange)', fontWeight: 600, fontSize: 12 }}>
                            {it.qty} em estoque
                          </span>
                          <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 20,
                            padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            Faltam {faltam}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 250, maxWidth: 360 }}>
                  <Search size={15} color="var(--text2)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input className="inp" value={subSearch} onChange={e => setSubSearch(e.target.value)}
                    placeholder="Buscar por nome, CPF, produto…"
                    style={{ paddingLeft: 36, width: '100%', boxSizing: 'border-box' }} />
                </div>
                {/* Status pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['Todos', ...SUB_STATUSES] as const).map(s => (
                    <button key={s} onClick={() => setSubStatusFilter(s)}
                      style={{ padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        background: subStatusFilter === s ? (STATUS_COLORS[s] || 'var(--action)') : 'var(--bg-card2)',
                        color: subStatusFilter === s ? '#fff' : 'var(--text2)', transition: 'background .15s' }}>
                      {s}
                    </button>
                  ))}
                  {/* Sem estoque toggle */}
                  <button onClick={() => setSubShowNoStock(p => !p)}
                    style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${subShowNoStock ? 'var(--red)' : 'transparent'}`,
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: subShowNoStock ? 'color-mix(in srgb, var(--red) 18%, var(--bg-card2))' : 'var(--bg-card2)',
                      color: subShowNoStock ? 'var(--red)' : 'var(--text2)', transition: 'background .15s',
                      display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertTriangle size={11} />
                    Sem estoque
                  </button>
                </div>
                {/* Sincronização retroativa em massa */}
                <button onClick={bulkSync} disabled={isBulkSyncing}
                  style={{ padding: '5px 12px', borderRadius: 20,
                    border: `1px solid ${isBulkSyncing ? 'var(--border)' : 'var(--purple)'}`,
                    cursor: isBulkSyncing ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: isBulkSyncing
                      ? 'var(--bg-card2)'
                      : 'color-mix(in srgb, var(--purple) 12%, var(--bg-card2))',
                    color: isBulkSyncing ? 'var(--text2)' : 'var(--purple)',
                    opacity: isBulkSyncing ? 0.7 : 1, transition: 'all .15s' }}>
                  {isBulkSyncing
                    ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                    : <RefreshCw size={11} />}
                  {isBulkSyncing ? 'Sincronizando…' : 'Sincronizar Pedidos Antigos'}
                </button>
                {/* Sync rastreio de todos com me_cart_id sem tracking */}
                {submissions.some(s => s.me_cart_id && !s.tracking_code) && (
                  <button
                    onClick={() => {
                      const pending = submissions.filter(s => s.me_cart_id && !s.tracking_code)
                      pending.forEach(s => syncTracking(s))
                    }}
                    style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--action)',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
                      background: 'color-mix(in srgb, var(--action) 10%, var(--bg-card2))', color: 'var(--action)' }}>
                    <Truck size={11} />
                    Sincronizar Rastreio
                  </button>
                )}
                <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {filtered.length} de {submissions.length}
                </span>
              </div>

              {/* Table */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden',
                maxHeight: '60vh', overflowY: 'auto', overflowX: 'auto',
                boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {(['Cliente', 'Meta', 'Produto/Prêmio', 'Rastreio', 'Data', 'Status'] as const).map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                          color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap',
                          background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 10,
                          borderBottom: '1px solid var(--border)', backdropFilter: 'blur(8px)' }}>{h}</th>
                      ))}
                      <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700,
                        color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em',
                        background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 10,
                        borderBottom: '1px solid var(--border)', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text2)', padding: 40, fontSize: 13 }}>
                        {subSearch || subStatusFilter !== 'Todos' || subShowNoStock
                          ? 'Nenhum resultado encontrado.'
                          : 'Nenhum envio registrado.'}
                      </td></tr>
                    )}
                    {filtered.map((row, i) => {
                      const invItem  = getSubInvItem(row);
                      const noStock  = invItem ? invItem.qty === 0 : false;
                      const prodName = invItem ? invItem.name : extractProduto(row.data);
                      const rowBg    = noStock
                        ? (i % 2 === 0 ? 'color-mix(in srgb, var(--red) 6%, var(--bg-card))' : 'color-mix(in srgb, var(--red) 10%, var(--bg-card2))')
                        : (i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)');

                      return (
                        <tr key={row.id} style={{ background: rowBg, transition: 'background .15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = noStock
                            ? 'color-mix(in srgb, var(--red) 14%, var(--bg-card2))'
                            : 'color-mix(in srgb, var(--action) 5%, var(--bg-card2))')}
                          onMouseLeave={e => (e.currentTarget.style.background = rowBg)}>
                          {/* Cliente */}
                          <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                            {extractNome(row.data)}
                          </td>
                          {/* Meta */}
                          <td style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                            {(() => { const m = extractMeta(row.data); return m
                              ? <span style={metaBadgeStyle(m)}>{m}</span>
                              : <span style={{ color: 'var(--text2)', fontSize: 12 }}>—</span>; })()}
                          </td>
                          {/* Produto/Prêmio */}
                          <td style={{ padding: '11px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{prodName}</span>
                              {noStock && (
                                <span style={{ background: 'var(--red)', color: '#fff', fontSize: 10,
                                  fontWeight: 700, padding: '1px 7px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                                  SEM ESTOQUE
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Rastreio */}
                          <td style={{ padding: '11px 16px', fontSize: 12, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                            {row.tracking_code ? (
                              <a href={trackingUrl(row.tracking_code, row.carrier)} target="_blank" rel="noreferrer"
                                style={{ color: 'var(--action)', fontWeight: 600, textDecoration: 'none',
                                  display: 'flex', alignItems: 'center', gap: 4 }}>
                                {row.tracking_code}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                              </a>
                            ) : (
                              <button onClick={() => syncTracking(row)} disabled={syncingId === row.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none',
                                  border: `1px solid ${syncingId === row.id ? 'var(--border)' : row.me_cart_id ? 'var(--action)' : 'var(--text2)'}`,
                                  borderRadius: 20, padding: '3px 10px', cursor: syncingId === row.id ? 'default' : 'pointer',
                                  fontSize: 11, fontWeight: 700,
                                  color: syncingId === row.id ? 'var(--text2)' : row.me_cart_id ? 'var(--action)' : 'var(--text2)',
                                  opacity: syncingId === row.id ? 0.6 : 1, transition: 'opacity .15s' }}>
                                {syncingId === row.id
                                  ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                                  : <RefreshCw size={10} />}
                                {syncingId === row.id ? 'Buscando…' : row.me_cart_id ? 'Sincronizar' : 'Buscar por CPF'}
                              </button>
                            )}
                          </td>
                          {/* Data */}
                          <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--text2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                            {new Date(row.submitted_at).toLocaleDateString('pt-BR')}
                          </td>
                          <td style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                            <select value={row.status} onChange={e => updateSubStatus(row.id, e.target.value)}
                              style={{ background: `color-mix(in srgb, ${STATUS_COLORS[row.status] || 'var(--text2)'} 18%, var(--bg-card2))`,
                                color: STATUS_COLORS[row.status] || 'var(--text2)',
                                border: `1px solid ${STATUS_COLORS[row.status] || 'var(--border)'}`,
                                borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700,
                                cursor: 'pointer', outline: 'none' }}>
                              {SUB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {/* Gerar no Carrinho ME */}
                              {!row.me_cart_id ? (
                                <button onClick={() => addToCart(row)}
                                  disabled={cartingId === row.id}
                                  title="Gerar no Carrinho ME"
                                  style={{ ...actionBtn('var(--purple)'), opacity: cartingId === row.id ? 0.5 : 1 }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--purple) 12%, transparent)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                  {cartingId === row.id
                                    ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                    : <ShoppingCart size={13} />}
                                </button>
                              ) : !row.tracking_code ? (
                                <button onClick={() => syncTracking(row)}
                                  disabled={syncingId === row.id}
                                  title="Sincronizar Rastreio"
                                  style={{ ...actionBtn('var(--action)'), opacity: syncingId === row.id ? 0.5 : 1 }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--action) 12%, transparent)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                  {syncingId === row.id
                                    ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                    : <Truck size={13} />}
                                </button>
                              ) : null}
                              {/* Disparar WhatsApp webhook manualmente */}
                              {row.tracking_code && (
                                <button onClick={() => triggerWhatsAppWebhook(row, row.tracking_code, true)}
                                  disabled={sendingWaId === row.id}
                                  title="Enviar notificação WhatsApp"
                                  style={{ ...actionBtn('var(--green)'), opacity: sendingWaId === row.id ? 0.5 : 1 }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 12%, transparent)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                  {sendingWaId === row.id
                                    ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                    : <Send size={13} />}
                                </button>
                              )}
                              <button onClick={() => openSubEdit(row)} title="Editar" style={actionBtn('var(--action)')}
                                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--action) 12%, transparent)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => setSubDeleteId(row.id)} title="Excluir" style={actionBtn('var(--red)')}
                                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--red) 12%, transparent)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ── Integrações ───────────────────────────────────────────────────── */}
        {tab === 'Integrações' && (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in srgb, var(--action) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plug size={20} color="var(--action)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Melhor Envio</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Integração de logística e envio de premiações</div>
                </div>
                <div style={{ marginLeft: 'auto' }}><Badge label="Conectado" color="var(--green)" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="API Key">
                    <input className="inp" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} />
                  </Field>
                </div>
                <Button variant="secondary" icon={RefreshCw} onClick={() => setApiKey('ME-sk-••••••••••••••••••••••••')}>Renovar</Button>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in srgb, var(--purple) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Link size={20} color="var(--purple)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Webhook de Estoque</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Receba notificações quando o estoque for atualizado</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="URL do Webhook">
                    <input className="inp" value={webhook} onChange={e => setWebhook(e.target.value)} />
                  </Field>
                </div>
                <Button variant="secondary" icon={Copy} onClick={() => navigator.clipboard.writeText(webhook)}>Copiar</Button>
              </div>
            </div>

            {/* Webhook WhatsApp */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in srgb, var(--green) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={20} color="var(--green)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>Webhook WhatsApp (Datacrazy)</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Notifica o cliente via WhatsApp quando o rastreio é sincronizado. Não é disparado pelo sync em massa.</div>
                </div>
                {webhookWa && <div style={{ marginLeft: 'auto' }}><Badge label="Configurado" color="var(--green)" /></div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="URL do Webhook">
                    <input className="inp" value={webhookWa}
                      onChange={e => { setWebhookWa(e.target.value); localStorage.setItem('webhookWa', e.target.value) }}
                      placeholder="https://n8n.seuservidor.com/webhook/..." />
                  </Field>
                </div>
                <Button variant="secondary" icon={Copy} onClick={() => navigator.clipboard.writeText(webhookWa)}>Copiar</Button>
              </div>
              <div style={{ marginTop: 12, background: 'var(--bg-card2)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Payload enviado (POST)</div>
                <pre style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>{`{
  "nome":     "João Silva",
  "telefone": "47999999999",
  "cpf":      "12345678901",
  "email":    "joao@email.com",
  "rastreio": "AV081779120BR"
}`}</pre>
              </div>
            </div>

            {/* API Inversa — atualização externa de rastreio */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'color-mix(in srgb, var(--orange) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RefreshCw size={20} color="var(--orange)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>API Inversa — Atualização de Rastreio</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Sistemas externos podem atualizar status e rastreio via PATCH</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Endpoint */}
                <div style={{ background: 'var(--bg-card2)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>
                  <span style={{ color: 'var(--orange)', fontWeight: 700 }}>PATCH </span>
                  <span style={{ color: 'var(--text2)' }}>/rest/v1/form_submissions?id=eq.</span>
                  <span style={{ color: 'var(--action)' }}>{'{submission_id}'}</span>
                </div>
                {/* Headers */}
                <div style={{ background: 'var(--bg-card2)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Headers obrigatórios</div>
                  {[
                    ['apikey', '<SERVICE_ROLE_KEY>'],
                    ['Authorization', 'Bearer <SERVICE_ROLE_KEY>'],
                    ['Content-Type', 'application/json'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                      <span style={{ color: 'var(--action)', fontFamily: 'monospace' }}>{k}:</span>
                      <span style={{ color: 'var(--text2)', fontFamily: 'monospace' }}>{v}</span>
                    </div>
                  ))}
                </div>
                {/* Body */}
                <div style={{ background: 'var(--bg-card2)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text2)', marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Body (JSON)</div>
                  <pre style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>{`{
  "status": "Em Trânsito",
  "tracking_code": "BR123456789BR",
  "carrier": "Correios"
}`}</pre>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={11} />
                  Use a chave <strong>service_role</strong> (nunca a anon) — mantenha-a no backend, nunca no frontend.
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Documentação da API Interna</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { method: 'GET',    path: '/api/estoque',     desc: 'Listar todos os itens' },
                  { method: 'POST',   path: '/api/estoque',     desc: 'Criar novo item' },
                  { method: 'PUT',    path: '/api/estoque/:id', desc: 'Atualizar item' },
                  { method: 'DELETE', path: '/api/estoque/:id', desc: 'Remover item' },
                ].map(ep => (
                  <div key={ep.path} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-card2)', borderRadius: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, minWidth: 48,
                      color: ep.method === 'GET' ? 'var(--green)' : ep.method === 'POST' ? 'var(--action)' : ep.method === 'PUT' ? 'var(--orange)' : 'var(--red)' }}>
                      {ep.method}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, flex: 1 }}>{ep.path}</span>
                    <span style={{ fontSize: 12, color: 'var(--text2)' }}>{ep.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Novo/Editar Item ────────────────────────────────────────── */}
        <Modal open={modal} onClose={() => setModal(false)} title={editItem ? 'Editar Item' : 'Novo Item'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Nome do Item">
              <input className="inp" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Caneta azul" />
            </Field>
            <Field label="Categoria">
              <input className="inp" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Ex: Material de Escritório" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Quantidade">
                <input className="inp" type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Unidade">
                <input className="inp" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="Ex: un, cx, kg" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
              <Button onClick={saveItem} disabled={isSaving}>
                {editItem ? (isSaving ? 'Salvando…' : 'Salvar') : (isSaving ? 'Adicionando…' : 'Adicionar')}
              </Button>
            </div>
          </div>
        </Modal>

        {/* ── Modal: Excluir Envio ───────────────────────────────────────────── */}
        <Modal open={subDeleteId !== null} onClose={() => setSubDeleteId(null)} title="Excluir Envio">
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            Esta ação é irreversível. O envio será removido e o contador de respostas do formulário será decrementado.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setSubDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" icon={Trash2} onClick={() => deleteSubmission(subDeleteId!)}>Excluir</Button>
          </div>
        </Modal>

        {/* ── Modal: Editar Envio (com gestão de estoque) ───────────────────── */}
        <Modal open={subEditRow !== null} onClose={() => setSubEditRow(null)} title="Editar Dados do Envio">
          {/* Corpo com scroll */}
          <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Status + Prêmio em 2 colunas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Status">
                <select className="inp" value={subEditStatus} onChange={e => setSubEditStatus(e.target.value)}
                  style={{ color: STATUS_COLORS[subEditStatus] || 'var(--text)', fontWeight: 700 }}>
                  {SUB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Prêmio Principal">
                <select className="inp" value={subEditPremioId} onChange={e => setSubEditPremioId(e.target.value)}>
                  <option value="">— Selecione —</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.name}{it.qty === 0 ? ' [SEM ESTOQUE]' : ` (${it.qty})`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Rastreio + Transportadora em 2 colunas */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <Field label="Código de Rastreio">
                <input className="inp" value={subEditTracking}
                  onChange={e => setSubEditTracking(e.target.value)}
                  placeholder="Ex: BR123456789BR" />
              </Field>
              <Field label="Transportadora">
                <input className="inp" value={subEditCarrier}
                  onChange={e => setSubEditCarrier(e.target.value)}
                  placeholder="Ex: Correios" />
              </Field>
            </div>

            {/* Itens Extras — linha inteira */}
            <Field label="Itens Extras">
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="inp" value={subEditExtraSelect} onChange={e => setSubEditExtraSelect(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Adicionar item extra…</option>
                  {items.filter(it => !subEditExtras.some(e => e.id === it.id) && it.id !== subEditPremioId).map(it => (
                    <option key={it.id} value={it.id}>
                      {it.name}{it.qty === 0 ? ' [SEM ESTOQUE]' : ` (${it.qty})`}
                    </option>
                  ))}
                </select>
                <button onClick={addExtra} disabled={!subEditExtraSelect}
                  style={{ padding: '0 14px', background: 'var(--action)', color: '#fff', border: 'none',
                    borderRadius: 8, cursor: subEditExtraSelect ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13,
                    opacity: subEditExtraSelect ? 1 : 0.5 }}>+</button>
              </div>
              {subEditExtras.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {subEditExtras.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 5,
                      background: 'color-mix(in srgb, var(--action) 12%, var(--bg-card2))',
                      border: '1px solid color-mix(in srgb, var(--action) 30%, var(--border))',
                      borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                      <span>{e.name}</span>
                      <button onClick={() => setSubEditExtras(p => p.filter(x => x.id !== e.id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                          display: 'flex', alignItems: 'center', color: 'var(--text2)' }}>
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Field>

            {/* Info: auto-promoção de status */}
            {subEditTracking.trim() && subEditStatus === 'Pendente' && (
              <div style={{ background: 'color-mix(in srgb, var(--action) 10%, var(--bg-card2))',
                border: '1px solid color-mix(in srgb, var(--action) 30%, var(--border))',
                borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--action)', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={13} />
                Status será promovido para "Em Trânsito" automaticamente.
              </div>
            )}

            {/* Campos do formulário em grid 2 colunas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {Object.keys(subEditData).map(key => {
                // Campos longos ocupam 2 colunas
                const wide = /nome|endereço|rua|logradouro|address|email|complemento/i.test(key)
                return (
                  <div key={key} style={{ gridColumn: wide ? 'span 2' : 'span 1' }}>
                    <Field label={key}>
                      <input className="inp" value={subEditData[key] || ''}
                        onChange={e => setSubEditData(p => ({ ...p, [key]: e.target.value }))} />
                    </Field>
                  </div>
                )
              })}
            </div>

            {/* Aviso de decremento */}
            {subEditRow?.status === 'Pendente' &&
              (subEditStatus === 'Em Trânsito' || subEditStatus === 'Entregue' ||
               (subEditTracking.trim() && subEditStatus === 'Pendente')) && (
              <div style={{ background: 'color-mix(in srgb, var(--orange) 10%, var(--bg-card2))',
                border: '1px solid color-mix(in srgb, var(--orange) 30%, var(--border))',
                borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--orange)', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} />
                O estoque será decrementado automaticamente ao salvar.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <Button variant="secondary" onClick={() => setSubEditRow(null)}>Cancelar</Button>
            <Button onClick={saveSubEdit} disabled={subIsSaving}>{subIsSaving ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </Modal>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
