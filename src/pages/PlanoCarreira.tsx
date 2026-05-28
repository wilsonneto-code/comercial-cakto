import { useState } from 'react'
import { Header } from '@/components/Header'

// ── Dados ─────────────────────────────────────────────────────────────────────
type Grupo = 'jr' | 'pl' | 'sn'
type Trilho = 'sdr' | 'closer' | 'gc'

interface Nivel {
  badge: string
  nome: string
  fixo: number
  varMax: number
  ote: number
  prg: number
  grupo: Grupo
  metas: Record<string, string>
  variavel: string
  req: string[]
}

interface TrilhoData {
  badge: string
  title: string
  intro: string
  regra: 'pi' | 'rc' | null
  niveis: Nivel[]
}

const PROMO: Record<Trilho, Record<Grupo, string>> = {
  sdr: {
    jr: 'Bater a meta de agendamentos por 2 meses consecutivos + aprovação do gestor.',
    pl: 'Bater a meta de agendamentos por 3 meses consecutivos + aprovação do gestor.',
    sn: 'Bater a meta de agendamentos por 5 meses consecutivos + aprovação do gestor. Nível máximo — avaliação para liderança.',
  },
  closer: {
    jr: 'Bater a meta de conversão e ativação por 2 meses consecutivos + aprovação do gestor.',
    pl: 'Bater a meta de conversão e ativação por 3 meses consecutivos + aprovação do gestor.',
    sn: 'Bater a meta de conversão e ativação por 5 meses consecutivos + aprovação do gestor. Nível máximo — avaliação para liderança.',
  },
  gc: {
    jr: 'Manter as metas de carteira por 2 meses consecutivos + aprovação do gestor.',
    pl: 'Manter as metas de carteira por 3 meses consecutivos + aprovação do gestor.',
    sn: 'Manter as metas de carteira por 5 meses consecutivos + aprovação do gestor. Nível máximo — avaliação para liderança.',
  },
}

