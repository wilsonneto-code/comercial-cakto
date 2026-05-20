export const MOCK_USERS = [
  { id:1, name:'Alice Silva',    email:'alice@cakto.com',    role:'Closer',            team:'Time Alpha', active:true,  password:'123456' },
  { id:2, name:'Bruno Oliveira', email:'bruno@cakto.com',    role:'SDR',               team:'Time Alpha', active:true,  password:'123456' },
  { id:3, name:'Carla Mendes',   email:'carla@cakto.com',    role:'Gerente de Contas', team:'Time Beta',  active:true,  password:'123456' },
  { id:4, name:'Daniel Lima',    email:'daniel@cakto.com',   role:'Supervisor',        team:'Time Beta',  active:true,  password:'123456' },
  { id:5, name:'Eduardo Faria',  email:'eduardo@cakto.com',  role:'Head Comercial',    team:'Time Alpha', active:false, password:'123456' },
  { id:6, name:'Fernanda Costa', email:'fernanda@cakto.com', role:'Closer',            team:'Time Beta',  active:true,  password:'123456' },
  { id:7, name:'Gabriel Nunes',  email:'gabriel@cakto.com',  role:'SDR',               team:'Time Gamma', active:true,  password:'123456' },
  { id:8, name:'Helena Ramos',   email:'helena@cakto.com',   role:'Admin',             team:'Time Gamma', active:true,  password:'123456' },
];

export const ADMIN_USER = { id:99, name:'Admin Cakto', email:'admin@cakto.com', role:'Admin', team:'Gestão', active:true, password:'admin123' };

export const MOCK_TEAMS = [
  { id:1, name:'Time Alpha', members:[1,2,5] },
  { id:2, name:'Time Beta',  members:[3,4,6] },
  { id:3, name:'Time Gamma', members:[7,8]   },
];

export const MOCK_ACTIVATIONS = [
  { id:1,  client:'Rodrigo Pereira',   email:'rodrigo@email.com',  phone:'+55 11 99001-2345', channel:'Inbound',   responsible:1, date:'2026-03-18', time:'09:14' },
  { id:2,  client:'Mariana Souza',     email:'mariana@email.com',  phone:'+55 21 98765-4321', channel:'Outbound',  responsible:2, date:'2026-03-18', time:'10:02' },
  { id:3,  client:'Felipe Alves',      email:'felipe@email.com',   phone:'+55 31 97654-3210', channel:'Indicação', responsible:1, date:'2026-03-17', time:'14:30' },
  { id:4,  client:'Juliana Martins',   email:'juliana@email.com',  phone:'+55 11 96543-2109', channel:'Inbound',   responsible:6, date:'2026-03-17', time:'15:45' },
  { id:5,  client:'Carlos Eduardo',    email:'carlos@email.com',   phone:'+55 41 95432-1098', channel:'Outbound',  responsible:2, date:'2026-03-16', time:'11:20' },
  { id:6,  client:'Patrícia Lima',     email:'patricia@email.com', phone:'+55 71 94321-0987', channel:'Indicação', responsible:1, date:'2026-03-15', time:'16:00' },
  { id:7,  client:'Thiago Nascimento', email:'thiago@email.com',   phone:'+55 51 93210-9876', channel:'Inbound',   responsible:7, date:'2026-03-14', time:'09:50' },
  { id:8,  client:'Beatriz Santos',    email:'beatriz@email.com',  phone:'+55 61 92109-8765', channel:'Outbound',  responsible:6, date:'2026-03-13', time:'13:15' },
];

export const MOCK_RANKING = [
  { userId:1, activations:28, score:94, variation:+3 },
  { userId:6, activations:22, score:81, variation:+1 },
  { userId:2, activations:19, score:72, variation:-2 },
  { userId:7, activations:15, score:61, variation:+4 },
  { userId:3, activations:13, score:54, variation: 0 },
  { userId:4, activations:10, score:43, variation:-1 },
  { userId:5, activations: 8, score:35, variation:+2 },
  { userId:8, activations: 5, score:22, variation:-1 },
];

export const MOCK_CALLS = [
  { id:1, title:'Demo – Rodrigo Pereira',    date:'2026-03-20', timeStart:'10:00', timeEnd:'10:45', responsible:1, client:'Rodrigo Pereira',   link:'https://meet.google.com/abc-def', description:'Apresentação do plano básico', status:'Agendada' },
  { id:2, title:'Follow-up – Mariana Souza', date:'2026-03-20', timeStart:'14:00', timeEnd:'14:30', responsible:2, client:'Mariana Souza',     link:'https://zoom.us/j/123',           description:'Follow-up pós proposta',     status:'Agendada' },
  { id:3, title:'Onboarding – Felipe Alves', date:'2026-03-21', timeStart:'09:30', timeEnd:'10:30', responsible:6, client:'Felipe Alves',      link:'https://meet.google.com/xyz-ghi', description:'Onboarding inicial',         status:'Agendada' },
  { id:4, title:'Renovação – Carlos Eduardo',date:'2026-03-19', timeStart:'11:00', timeEnd:'11:30', responsible:1, client:'Carlos Eduardo',    link:'',                                description:'Renovação de contrato',      status:'Realizada' },
  { id:5, title:'Discovery – Beatriz Santos',date:'2026-03-22', timeStart:'15:00', timeEnd:'15:45', responsible:7, client:'Beatriz Santos',    link:'https://meet.google.com/jkl-mno', description:'Discovery call',             status:'Agendada' },
];

