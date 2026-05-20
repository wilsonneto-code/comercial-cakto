// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Normaliza chaves PT → universal (name, email, phone…) em qualquer nível de aninhamento.
function sanitizeData(raw: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    let k = key.replace(/^(data_|data-)/i, '').trim().toLowerCase()
    if      (k === 'nome completo' || k === 'nome')                          k = 'name'
    else if (k === 'e-mail'        || k === 'email')                         k = 'email'
    else if (k === 'whatsapp'      || k === 'telefone' || k === 'celular')   k = 'phone'
    else if (k === 'cpf'           || k === 'documento')                     k = 'document'
    else if (k === 'cep')                                                    k = 'zipcode'
    else if (k === 'rua'           || k === 'endereço' || k === 'endereco')  k = 'street'
    else if (k === 'número'        || k === 'numero')                        k = 'number'
    else if (k === 'bairro')                                                 k = 'neighborhood'
    else if (k === 'cidade')                                                 k = 'city'
    else if (k === 'estado'        || k === 'uf')                            k = 'state'
    else if (k === 'premiação'     || k === 'premiacao')                     k = 'award'
    else k = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    clean[k] = value
  }
  return clean
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Responder preflight CORS imediatamente
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // Se for teste, retornar sucesso imediatamente
    if (body.teste === true) {
      return new Response(
        JSON.stringify({ success: true, mensagem: 'Conexão bem sucedida' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar URL do webhook nas configurações
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: config } = await supabase
      .from('configuracoes')
      .select('chave, valor')
      .in('chave', ['datacrazy_webhook_url'])

    const webhookUrl = config?.find(c => c.chave === 'datacrazy_webhook_url')?.valor

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ success: false, erro: 'URL do webhook não configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Normaliza chaves PT → universal dentro de body.data (se existir)
    const sourceData = body.data && typeof body.data === 'object' ? body.data : null
    const cleanedBody = sourceData
      ? { ...body, data: sanitizeData(sourceData as Record<string, unknown>) }
      : body
    console.log('[datacrazy-webhook] PAYLOAD ENVIADO PARA WEBHOOK:', JSON.stringify(cleanedBody))

    // Disparar webhook para o DataCrazy
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanedBody)
    })

    // Registrar no log
    await supabase.from('webhook_logs').insert({
      ativacao_id: body.ativacao_id ?? null,
      payload: cleanedBody,
      status: response.ok ? 'sucesso' : 'erro',
      tentativas: 1,
      erro: response.ok ? null : `HTTP ${response.status}`
    })

    return new Response(
      JSON.stringify({ success: response.ok }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, erro: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