const DATA: Record<Trilho, TrilhoData> = {
  sdr: {
    badge: 'Trilha 01 — SDR', title: 'SDR',
    intro: 'Prospecção, qualificação e agendamento. Fixo de R$3.500 a R$7.000. Variável de R$3,50 a R$7,00 por reunião realizada com show-up confirmado.',
    regra: 'pi',
    niveis: [
      { badge:'JR 1',nome:'SDR Júnior I',fixo:3500,varMax:980,ote:4480,prg:11,grupo:'jr',metas:{'agend./mês':'140','show-up':'70%','briefing OK':'90%'},variavel:'R$3,50 por reunião realizada. Teto: R$980/mês.',req:['Formação completa no playbook de prospecção','Domínio dos 3 canais: WhatsApp, Instagram e CRM','Briefing correto em 90% dos agendamentos','Participação nas roleplays semanais']},
      { badge:'JR 2',nome:'SDR Júnior II',fixo:3800,varMax:1088,ote:4888,prg:22,grupo:'jr',metas:{'agend./mês':'145','show-up':'73%','briefing OK':'93%'},variavel:'R$4,00 por reunião realizada. Acelerador 1.2× acima de 145. Teto: R$1.088/mês.',req:['2 meses acima da meta JR1','Sem reprovação de briefing por 30 dias','Qualificação de ICP sem supervisão']},
      { badge:'JR 3',nome:'SDR Júnior III',fixo:4100,varMax:1200,ote:5300,prg:33,grupo:'jr',metas:{'agend./mês':'150','show-up':'75%','briefing OK':'95%'},variavel:'R$4,50 por reunião realizada. Acelerador 1.2× acima de 150. Teto: R$1.200/mês.',req:['2 meses acima da meta JR2','Início de mentoria de novos SDRs','Propõe ajustes de script com embasamento']},
      { badge:'PL 1',nome:'SDR Pleno I',fixo:4500,varMax:1395,ote:5895,prg:44,grupo:'pl',metas:{'agend./mês':'155','show-up':'78%','briefing OK':'97%'},variavel:'R$5,00 por reunião realizada. Acelerador 1.3× acima de 155. Teto: R$1.395/mês.',req:['Taxa de resposta acima de 12% nos canais','Abordagem autônoma por nicho sem supervisão','Mentoria ativa de 1 SDR JR']},
      { badge:'PL 2',nome:'SDR Pleno II',fixo:5000,varMax:1600,ote:6600,prg:55,grupo:'pl',metas:{'agend./mês':'160','show-up':'80%','briefing OK':'98%'},variavel:'R$5,50 por reunião realizada. Acelerador 1.3× acima de 160. Teto: R$1.600/mês.',req:['Liderança informal na célula de SDR','3 meses acima de meta no nível PL1','Criação de pelo menos 1 script aprovado']},
      { badge:'PL 3',nome:'SDR Pleno III',fixo:5500,varMax:1815,ote:7315,prg:66,grupo:'pl',metas:{'agend./mês':'165','show-up':'82%','briefing OK':'99%'},variavel:'R$6,00 por reunião realizada. Acelerador 1.3× acima de 165. Teto: R$1.815/mês.',req:['Referência técnica na célula','Mapeia gargalos e propõe soluções de processo','Mentoria de 2+ SDRs simultaneamente']},
      { badge:'SN 1',nome:'SDR Sênior I',fixo:6000,varMax:2040,ote:8040,prg:77,grupo:'sn',metas:{'agend./mês':'170','show-up':'84%','briefing OK':'100%'},variavel:'R$6,00 por reunião realizada. Acelerador 1.4× acima de 170. Teto: R$2.040/mês.',req:['Treina e certifica novos SDRs','Responsável por testar novos canais','6+ meses de consistência em PL3']},
      { badge:'SN 2',nome:'SDR Sênior II',fixo:6500,varMax:2275,ote:8775,prg:88,grupo:'sn',metas:{'agend./mês':'175','show-up':'86%','briefing OK':'100%'},variavel:'R$6,50 por reunião realizada. Acelerador 1.4× acima de 175. Teto: R$2.275/mês.',req:['Referência da empresa em prospecção digital','Participa de decisões de processo e playbook','Lidera a célula na ausência do gestor']},
      { badge:'SN 3',nome:'SDR Sênior III',fixo:7000,varMax:2520,ote:9520,prg:100,grupo:'sn',metas:{'agend./mês':'180','show-up':'88%','briefing OK':'100%'},variavel:'R$7,00 por reunião realizada. Acelerador 1.5× acima de 180. Teto: R$2.520/mês.',req:['Nível máximo da trilha SDR','Co-responsável pelo playbook oficial','Referência para contratação e onboarding de novos SDRs']},
    ],
  },
  closer: {
    badge: 'Trilha 02 — Closer', title: 'Closer',
    intro: 'Fechamento via call ou WhatsApp. JR: fixo R$3.500–R$3.900 · Pleno: R$4.200–R$6.000 · Sênior: R$6.500–R$7.500. Variável com gatilho escalonado.',
    regra: 'rc',
    niveis: [
      { badge:'JR 1',nome:'Closer Júnior I',fixo:3500,varMax:2500,ote:6000,prg:11,grupo:'jr',metas:{'conversão':'20%','ativação (call/WA)':'70%','contrato assinado':'90%'},variavel:'R$50 por cliente que faturar acima de R$10k no mês seguinte. Teto: R$2.500/mês.',req:['Formação completa no playbook do Closer','Domínio das 5 etapas da call','Fechamentos via call e WhatsApp com contrato + compra teste']},
      { badge:'JR 2',nome:'Closer Júnior II',fixo:3700,varMax:3000,ote:6700,prg:22,grupo:'jr',metas:{'conversão':'22%','ativação (call/WA)':'73%','contrato assinado':'93%'},variavel:'R$60 por cliente que faturar acima de R$10k no mês seguinte. Acelerador 1.2× acima de 22%. Teto: R$3.000/mês.',req:['2 meses acima da meta JR1','Tratamento autônomo das 6 objeções principais','Briefing completo em 100% dos fechamentos']},
      { badge:'JR 3',nome:'Closer Júnior III',fixo:3900,varMax:3500,ote:7400,prg:33,grupo:'jr',metas:{'conversão':'25%','ativação (call/WA)':'76%','contrato assinado':'95%'},variavel:'R$70 por cliente que faturar acima de R$10k no mês seguinte. Acelerador 1.2× acima de 25%. Teto: R$3.500/mês.',req:['Adaptação do rapport por tipo de lead','Uso da dor do lead na apresentação','Início de mentoria com JR1 e JR2']},
      { badge:'PL 1',nome:'Closer Pleno I',fixo:4200,varMax:4000,ote:8200,prg:44,grupo:'pl',metas:{'conversão':'27%','ativação (call/WA)':'79%','contrato assinado':'97%'},variavel:'R$80 por cliente que faturar acima de R$20k no mês seguinte. Acelerador 1.3× acima de 27%. Teto: R$4.000/mês.',req:['Domínio completo dos 7 tipos de rapport','No-show abaixo de 10% da carteira','Recuperação de leads perdidos em follow-up']},
      { badge:'PL 2',nome:'Closer Pleno II',fixo:5100,varMax:4800,ote:9900,prg:55,grupo:'pl',metas:{'conversão':'30%','ativação (call/WA)':'82%','contrato assinado':'98%'},variavel:'R$90 por cliente que faturar acima de R$20k no mês seguinte. Acelerador 1.3× acima de 30%. Teto: R$4.800/mês.',req:['Meta de 30% — referência do time','3 meses acima de meta no nível PL1','Contribuição com ajustes de roteiro no playbook']},
      { badge:'PL 3',nome:'Closer Pleno III',fixo:6000,varMax:5500,ote:11500,prg:66,grupo:'pl',metas:{'conversão':'32%','ativação (call/WA)':'85%','contrato assinado':'99%'},variavel:'R$100 por cliente que faturar acima de R$20k no mês seguinte. Acelerador 1.3× acima de 32%. Teto: R$5.500/mês.',req:['Referência técnica na célula de Closers','Audita calls e dá feedback estruturado','Mentoria ativa de 2 Closers simultaneamente']},
      { badge:'SN 1',nome:'Closer Sênior I',fixo:6500,varMax:6500,ote:13000,prg:77,grupo:'sn',metas:{'conversão':'34%','ativação (call/WA)':'87%','contrato assinado':'100%'},variavel:'R$110 por cliente que faturar acima de R$30k no mês seguinte. Acelerador 1.4× acima de 34%. Teto: R$6.500/mês.',req:['Consistência acima de 32% por 6+ meses','Responsável por testar novos formatos de fechamento','Certificação de novos Closers no onboarding']},
      { badge:'SN 2',nome:'Closer Sênior II',fixo:7000,varMax:7500,ote:14500,prg:88,grupo:'sn',metas:{'conversão':'37%','ativação (call/WA)':'88%','contrato assinado':'100%'},variavel:'R$120 por cliente que faturar acima de R$30k no mês seguinte. Acelerador 1.4× acima de 37%. Teto: R$7.500/mês.',req:['Referência da empresa em fechamento','Participa das decisões de qualificação com o SDR','Lidera a célula na ausência do gestor']},
      { badge:'SN 3',nome:'Closer Sênior III',fixo:7500,varMax:8500,ote:16000,prg:100,grupo:'sn',metas:{'conversão':'40%','ativação (call/WA)':'90%','contrato assinado':'100%'},variavel:'R$140 por cliente que faturar acima de R$30k no mês seguinte. Acelerador 1.5× acima de 40%. Teto: R$8.500/mês.',req:['Nível máximo da trilha Closer','Co-responsável pelo playbook de fechamento','Representa a Cakto em treinamentos e eventos']},
    ],
  },
  gc: {
    badge: 'Trilha 03 — GC', title: 'Gerente de Contas',
    intro: 'Gestão de carteira por GMV. A Cakto retém 2–3% do faturamento bruto do cliente. Crescer a carteira é crescer a receita da empresa.',
    regra: 'pi',
    niveis: [
      { badge:'JR 1',nome:'GC Júnior I',fixo:3500,varMax:2000,ote:5500,prg:11,grupo:'jr',metas:{'clientes ativos':'70%','churn máx.':'15%','GMV carteira':'R$300k'},variavel:'0,15% do GMV incremental da carteira/mês. Teto: R$2.000/mês.',req:['Formação no playbook de GC Starter','Registro diário obrigatório no DataCrazy','Cadência de contato mensal com toda a carteira','Briefing de handoff correto em 100% dos novos clientes']},
      { badge:'JR 2',nome:'GC Júnior II',fixo:4000,varMax:2500,ote:6500,prg:22,grupo:'jr',metas:{'clientes ativos':'73%','churn máx.':'13%','GMV carteira':'R$500k'},variavel:'0,18% do GMV incremental da carteira/mês. Teto: R$2.500/mês.',req:['2 meses acima da meta JR1','Identificação de candidatos a promoção de tier','Pelo menos 1 indicação gerada por mês']},
      { badge:'JR 3',nome:'GC Júnior III',fixo:4500,varMax:3000,ote:7500,prg:33,grupo:'jr',metas:{'clientes ativos':'75%','churn máx.':'12%','GMV carteira':'R$700k'},variavel:'0,20% do GMV incremental da carteira/mês. + R$100 por promoção de tier. Teto: R$3.000/mês.',req:['Gestão autônoma da cadência sem supervisão','Histórico de promoções Starter→Growth','Uso ativo dos alertas de queda de GMV e inatividade']},
      { badge:'PL 1',nome:'GC Pleno I',fixo:5500,varMax:4000,ote:9500,prg:44,grupo:'pl',metas:{'clientes ativos':'78%','churn máx.':'10%','GMV carteira':'R$1M'},variavel:'0,22% do GMV incremental da carteira/mês. + R$150 por promoção de tier. Teto: R$4.000/mês.',req:['Migração para carteira Growth (R$50k–R$250k GMV)','Domínio do script de contato quinzenal','Cadência estruturada sem dependência de lembretes']},
      { badge:'PL 2',nome:'GC Pleno II',fixo:6500,varMax:5000,ote:11500,prg:55,grupo:'pl',metas:{'clientes ativos':'80%','churn máx.':'8%','GMV carteira':'R$1,5M'},variavel:'0,25% do GMV incremental da carteira/mês. + R$200 por promoção ao Enterprise. Teto: R$5.000/mês.',req:['3 meses acima de meta no nível PL1','Mínimo 1 indicação gerada por mês','Conduz conversa de upgrade com clientes Grupo A']},
      { badge:'PL 3',nome:'GC Pleno III',fixo:7500,varMax:6000,ote:13500,prg:66,grupo:'pl',metas:{'clientes ativos':'82%','churn máx.':'7%','GMV carteira':'R$2M'},variavel:'0,28% do GMV incremental da carteira/mês. + R$200 por promoção ao Enterprise. Teto: R$6.000/mês.',req:['Referência técnica no time de GC','Mentoria de 1 GC JR','Conduz QBR com clientes de alto volume']},
      { badge:'SN 1',nome:'GC Sênior I',fixo:8000,varMax:6500,ote:14500,prg:77,grupo:'sn',metas:{'clientes ativos':'85%','churn máx.':'5%','GMV carteira':'R$3M'},variavel:'0,30% do GMV incremental da carteira/mês. + bônus por indicação fechada. Teto: R$6.500/mês.',req:['Migração para carteira Enterprise (acima de R$250k GMV)','QBR trimestral com todos os clientes','Revisão proativa de taxa mensal sem o cliente pedir']},
      { badge:'SN 2',nome:'GC Sênior II',fixo:9000,varMax:7500,ote:16500,prg:88,grupo:'sn',metas:{'clientes ativos':'88%','churn máx.':'4%','GMV carteira':'R$4M'},variavel:'0,33% do GMV incremental da carteira/mês. + bônus por indicação fechada. Teto: R$7.500/mês.',req:['Referência da empresa em gestão Enterprise','Mentoria de 2 GCs simultaneamente','Participa de decisões de produto com base no feedback']},
      { badge:'SN 3',nome:'GC Sênior III',fixo:11000,varMax:9000,ote:20000,prg:100,grupo:'sn',metas:{'clientes ativos':'90%','churn máx.':'3%','GMV carteira':'R$5M'},variavel:'0,35% do GMV incremental da carteira/mês. + bônus por indicação e crescimento. Teto: R$9.000/mês.',req:['Nível máximo da trilha GC','Gestão da carteira de maior GMV da empresa','Co-responsável pelo playbook de GC e critérios de tier']},
    ],
  },
}

