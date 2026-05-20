import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/client'

type FormField = {
  id: number; type: string; label: string
  placeholder?: string; required: boolean; options?: string
  width?: 'full' | 'half'
  inventory_linked?: boolean
}

type InventoryItem = { id: string; name: string; qty: number }

type DbForm = {
  id: string; name: string; color: string; background_image: string
  fields: unknown; webhook: string; active: boolean; status: string
  bg_color: string; field_bg_color: string; field_text_color: string
  bg_opacity: number; redirect_url: string
  logo_url: string; logo_width: number; custom_domain: string
}

interface Props {
  customDomain?: string
}

/* ── Custom Select ─────────────────────────────────────────── */
function CustomSelect({
  options, value, onChange, placeholder, baseStyle,
}: {
  options: string[]; value: string; onChange: (v: string) => void
  placeholder?: string; baseStyle: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...baseStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ opacity: value ? 1 : 0.45 }}>{value || placeholder || 'Selecione…'}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
          <path d="M6 8L1 3h10z" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          background: baseStyle.background as string || '#1e293b',
          border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10,
          maxHeight: 240, overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false) }}
              style={{
                padding: '11px 14px', cursor: 'pointer', fontSize: 15,
                color: baseStyle.color as string || '#fff',
                background: value === opt ? 'rgba(255,255,255,0.1)' : 'transparent',
                transition: 'background .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              onMouseLeave={e => (e.currentTarget.style.background = value === opt ? 'rgba(255,255,255,0.1)' : 'transparent')}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Main Component ────────────────────────────────────────── */
export default function PublicForm({ customDomain }: Props) {
  const { formId } = useParams<{ formId: string }>()
  const [form, setForm] = useState<DbForm | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [inventory, setInventory] = useState<InventoryItem[]>([])

  useEffect(() => {
    console.log('[PublicForm] Hostname atual:', window.location.hostname)
    async function load() {
      setLoading(true)
      let query = supabase.from('forms').select(
        'id,name,color,background_image,fields,webhook,active,status,custom_domain,' +
        'bg_color,field_bg_color,field_text_color,bg_opacity,redirect_url,logo_url,logo_width'
      )

      if (customDomain) {
        console.log('[PublicForm] Buscando por custom_domain:', customDomain)
        query = query.eq('custom_domain', customDomain)
      } else if (formId) {
        console.log('[PublicForm] Buscando por formId:', formId)
        query = query.eq('id', formId)
      } else {
        setError('Formulário não encontrado.')
        setLoading(false)
        return
      }

      const { data, error: err } = await query.maybeSingle()

      if (err) {
        console.error('[PublicForm] Erro Supabase (pode ser RLS bloqueando anon):', err.message, err.code)
        setError('Formulário não encontrado.'); setLoading(false); return
      }
      if (!data) {
        console.error('[PublicForm] Query retornou null — verifique: (1) o ID está correto, (2) a policy RLS de SELECT para anon na tabela forms existe, (3) status="Publicado" e active=true.')
        setError('Formulário não encontrado.'); setLoading(false); return
      }

      console.log('[PublicForm] Form encontrado:', { id: data.id, status: data.status, active: data.active })

      if (customDomain && data.custom_domain !== customDomain) {
        console.error('[PublicForm] custom_domain não bate:', data.custom_domain, '!=', customDomain)
        setError('Formulário não encontrado.'); setLoading(false); return
      }
      if (!data.active || data.status?.toLowerCase() !== 'publicado') {
        console.error('[PublicForm] Formulário não publicado. status:', data.status, '| active:', data.active)
        setError('Este formulário não está disponível.'); setLoading(false); return
      }
      setForm(data as DbForm)

      // Fetch inventory for linked Select fields (non-blocking if form has no linked fields)
      const parsedFields: FormField[] = Array.isArray(data.fields) ? (data.fields as FormField[]) : []
      if (parsedFields.some(f => f.inventory_linked)) {
        const { data: inv } = await supabase.from('inventory').select('id,name,qty').order('name')
        if (inv) setInventory(inv as InventoryItem[])
      }

      setLoading(false)
    }
    load()
  }, [formId, customDomain])

  const fields: FormField[] = Array.isArray(form?.fields) ? (form!.fields as FormField[]) : []

  // ── Formatters ────────────────────────────────────────────────────────────
  function applyMask(raw: string, field: FormField): string {
    const label = field.label.toLowerCase()

    if (field.type === 'CPF') {
      const d = raw.replace(/\D/g, '').slice(0, 11)
      return d
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
    }

    if (field.type === 'CEP') {
      const d = raw.replace(/\D/g, '').slice(0, 8)
      return d
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2-$3')
    }

    if (field.type === 'Telefone') {
      const d = raw.replace(/\D/g, '').slice(0, 13)
      if (!d) return ''
      let r = '+' + d.slice(0, 2)
      if (d.length > 2)  r += ' (' + d.slice(2, 4)
      if (d.length > 4)  r += ') ' + d.slice(4, 9)
      if (d.length > 9)  r += '-' + d.slice(9, 13)
      return r
    }

    if (field.type === 'Email') return raw.toLowerCase()

    if (/nome|bairro|cidade/.test(label)) {
      return raw.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase())
    }

    return raw
  }

  const progressPercent = useMemo(() => {
    if (fields.length === 0) return 0
    const filled = fields.filter(f => values[String(f.id)]?.trim()).length
    return Math.round((filled / fields.length) * 100)
  }, [fields, values])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return

    const missing = fields.filter(f => f.required && !values[String(f.id)]?.trim())
    if (missing.length) {
      setError(`Preencha os campos obrigatórios: ${missing.map(f => f.label).join(', ')}`)
      return
    }

    // Stock check: verify inventory-linked fields still have qty > 0
    const linkedFields = fields.filter(f => f.inventory_linked && f.type === 'Select')
    for (const lf of linkedFields) {
      const selectedName = values[String(lf.id)]
      if (!selectedName) continue
      const item = inventory.find(i => i.name === selectedName)
      if (!item || item.qty <= 0) {
        setError(`"${selectedName}" está esgotado. Por favor, escolha outro prêmio.`)
        return
      }
    }

    // Validate email format
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const invalidEmail = fields.find(f => f.type === 'Email' && values[String(f.id)] && !emailRe.test(values[String(f.id)]))
    if (invalidEmail) {
      setError(`E-mail inválido: ${values[String(invalidEmail.id)]}`)
      return
    }

    setSubmitting(true)
    setError('')

    // Build labeled payload: { "Nome": "João", "Email": "..." }
    const labeledData: Record<string, string> = {}
    fields.forEach(f => {
      labeledData[f.label] = values[String(f.id)] || ''
    })

    // Persist submission to form_submissions table
    const { error: insertErr } = await supabase.from('form_submissions').insert({
      form_id: form.id,
      data: labeledData,
    })
    if (insertErr) {
      console.error('[PublicForm] Erro ao salvar submissão:', insertErr.message)
      setError('Erro ao enviar. Tente novamente.')
      setSubmitting(false)
      return
    }

    // Decrement inventory for linked Select fields (fire-and-forget with safety re-check)
    for (const lf of linkedFields) {
      const selectedName = values[String(lf.id)]
      if (!selectedName) continue
      const item = inventory.find(i => i.name === selectedName)
      if (!item) continue
      void (async () => {
        const { data: fresh } = await supabase.from('inventory').select('qty').eq('id', item.id).single()
        if (fresh && fresh.qty > 0) {
          await supabase.from('inventory').update({ qty: fresh.qty - 1 }).eq('id', item.id)
          // Update local inventory state to reflect new qty
          setInventory(p => p.map(i => i.id === item.id ? { ...i, qty: i.qty - 1 } : i))
        }
      })()
    }

    // Fire webhook — transforma chaves PT → universal (name, email, phone…) antes do envio.
    if (form.webhook) {
      const cleanData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(labeledData)) {
        const k = key.replace(/^data_/, '').trim().toLowerCase()
        let universalKey: string
        if (k === 'nome completo' || k === 'nome') universalKey = 'name'
        else if (k === 'e-mail' || k === 'email') universalKey = 'email'
        else if (k === 'whatsapp' || k === 'telefone' || k === 'celular') universalKey = 'phone'
        else if (k === 'cpf' || k === 'documento') universalKey = 'document'
        else if (k === 'cep') universalKey = 'zipcode'
        else if (k === 'rua' || k === 'endereço' || k === 'endereco') universalKey = 'street'
        else if (k === 'número' || k === 'numero') universalKey = 'number'
        else if (k === 'bairro') universalKey = 'neighborhood'
        else if (k === 'cidade') universalKey = 'city'
        else if (k === 'estado' || k === 'uf') universalKey = 'state'
        else if (k === 'premiação' || k === 'premiacao') universalKey = 'award'
        else universalKey = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
        cleanData[universalKey] = value
      }
      const finalPayload = {
        form_id: form.id,
        form_name: form.name,
        submitted_at: new Date().toISOString(),
        data: cleanData,
      }
      fetch(form.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload),
      }).catch(() => {})
    }

    setSubmitting(false)

    if (form.redirect_url) {
      window.location.href = form.redirect_url
    } else {
      setSubmitted(true)
    }
  }

  function renderField(f: FormField) {
    const id = String(f.id)
    const base: React.CSSProperties = {
      width: '100%', boxSizing: 'border-box', padding: '12px 14px',
      background: form?.field_bg_color || 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: 10, color: fieldTextColor, fontSize: 15, outline: 'none', fontFamily: 'inherit',
    }

    const set = (raw: string) => setValues(p => ({ ...p, [id]: applyMask(raw, f) }))

    if (f.type === 'Textarea') return (
      <textarea style={{ ...base, minHeight: 100, resize: 'vertical' }} placeholder={f.placeholder}
        value={values[id] || ''} onChange={e => set(e.target.value)} />
    )

    if (f.type === 'Select') {
      if (f.inventory_linked) {
        const inStockItems = inventory.filter(i => i.qty > 0)
        const outOfStock   = inventory.filter(i => i.qty <= 0)
        return (
          <div>
            <CustomSelect
              options={inStockItems.map(i => i.name)}
              value={values[id] || ''}
              onChange={v => setValues(p => ({ ...p, [id]: v }))}
              placeholder={f.placeholder || 'Selecione um prêmio…'}
              baseStyle={base}
            />
            {outOfStock.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                Esgotados: {outOfStock.map(i => i.name).join(', ')}
              </div>
            )}
          </div>
        )
      }
      const opts = (f.options || '').split(',').map(o => o.trim()).filter(Boolean)
      return (
        <CustomSelect
          options={opts}
          value={values[id] || ''}
          onChange={v => setValues(p => ({ ...p, [id]: v }))}
          placeholder={f.placeholder || 'Selecione…'}
          baseStyle={base}
        />
      )
    }

    const inputType = f.type === 'Email' ? 'email' : f.type === 'Data' ? 'date' : 'text'
    return (
      <input
        type={inputType}
        style={base}
        placeholder={f.placeholder}
        value={values[id] || ''}
        onChange={e => set(e.target.value)}
        onFocus={() => {
          if (f.type === 'Telefone' && !values[id]) setValues(p => ({ ...p, [id]: '+55 ' }))
        }}
      />
    )
  }

  const accentColor    = form?.color            || '#2997FF'
  const pageBgColor    = form?.bg_color         || '#0f172a'
  const fieldTextColor = form?.field_text_color || '#ffffff'
  const formOpacity    = form?.bg_opacity       ?? 60
  const logoMaxWidth   = form?.logo_width       || 120

  const pageStyle: React.CSSProperties = form?.background_image
    ? { backgroundImage: `url(${form.background_image})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: pageBgColor }
    : { background: pageBgColor }
  const formContainerBg = `rgba(0,0,0,${(100 - formOpacity) / 100 * 0.9})`

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: `3px solid #2997FF`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (error && !form) return (
    <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>😕</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{error}</div>
    </div>
  )

  if (submitted) return (
    <div style={{ minHeight: '100vh', ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(34,197,94,0.15)', border: '2px solid #22c55e',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 10 }}>Formulário enviado, obrigado!</h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.6 }}>Sua resposta foi registrada com sucesso.</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 640, background: formContainerBg, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, padding: '40px 36px', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            background: accentColor,
            width: `${progressPercent}%`,
            transition: 'width 0.5s ease-out',
          }} />
        </div>

        {/* Logo */}
        {form?.logo_url && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <img
              src={form.logo_url}
              alt="logo"
              style={{ maxWidth: logoMaxWidth, maxHeight: 120, objectFit: 'contain', display: 'block', margin: '0 auto' }}
            />
          </div>
        )}

        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 28, lineHeight: 1.2 }}>{form?.name}</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {fields.map(f => (
            <div key={f.id} style={{ gridColumn: f.width === 'half' ? 'span 1' : 'span 2' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.75)', marginBottom: 7 }}>
                {f.label}{f.required && <span style={{ color: accentColor, marginLeft: 4 }}>*</span>}
              </label>
              {renderField(f)}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,60,60,0.15)', border: '1px solid rgba(255,60,60,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} style={{
          width: '100%', marginTop: 28, padding: '14px', border: 'none', borderRadius: 12,
          background: accentColor, color: '#fff', fontSize: 16, fontWeight: 700,
          cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {submitting && (
            <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
          )}
          {submitting ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </div>
  )
}
