// Monta o workflow n8n a partir das specs dos 6 setores (saída dos subagentes).
const fs = require('fs');

const SPECS = {
comercial:{sector:"comercial",nodes:[
 {key:"new",label:"Lead recebido",entity:"Prospect.status=new",kind:"trigger",note:"Lead entra no funil",next:["qualifying"]},
 {key:"qualifying",label:"Em qualificação",entity:"Prospect.status=qualifying",kind:"action",note:"SDR qualifica",next:["qualified"]},
 {key:"qualified",label:"Qualificado",entity:"Prospect.status=qualified",kind:"action",note:"Lead validado",next:["meeting_invite"]},
 {key:"meeting_invite",label:"Convite para Reunião",entity:"Prospect.status=meeting_invite",kind:"action",note:"Envia convite",next:["scheduled"]},
 {key:"scheduled",label:"Agendado",entity:"Prospect.status=scheduled",kind:"action",note:"Reunião marcada",next:["pre_meeting"]},
 {key:"pre_meeting",label:"Pré-Reunião",entity:"Prospect.status=pre_meeting",kind:"action",note:"Sequência de preparação",next:["meeting_1_done"]},
 {key:"meeting_1_done",label:"Reunião 1 realizada",entity:"Prospect.status=meeting_1_done",kind:"action",note:"Descoberta",next:["tech_analysis"]},
 {key:"tech_analysis",label:"Análise técnica e proposta",entity:"Prospect.status=tech_analysis",kind:"action",note:"Dev define escopo/prazo/valor + tipo",next:["meeting_2_done"]},
 {key:"meeting_2_done",label:"Reunião 2 realizada",entity:"Prospect.status=meeting_2_done",kind:"action",note:"Apresenta proposta",next:["proposal"]},
 {key:"proposal",label:"Proposta enviada",entity:"Prospect.status=proposal · Proposal",kind:"decision",note:"Aceita ou não fecha",next:["won"]},
 {key:"won",label:"Projeto Fechado",entity:"Prospect.status=won",kind:"action",note:"Dispara abertura + ClientOnboarding",next:["data_collection"]},
 {key:"data_collection",label:"Coleta de dados",entity:"ClientOnboarding.status=submitted",kind:"automation",note:"Dispara Jurídico + Financeiro em paralelo",next:[]}
]},
juridico:{sector:"juridico",nodes:[
 {key:"contrato_entrada",label:"Entrada contrato (Coleta)",entity:"LegalCase(contrato).source=comercial",kind:"trigger",note:"Cria caso de contrato",next:["contrato_preparacao"]},
 {key:"contrato_preparacao",label:"Contrato · Preparação",entity:"LegalCase(contrato).status=preparacao",kind:"action",note:"Elabora contrato",next:["contrato_envio"]},
 {key:"contrato_envio",label:"Contrato · Envio (Autentique)",entity:"status=envio_assinatura",kind:"action",note:"Sobe no Autentique",next:["contrato_aguardando"]},
 {key:"contrato_aguardando",label:"Contrato · Aguardando",entity:"status=aguardando_assinatura",kind:"action",note:"Aguarda assinatura",next:["contrato_assinado"]},
 {key:"contrato_assinado",label:"Contrato · Assinado",entity:"status=assinado",kind:"decision",note:"Formalizado",next:["contrato_libera_financeiro"]},
 {key:"contrato_libera_financeiro",label:"Disparo: libera cobrança",entity:"LegalCase(contrato).assinado",kind:"automation",note:"Ativa cobrança no Financeiro",next:[]},
 {key:"validacao_entrada",label:"Entrada validação (Etapa 6)",entity:"LegalCase(validacao_documento).source=producao",kind:"trigger",note:"Cria caso de validação",next:["validacao_preparacao"]},
 {key:"validacao_preparacao",label:"Validação · Anexar termo + Autentique",entity:"status=preparacao",kind:"action",note:"Anexa e sobe",next:["validacao_envio"]},
 {key:"validacao_envio",label:"Validação · Envio",entity:"status=envio_assinatura",kind:"action",note:"Envia ao cliente",next:["validacao_aguardando"]},
 {key:"validacao_aguardando",label:"Validação · Aguardando",entity:"status=aguardando_assinatura",kind:"action",note:"Aguarda",next:["validacao_assinado"]},
 {key:"validacao_assinado",label:"Validação · Assinado",entity:"status=assinado",kind:"decision",note:"Baseline",next:["validacao_libera_producao"]},
 {key:"validacao_libera_producao",label:"Disparo: libera Etapa 7",entity:"LegalCase(validacao).assinado",kind:"automation",note:"Libera Desenvolvimento",next:[]},
 {key:"aditivo_entrada",label:"Entrada aditivo (mudança)",entity:"LegalCase(aditivo).source=producao",kind:"trigger",note:"Mudança de escopo",next:["aditivo_preparacao"]},
 {key:"aditivo_preparacao",label:"Aditivo · Preparação",entity:"status=preparacao",kind:"action",note:"Elabora aditivo",next:["aditivo_envio"]},
 {key:"aditivo_envio",label:"Aditivo · Envio (Autentique)",entity:"status=envio_assinatura",kind:"action",note:"Sobe e envia",next:["aditivo_aguardando"]},
 {key:"aditivo_aguardando",label:"Aditivo · Aguardando",entity:"status=aguardando_assinatura",kind:"action",note:"Aguarda",next:["aditivo_assinado"]},
 {key:"aditivo_assinado",label:"Aditivo · Assinado",entity:"status=assinado",kind:"decision",note:"Formalizado",next:["aditivo_libera_producao","aditivo_libera_financeiro"]},
 {key:"aditivo_libera_producao",label:"Disparo: nova fase",entity:"LegalCase(aditivo).assinado",kind:"automation",note:"Abre nova fase na Produção",next:[]},
 {key:"aditivo_libera_financeiro",label:"Disparo: ajuste de valor",entity:"LegalCase(aditivo).assinado",kind:"automation",note:"Ajusta cobrança",next:[]},
 {key:"encerramento_entrada",label:"Entrada encerramento (cliente)",entity:"LegalCase(encerramento).source=cliente",kind:"trigger",note:"Cliente solicita",next:["encerramento_preparacao"]},
 {key:"encerramento_preparacao",label:"Encerramento · Pendências + distrato",entity:"status=preparacao",kind:"action",note:"Analisa e elabora distrato",next:["encerramento_envio"]},
 {key:"encerramento_envio",label:"Encerramento · Envio (Autentique)",entity:"status=envio_assinatura",kind:"action",note:"Sobe e envia",next:["encerramento_aguardando"]},
 {key:"encerramento_aguardando",label:"Encerramento · Aguardando",entity:"status=aguardando_assinatura",kind:"action",note:"Aguarda",next:["encerramento_assinado"]},
 {key:"encerramento_assinado",label:"Encerramento · Assinado",entity:"status=assinado",kind:"decision",note:"Distrato formalizado",next:["encerramento_libera_financeiro"]},
 {key:"encerramento_libera_financeiro",label:"Disparo: acerto final",entity:"LegalCase(encerramento).assinado",kind:"automation",note:"Acerto final no Financeiro",next:[]}
]},
financeiro:{sector:"financeiro",nodes:[
 {key:"pre_cadastro_invoice",label:"Pré-cadastra fatura pendente",entity:"Invoice.status=pending (ProposalPaymentPlan)",kind:"trigger",note:"Em paralelo com o Jurídico",next:["aguarda_contrato_assinado"]},
 {key:"aguarda_contrato_assinado",label:"Aguarda contrato assinado",entity:"LegalCase(contrato).status=assinado",kind:"decision",note:"Espera o gatilho do Jurídico",next:["cobranca_ativa"]},
 {key:"cobranca_ativa",label:"Libera cobrança ativa",entity:"Invoice enviável/cobrável",kind:"action",note:"Regra de ouro: só após assinatura",next:["regua_cobranca","entrada_paga"]},
 {key:"regua_cobranca",label:"Régua de cobrança",entity:"check_invoice_overdue",kind:"automation",note:"Dunning (entra agora)",next:["entrada_paga"]},
 {key:"entrada_paga",label:"Entrada paga",entity:"Invoice.status=paid",kind:"automation",note:"Libera a Produção (Dia 0)",next:[]},
 {key:"contas_a_pagar",label:"Contas a pagar",entity:"RecurringExpense, TaxEntry, Transaction",kind:"action",note:"Informativo",next:[]},
 {key:"faturamento_fiscal",label:"Faturamento e fiscal",entity:"Invoice NFS-e, TaxConfig",kind:"action",note:"Informativo · emissão real fase posterior",next:[]},
 {key:"cobranca_inadimplencia",label:"Cobrança e inadimplência",entity:"Invoice(overdue)",kind:"action",note:"Informativo",next:[]},
 {key:"fluxo_de_caixa",label:"Fluxo de caixa e gestão",entity:"Transaction, DRE, MRR/churn",kind:"action",note:"Informativo · MRR/conciliação fase posterior",next:[]}
]},
producao:{sector:"producao",nodes:[
 {key:"etapa_3_preparacao",label:"E3 · Preparação",entity:"Project.etapa_atual=etapa_3",kind:"trigger",note:"Entra com a entrada paga; não conta no prazo",next:["etapa_4_onboarding"]},
 {key:"etapa_4_onboarding",label:"E4 · Onboarding (Dia 0)",entity:"etapa_4 · OnboardingMappingForm",kind:"action",note:"Seta dia_zero e dispara o Motor de Cronograma",next:["etapa_5_documentacao"]},
 {key:"etapa_5_documentacao",label:"E5 · Documentação",entity:"etapa_5 · ProjectDocument",kind:"action",note:"12 seções viram baseline",next:["etapa_6_validacao_doc"]},
 {key:"etapa_6_validacao_doc",label:"E6 · Validação da doc",entity:"etapa_6 · ProjectDocument",kind:"action",note:"Segue p/ assinatura no Jurídico",next:["etapa_7_desenvolvimento"]},
 {key:"etapa_7_desenvolvimento",label:"E7 · Desenvolvimento",entity:"etapa_7",kind:"action",note:"Só com doc assinada; paralelo ao WeeklyUpdate",next:["etapa_8_auditoria"]},
 {key:"etapa_8_auditoria",label:"E8 · Auditoria interna",entity:"etapa_8 · ProjectAudit",kind:"action",note:"Aprovada destrava a Etapa 9",next:["etapa_9_apresentacao"]},
 {key:"etapa_9_apresentacao",label:"E9 · Apresentação/liberação",entity:"etapa_9 · DeliveryApproval",kind:"action",note:"Link admin único",next:["homologacao"]},
 {key:"homologacao",label:"Homologação",entity:"homologacao · ReUpdateCycle",kind:"action",note:"Janela de teste + re-update",next:["registro_entrega"]},
 {key:"registro_entrega",label:"Registro da versão",entity:"ProjectEnvironment",kind:"action",note:"Cliente aprovou",next:["bifurcacao_tipo"]},
 {key:"bifurcacao_tipo",label:"Bifurcação por tipo",entity:"Project.tipo",kind:"decision",note:"Fechado → graduação; Recorrente → implementação",next:["etapa_10_graduacao","implementacao"]},
 {key:"etapa_10_graduacao",label:"E10 · Graduação",entity:"etapa_10_graduacao",kind:"action",note:"Cria RecurrenceContract(suporte_basico)",next:["recorrencia"]},
 {key:"implementacao",label:"Implementação",entity:"implementacao",kind:"action",note:"Cria RecurrenceContract(operacao_continua)",next:["recorrencia"]},
 {key:"recorrencia",label:"Recorrência",entity:"recorrencia · RecurrenceContract",kind:"automation",note:"Todo entregue entra em recorrência + Suporte",next:[]}
]},
suporte:{sector:"suporte",nodes:[
 {key:"chamado_aberto",label:"Chamado aberto",entity:"SupportTicket.status=aberto",kind:"trigger",note:"Canal único, token assinado",next:["triagem"]},
 {key:"triagem",label:"Triagem",entity:"status=triagem",kind:"decision",note:"bug→análise · dúvida→resolve · mudança→update",next:["analise","resolve_direto","pedido_update"]},
 {key:"resolve_direto",label:"Resolve direto",entity:"status=resolvido",kind:"action",note:"Dúvida respondida na hora",next:["fechado"]},
 {key:"pedido_update",label:"Pedido de update",entity:"PedidoUpdate.status=opened",kind:"automation",note:"Mudança vira Prospect (tech_analysis)",next:["resolvido"]},
 {key:"analise",label:"Análise",entity:"status=analise · conclusao",kind:"decision",note:"garantia/orçamento/recorrente/inconclusivo",next:["correcao","escala_diretoria"]},
 {key:"correcao",label:"Correção / Orçamento",entity:"status=correcao",kind:"action",note:"Garantia, recorrente ou orçamento",next:["resolvido"]},
 {key:"escala_diretoria",label:"Escala Diretoria",entity:"conclusao=inconclusivo",kind:"automation",note:"Cria DirectorEscalation",next:["resolvido"]},
 {key:"resolvido",label:"Resolvido",entity:"status=resolvido",kind:"action",note:"Aguarda retorno do cliente",next:["fechado"]},
 {key:"fechado",label:"Fechado",entity:"status=fechado",kind:"action",note:"Auto-fecha após 5 dias (configurável)",next:[]}
]},
diretoria:{sector:"diretoria",nodes:[
 {key:"escalacao_recebida",label:"Escalação recebida",entity:"DirectorEscalation",kind:"trigger",note:"Do Suporte (inconclusivo)",next:["analise_resumo"]},
 {key:"analise_resumo",label:"Análise (resumo + evidência)",entity:"DirectorEscalation",kind:"action",note:"Recebe o caso",next:["decisao"]},
 {key:"decisao",label:"Decisão",entity:"decision",kind:"decision",note:"absorver/cobrar/negociar",next:["devolve_decisao"]},
 {key:"devolve_decisao",label:"Devolve decisão ao fluxo",entity:"DirectorEscalation.resolved",kind:"automation",note:"Atualiza o ticket",next:[]},
 {key:"reuniao_semanal",label:"Reunião semanal de Diretoria",entity:"DirectoryMeeting",kind:"automation",note:"Cadência semanal · agrega KPIs",next:[]}
]},
};