// ── Cores por trilho ──────────────────────────────────────────────────────────
const COR: Record<Trilho, { main: string; bg: string; dim: string; text: string }> = {
  sdr:    { main: '#1DBF88', bg: 'rgba(29,191,136,0.08)',  dim: 'rgba(29,191,136,0.2)',  text: '#9FE1CB' },
  closer: { main: '#7F77DD', bg: 'rgba(127,119,221,0.08)', dim: 'rgba(127,119,221,0.2)', text: '#CECBF6' },
  gc:     { main: '#E07038', bg: 'rgba(224,112,56,0.08)',  dim: 'rgba(224,112,56,0.2)',  text: '#F5C4B3' },
}

const GATILHO_TAG: Record<Grupo, string> = {
  jr: 'gatilho: R$10k',
  pl: 'gatilho: R$20k',
  sn: 'gatilho: R$30k',
}
const GATILHO_COLOR: Record<Grupo, string> = {
  jr: '#1DBF88', pl: '#7F77DD', sn: '#E07038',
}

const fmt = (n: number) => n.toLocaleString('pt-BR')

// ── Sub-componentes ───────────────────────────────────────────────────────────
function InfoBoxPI() {
  const c = '#1DBF88'
  return (
    <div style={{ borderRadius: 8, padding: '14px 16px', fontSize: 13, lineHeight: 1.65, marginBottom: 16,
      border: '1px solid rgba(29,191,136,0.2)', background: 'rgba(29,191,136,0.06)', color: '#9FE1CB' }}>
      <strong style={{ display: 'block', fontWeight: 600, fontSize: 13, color: c, marginBottom: 10 }}>
        Critérios de consistência para promoção
      </strong>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'JR 1 → PL 1', val: '2 meses', desc: 'consecutivos acima da meta' },
          { label: 'PL 1 → PL 3', val: '3 meses', desc: 'consecutivos acima da meta' },
          { label: 'SN 1 → SN 3', val: '5 meses', desc: 'consecutivos acima da meta' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: 8, padding: '10px 12px', textAlign: 'center',
            border: '1px solid rgba(29,191,136,0.15)', background: 'rgba(29,191,136,0.04)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4, color: '#9FE1CB' }}>{s.label}</div>
            <span style={{ fontFamily: 'var(--font-mono,"DM Mono",monospace)', fontSize: 18, fontWeight: 700, display: 'block', marginBottom: 2, color: c }}>{s.val}</span>
            <div style={{ fontSize: 10, color: '#6B6B85' }}>{s.desc}</div>
          </div>
        ))}
      </div>
      Em todos os casos é necessária a aprovação do gestor para efetivar a promoção.
    </div>
  )
}