export const MOCK_FORMS = [
  { id:1, name:'Formulário de Cadastro', type:'Cadastro',    slug:'cadastro-lead',   responses:142, active:true,  color:'#2997FF', status:'Publicado',  fields:[{id:1,type:'Texto',label:'Nome completo',required:true},{id:2,type:'Email',label:'E-mail',required:true},{id:3,type:'Telefone',label:'Telefone',required:false}], embedCode:'', webhook:'' },
  { id:2, name:'Pesquisa de Satisfação',  type:'Pesquisa',    slug:'satisfacao-2026', responses:87,  active:true,  color:'#34C759', status:'Publicado',  fields:[{id:1,type:'Select',label:'Nota geral',required:true},{id:2,type:'Textarea',label:'Comentário',required:false}], embedCode:'', webhook:'' },
  { id:3, name:'Indicação de Parceiros',  type:'Indicação',   slug:'indicacao',       responses:23,  active:false, color:'#BF5AF2', status:'Arquivado',  fields:[], embedCode:'', webhook:'' },
  { id:4, name:'Qualificação SDR',        type:'Qualificação',slug:'qualificacao-sdr',responses:311, active:true,  color:'#FF9500', status:'Publicado',  fields:[{id:1,type:'Texto',label:'Nome',required:true},{id:2,type:'Email',label:'E-mail',required:true},{id:3,type:'Textarea',label:'Contexto da Lead',required:false}], embedCode:'', webhook:'' },
];

export const MOCK_STOCK_ITEMS = [
  { id:1, name:'Camiseta Cakto',        category:'Vestuário',  qty:32, unit:'un',    updated:'2026-03-10' },
  { id:2, name:'Caneca Premium',        category:'Brinde',     qty:12, unit:'un',    updated:'2026-03-12' },
  { id:3, name:'Notebook Sticker',      category:'Papelaria',  qty: 4, unit:'un',    updated:'2026-03-15' },
  { id:4, name:'Garrafa Térmica 500ml', category:'Brinde',     qty:18, unit:'un',    updated:'2026-03-08' },
  { id:5, name:'Papel A4',              category:'Papelaria',  qty:80, unit:'resma', updated:'2026-03-01' },
];

export const MOCK_AWARDS = [
  { id:1, client:'Rodrigo Pereira',   award:'Camiseta Cakto',        status:'Entregue',   date:'2026-03-10', tracking:'BR123456789' },
  { id:2, client:'Mariana Souza',     award:'Caneca Premium',         status:'Em Trânsito',date:'2026-03-15', tracking:'BR987654321' },
  { id:3, client:'Felipe Alves',      award:'Garrafa Térmica 500ml',  status:'Pendente',   date:'2026-03-18', tracking:'' },
  { id:4, client:'Juliana Martins',   award:'Camiseta Cakto',         status:'Cancelado',  date:'2026-03-05', tracking:'' },
  { id:5, client:'Carlos Eduardo',    award:'Notebook Sticker',       status:'Em Trânsito',date:'2026-03-17', tracking:'BR555666777' },
];

export const MOCK_PAYMENTS = [
  { id:1, userId:1, value:1850.00, ref:'Mar/2026', status:'Pendente', nf:false, date:'2026-03-25', notes:'' },
  { id:2, userId:2, value:980.00,  ref:'Mar/2026', status:'Pendente', nf:true,  date:'2026-03-25', notes:'' },
  { id:3, userId:6, value:2200.00, ref:'Mar/2026', status:'Pago',     nf:true,  date:'2026-03-20', notes:'Pago via PIX' },
  { id:4, userId:3, value:1400.00, ref:'Fev/2026', status:'Pago',     nf:true,  date:'2026-02-28', notes:'' },
  { id:5, userId:7, value:620.00,  ref:'Mar/2026', status:'Pendente', nf:false, date:'2026-03-25', notes:'' },
];

export const MOCK_AUDIT = [
  { user:'Admin Cakto',    action:'Criou responsável Alice Silva',     module:'Responsáveis', date:'2026-03-20 09:12' },
  { user:'Alice Silva',    action:'Adicionou cliente Rodrigo Pereira', module:'Ativações',    date:'2026-03-20 09:14' },
  { user:'Bruno Oliveira', action:'Agendou call com Mariana Souza',    module:'Agenda',       date:'2026-03-20 10:02' },
  { user:'Admin Cakto',    action:'Marcou pagamento como pago',        module:'Pagamentos',   date:'2026-03-19 18:30' },
  { user:'Carla Mendes',   action:'Exportou relatório de ativações',   module:'Dashboards',   date:'2026-03-19 17:00' },
];

export const FORM_FIELD_TYPES = ['Texto','Email','Telefone','CPF','CEP','Endereço','Select','Textarea','Data'];