// Conexões entre setores (origem -> destino explícito)
const CROSS = [
 ["comercial","data_collection","juridico","contrato_entrada","Coleta → cria contrato"],
 ["comercial","data_collection","financeiro","pre_cadastro_invoice","Coleta → pré-cadastro (paralelo)"],
 ["juridico","contrato_libera_financeiro","financeiro","aguarda_contrato_assinado","Contrato assinado → libera cobrança"],
 ["financeiro","entrada_paga","producao","etapa_3_preparacao","Entrada paga → libera Produção (Dia 0)"],
 ["producao","etapa_6_validacao_doc","juridico","validacao_entrada","Etapa 6 → envia doc ao Jurídico"],
 ["juridico","validacao_libera_producao","producao","etapa_7_desenvolvimento","Doc assinada → libera Etapa 7"],
 ["juridico","aditivo_libera_producao","producao","etapa_7_desenvolvimento","Aditivo → nova fase"],
 ["juridico","aditivo_libera_financeiro","financeiro","cobranca_inadimplencia","Aditivo → ajuste de valor"],
 ["juridico","encerramento_libera_financeiro","financeiro","cobranca_inadimplencia","Encerramento → acerto final"],
 ["producao","etapa_10_graduacao","suporte","chamado_aberto","Graduação → Suporte Básico"],
 ["producao","implementacao","suporte","chamado_aberto","Implementação → Operação Contínua"],
 ["suporte","pedido_update","comercial","tech_analysis","Mudança → Comercial (PedidoUpdate)"],
 ["suporte","escala_diretoria","diretoria","escalacao_recebida","Inconclusivo → Diretoria"],
 ["diretoria","devolve_decisao","suporte","analise","Decisão devolvida ao ticket"],
];