function InfoBoxRC() {
  return (
    <>
      {/* Regra conversão */}
      <div style={{ borderRadius: 8, padding: '14px 16px', fontSize: 13, lineHeight: 1.65, marginBottom: 10,
        border: '1px solid rgba(127,119,221,0.2)', background: 'rgba(127,119,221,0.08)', color: '#CECBF6' }}>
        <strong style={{ display: 'block', fontWeight: 600, color: '#7F77DD', marginBottom: 5 }}>Conversão — call + WhatsApp</strong>
        Clientes fechados via call OU WhatsApp contam como conversão. Critério: contrato assinado + compra teste realizada, independente do canal.
      </div>
      {/* Gatilho escalonado */}
      <div style={{ borderRadius: 8, padding: '14px 16px', fontSize: 13, lineHeight: 1.65, marginBottom: 10,
        border: '1px solid rgba(127,119,221,0.2)', background: 'rgba(127,119,221,0.08)', color: '#CECBF6' }}>
        <strong style={{ display: 'block', fontWeight: 600, color: '#7F77DD', marginBottom: 8 }}>Gatilho do variável — escalonado por grupo</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {([
            { grupo: 'Júnior (JR 1–3)', val: 'acima de R$10k', c: '#1DBF88', bg: 'rgba(29,191,136,0.08)' },
            { grupo: 'Pleno (PL 1–3)',  val: 'acima de R$20k', c: '#7F77DD', bg: 'rgba(127,119,221,0.08)' },
            { grupo: 'Sênior (SN 1–3)', val: 'acima de R$30k', c: '#E07038', bg: 'rgba(224,112,56,0.08)' },
          ] as const).map(g => (
            <div key={g.grupo} style={{ borderRadius: 8, padding: '10px 12px', textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.1)', background: g.bg }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4, color: g.c }}>{g.grupo}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#E8E8F2' }}>{g.val}</div>
              <div style={{ fontSize: 10, color: '#6B6B85', marginTop: 2 }}>faturamento no mês seguinte</div>
            </div>
          ))}
        </div>
      </div>
      {/* Aviso defasagem */}
      <div style={{ borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#f5d280', lineHeight: 1.6,
        border: '1px solid rgba(240,165,0,0.2)', background: 'rgba(240,165,0,0.07)', marginBottom: 10 }}>
        <strong style={{ display: 'block', color: '#EFC84A', marginBottom: 3 }}>Apuração com defasagem de 1 mês</strong>
        Closer fecha em abril → cliente fatura em maio → comissão paga no fechamento de maio.
      </div>
      <InfoBoxPI />
    </>
  )
}

