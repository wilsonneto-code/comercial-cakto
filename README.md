# Sistema Comercial Cakto

Painel comercial interno para gestão de ativações, times, ranking e dashboards de TPV.

**Stack:** React + Vite + TypeScript + Supabase + Vercel

---

## Arquitetura de Dados

### Fontes de dados
- **Supabase**: banco principal do sistema comercial
  - Colaboradores, times, ativações, configurações
  - Cache de TPV (`tpv_cache`)
- **Metabase**: intermediário para dados de pagamento
  - API key configurada nas variáveis de ambiente
  - Card 2107: TPV por cliente por período
- **DataCrazy**: banco de pagamentos (acesso apenas via Metabase)
  - Pagamentos processados pelos infoprodutores

### Fluxo de cálculo de TPV
1. Closer registra ativação no sistema → salvo no Supabase
2. Sistema dispara webhook para DataCrazy CRM (pipeline)
3. Edge Function `calcular-tpv` é chamada automaticamente
4. Para cada ativação, consulta Metabase API com email + datas
5. Metabase retorna TPV do cliente nos 30 dias após ativação
6. Resultado salvo no `tpv_cache` do Supabase
7. Dashboards leem `tpv_cache` em tempo real

### Bônus calculados automaticamente
- **Closer**: 0,20% sobre TPV dos clientes que fechou (30 dias)
- **SDR**: 0,05% sobre TPV dos clientes que qualificou (30 dias)
- **Gerente**: 0,15% sobre crescimento da carteira (via Metabase)
- **Head**: 0,30% sobre TPV total acima de R$3M consolidado

---

## Variáveis de ambiente

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_METABASE_URL=https://team.cakto.app
VITE_METABASE_API_KEY=
VITE_METABASE_CARD_TPV=2107
```

Secrets da Edge Function (configurados via `npx supabase secrets set`):
```
METABASE_URL
METABASE_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

---

## Edge Functions

### `calcular-tpv`
Processa ativações e salva TPV no cache.

```bash
# Processar todas as ativações
curl -X POST https://<project>.supabase.co/functions/v1/calcular-tpv \
  -H "Content-Type: application/json" \
  -d '{"limite": 200}'

# Processar uma ativação específica
curl -X POST https://<project>.supabase.co/functions/v1/calcular-tpv \
  -H "Content-Type: application/json" \
  -d '{"ativacao_id": "uuid-da-ativacao"}'
```

### `datacrazy-webhook`
Recebe dados de formulários e encaminha ao CRM do DataCrazy.

### `admin-config`
Gerencia configurações administrativas via service_role.

---

## Desenvolvimento local

```bash
npm install
npm run dev
```

Deploy automático via Vercel ao fazer push para `main`.