const ORDER = ["comercial","juridico","financeiro","producao","suporte","diretoria"];
const SECCOLOR = {comercial:3,juridico:5,financeiro:4,producao:6,suporte:2,diretoria:7};
const SECTITLE = {comercial:"CRM COMERCIAL",juridico:"CRM JURÍDICO",financeiro:"CRM FINANCEIRO",producao:"CRM DE PRODUÇÃO",suporte:"CRM DE SUPORTE",diretoria:"DIRETORIA"};
const PFX = {trigger:"⛳ ",automation:"⚡ ",decision:"🔀 ",action:"🔹 "};

const nodes=[], connections={}, nameOf={}, usedNames=new Set();
let nid=0;
const LANE_H=560, COLW=250, X0=360, ROWH=130;

function uniqueName(base,sec,key){
  let n=base; if(usedNames.has(n)) n=`${base} (${key})`;
  let i=2; while(usedNames.has(n)){ n=`${base} (${key}-${i++})`; }
  usedNames.add(n); return n;
}

ORDER.forEach((sec,si)=>{
  const spec=SPECS[sec]; const baseY=si*LANE_H;
  // layout: nova sub-linha a cada trigger
  let row=-1, x=0, maxX=0, maxRow=0;
  const pos={};
  spec.nodes.forEach(nd=>{
    if(nd.kind==='trigger'){ row++; x=0; } else { x++; }
    pos[nd.key]={x,row}; maxX=Math.max(maxX,x); maxRow=Math.max(maxRow,row);
  });
  // sticky da raia
  nodes.push({parameters:{content:`## ${SECTITLE[sec]}`,height:(maxRow+1)*ROWH+70,width:(maxX+1)*COLW+340,color:SECCOLOR[sec]},
    id:`sticky_${sec}`,name:`__lane_${sec}`,type:"n8n-nodes-base.stickyNote",typeVersion:1,position:[20,baseY+10]});
  // nós
  spec.nodes.forEach(nd=>{
    const base=PFX[nd.kind]+nd.label;
    const name=uniqueName(base,sec,nd.key);
    nameOf[sec+":"+nd.key]=name;
    const p=pos[nd.key];
    nodes.push({parameters:{},id:`n${++nid}`,name,
      type:"n8n-nodes-base.noOp",typeVersion:1,
      position:[X0+p.x*COLW, baseY+70+p.row*ROWH],
      notes:`[${nd.kind}] ${nd.entity} — ${nd.note}`, notesInFlow:true});
  });
});