function TrilhoPanel({ trilho, sel, onPick }: { trilho: Trilho; sel: number; onPick: (i: number) => void }) {
  const d = DATA[trilho]
  const c = COR[trilho]
  const n = d.niveis[sel]
  const metaKeys = Object.keys(n.metas)

  const gtagColor = trilho === 'closer' ? GATILHO_COLOR[n.grupo] : null
  const gtagLabel = trilho === 'closer' ? GATILHO_TAG[n.grupo] : null

  return (
    <div style={{ animation: 'pcFadeUp .3s ease forwards' }}>
      {/* Header da trilho */}
      <div style={{ borderRadius: 12, padding: '28px 32px', marginBottom: 20,
        border: '1px solid rgba(255,255,255,0.07)',
        background: `linear-gradient(135deg, #14141F, ${c.bg.replace('0.08)', '0.05)')})` }}>
        <div style={{ display: 'inline-block', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2,
          textTransform: 'uppercase', padding: '4px 12px', borderRadius: 50, marginBottom: 12, fontWeight: 500,
          background: c.bg, color: c.main, border: `1px solid ${c.dim}` }}>
          {d.badge}
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -1, marginBottom: 8, color: '#E8E8F2' }}>{d.title}</h2>
        <p style={{ fontSize: 13, color: '#6B6B85', fontWeight: 300, lineHeight: 1.7, maxWidth: 600 }}>{d.intro}</p>
      </div>

      {/* Regras específicas */}
      {d.regra === 'rc' ? <InfoBoxRC /> : d.regra === 'pi' ? <InfoBoxPI /> : null}

      {/* Grid de níveis */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 20 }}>
        {d.niveis.map((nv, i) => (
          <button key={i} onClick={() => onPick(i)}
            style={{ borderRadius: 8, padding: 14, cursor: 'pointer', transition: 'all .15s', textAlign: 'left',
              fontFamily: 'inherit', border: `${i === sel ? '1.5px' : '1px'} solid ${i === sel ? c.main : 'rgba(255,255,255,0.07)'}`,
              background: i === sel ? c.bg : '#14141F',
              transform: i === sel ? 'none' : undefined }}>
            <span style={{ display: 'inline-block', fontFamily: 'monospace', fontSize: 10, fontWeight: 500,
              padding: '2px 8px', borderRadius: 6, marginBottom: 6,
              background: `${c.main}25`, color: c.main }}>{nv.badge}</span>
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 3, color: '#E8E8F2' }}>{nv.nome}</div>
            <div style={{ fontSize: 11, color: '#6B6B85' }}>R${fmt(nv.fixo)}/mês</div>
          </button>
        ))}
      </div>

      {/* Detalhe do nível selecionado */}
      <div style={{ background: '#14141F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24, marginBottom: 16 }}>
        {/* Título + tag */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: -.4, color: '#E8E8F2', margin: 0 }}>{n.nome}</h3>
          {gtagLabel && (
            <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 6,
              background: `${gtagColor}20`, color: gtagColor!, border: `1px solid ${gtagColor}40` }}>
              {gtagLabel}
            </span>
          )}
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { val: `R$${fmt(n.fixo)}`,   lbl: 'fixo/mês' },
            { val: `R$${fmt(n.varMax)}`, lbl: 'variável (teto)' },
            { val: `R$${fmt(n.ote)}`,    lbl: 'OTE meta 100%' },
            { val: n.badge,              lbl: 'nível' },
          ].map(k => (
            <div key={k.lbl} style={{ background: '#1A1A28', borderRadius: 8, padding: 14, textAlign: 'center',
              border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 500, display: 'block', marginBottom: 3, color: c.main }}>{k.val}</span>
              <span style={{ fontSize: 10, color: '#6B6B85' }}>{k.lbl}</span>
            </div>
          ))}
        </div>

        {/* Barra de progressão */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6B6B85', marginBottom: 6, fontFamily: 'monospace' }}>
            <span>JR 1</span><span>PL 1</span><span>SN 3</span>
          </div>
          <div style={{ height: 6, background: '#2A2A3A', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${n.prg}%`, height: '100%', borderRadius: 3,
              background: c.main, transition: 'width .5s ease' }} />
          </div>
        </div>

        {/* Metas + Variável */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .8,
              color: '#6B6B85', marginBottom: 8 }}>Metas deste nível</div>
            {metaKeys.map(k => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12 }}>
                <span style={{ color: '#6B6B85' }}>{k}</span>
                <span style={{ fontWeight: 500, color: '#E8E8F2' }}>{n.metas[k]}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .8,
              color: '#6B6B85', marginBottom: 8 }}>Variável e acelerador</div>
            <div style={{ fontSize: 12, color: '#6B6B85', lineHeight: 1.75, background: '#1A1A28',
              borderRadius: 8, padding: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
              {n.variavel}
            </div>
          </div>
        </div>

        {/* Requisitos */}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .8,
          color: '#6B6B85', marginBottom: 8 }}>Requisitos para este nível</div>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, padding: 0 }}>
          {n.req.map((r, i) => (
            <li key={i} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.6, color: '#6B6B85' }}>
              <span style={{ fontWeight: 600, flexShrink: 0, marginTop: 1, fontSize: 12, color: c.main }}>→</span>
              {r}
            </li>
          ))}
        </ul>

        {/* Critério de promoção */}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: .8,
          color: '#6B6B85', marginBottom: 8 }}>Critério de promoção ao próximo nível</div>
        <div style={{ borderRadius: 8, padding: '14px 16px', fontSize: 12, lineHeight: 1.65, fontWeight: 300,
          background: c.bg, color: c.text, border: `1px solid ${c.dim}` }}>
          {PROMO[trilho][n.grupo]}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function PlanoCarreira() {
  const [trilho, setTrilho] = useState<Trilho>('sdr')
  const [sel, setSel] = useState<Record<Trilho, number>>({ sdr: 0, closer: 0, gc: 0 })

  const handleTrilho = (t: Trilho) => {
    setTrilho(t)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const c = COR[trilho]

  return (
    <>
      <Header />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        .pc-wrap { padding-top: 64px; background: #08080E; min-height: 100vh; font-family: 'Sora', var(--font, sans-serif); color: #E8E8F2; }
        @keyframes pcFadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes pcPulse  { 0%,100% { opacity: 1 } 50% { opacity: .3 } }
        .pc-trilho-btn { display: flex; align-items: center; gap: 8px; padding: 10px 22px; border-radius: 50px;
          border: 1px solid rgba(255,255,255,0.12); background: #14141F; color: #6B6B85;
          font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; transition: all .2s; }
        .pc-trilho-btn:hover { color: #E8E8F2; transform: translateY(-1px); }
        @media (max-width: 600px) {
          .pc-nivel-grid  { grid-template-columns: 1fr 1fr !important; }
          .pc-kpi-row     { grid-template-columns: 1fr 1fr !important; }
          .pc-two-col     { grid-template-columns: 1fr !important; }
          .pc-gatilho-row { grid-template-columns: 1fr !important; }
          .pc-promo-steps { grid-template-columns: 1fr !important; }
          .pc-hero-stats  { flex-direction: column; align-items: center; }
        }
      `}</style>

      <div className="pc-wrap">
        {/* ── Hero ── */}
        <section style={{ padding: '64px 24px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)', width: 800, height: 600,
            background: 'radial-gradient(ellipse,rgba(29,191,136,.1) 0%,rgba(127,119,221,.06) 40%,transparent 70%)', pointerEvents: 'none' }} />

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'monospace', fontSize: 11,
            letterSpacing: 2, textTransform: 'uppercase', color: '#1DBF88',
            border: '1px solid rgba(29,191,136,0.2)', background: 'rgba(29,191,136,0.08)',
            padding: '6px 16px', borderRadius: 50, marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1DBF88',
              animation: 'pcPulse 2s infinite', display: 'inline-block' }} />
            cakto comercial
          </div>

          <h1 style={{ fontSize: 'clamp(28px,6vw,52px)', fontWeight: 800, letterSpacing: -2, lineHeight: 1.05,
            marginBottom: 14, background: 'linear-gradient(135deg,#fff 0%,rgba(255,255,255,.6) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Plano de{' '}
            <span style={{ background: 'linear-gradient(135deg,#1DBF88,#7F77DD)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Carreira Comercial
            </span>
          </h1>

          <p style={{ fontSize: 14, color: '#6B6B85', maxWidth: 520, margin: '0 auto 40px', fontWeight: 300, lineHeight: 1.7 }}>
            Trilhas de crescimento para SDR, Closer e Gerente de Contas — metas claras, critérios objetivos e remuneração alinhada ao resultado.
          </p>

          <div className="pc-hero-stats" style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {[
              { val: '9 níveis',   lbl: 'por trilha',   color: '#1DBF88' },
              { val: 'JR → SN',   lbl: 'progressão',   color: '#7F77DD' },
              { val: '2–5 meses', lbl: 'para promoção', color: '#E07038' },
              { val: 'R$3.500',   lbl: 'salário mínimo', color: '#fff' },
            ].map(s => (
              <div key={s.lbl} style={{ background: '#14141F', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, padding: '12px 20px', textAlign: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 500, display: 'block',
                  marginBottom: 2, color: s.color }}>{s.val}</span>
                <span style={{ fontSize: 10, color: '#6B6B85', letterSpacing: .5 }}>{s.lbl}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Tab nav ── */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '32px 24px 24px',
          position: 'sticky', top: 64, zIndex: 40,
          background: 'linear-gradient(to bottom, #08080E 75%, transparent)' }}>
          {(['sdr', 'closer', 'gc'] as Trilho[]).map(t => {
            const isActive = trilho === t
            const co = COR[t]
            const labels: Record<Trilho, string> = { sdr: 'SDR', closer: 'Closer', gc: 'Gerente de Contas' }
            return (
              <button key={t} className="pc-trilho-btn" onClick={() => handleTrilho(t)}
                style={{
                  background: isActive ? co.bg : '#14141F',
                  border: `1px solid ${isActive ? co.main : 'rgba(255,255,255,0.12)'}`,
                  color: isActive ? co.main : '#6B6B85',
                  boxShadow: isActive ? `0 0 24px ${co.main}25` : 'none',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: co.main, flexShrink: 0 }} />
                {labels[t]}
              </button>
            )
          })}
        </div>

        {/* ── Conteúdo do painel ── */}
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 80px' }}>
          <TrilhoPanel
            key={trilho}
            trilho={trilho}
            sel={sel[trilho]}
            onPick={i => setSel(p => ({ ...p, [trilho]: i }))}
          />
        </div>

        {/* ── Footer ── */}
        <footer style={{ textAlign: 'center', padding: '32px 24px', fontSize: 11, color: '#2A2A3A',
          fontFamily: 'monospace', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          caktocomercial.site · Plano de Carreira Comercial · 2025
        </footer>
      </div>
    </>
  )
}