function connect(srcName,tgtName){
  if(!connections[srcName]) connections[srcName]={main:[[]]};
  connections[srcName].main[0].push({node:tgtName,type:"main",index:0});
}
// internas
ORDER.forEach(sec=>{
  SPECS[sec].nodes.forEach(nd=>{
    (nd.next||[]).forEach(k=>{
      const s=nameOf[sec+":"+nd.key], tg=nameOf[sec+":"+k];
      if(s&&tg) connect(s,tg);
    });
  });
});
// cross
CROSS.forEach(([ss,sk,ts,tk])=>{
  const s=nameOf[ss+":"+sk], tg=nameOf[ts+":"+tk];
  if(s&&tg) connect(s,tg); else console.error("CROSS faltando:",ss,sk,"->",ts,tk);
});

const wf={
  name:"Inova · Processo Completo (v32) — Empresa Rodando",
  nodes, connections, active:false, settings:{executionOrder:"v1"},
  pinData:{}, meta:{instanceId:"inova-processo-v32"}, tags:[]
};
fs.writeFileSync("fluxo-n8n.json", JSON.stringify(wf,null,2));
console.log("OK nodes:",nodes.length," conexões(origens):",Object.keys(connections).length,
  " arestas:",Object.values(connections).reduce((a,c)=>a+c.main[0].length,0));
