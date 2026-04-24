import uuid
from django.core.management.base import BaseCommand
from core.models import Apresentacao, Usuario


def _n(tipo, titulo, descricao, x, y, bullets=None, cor_override=None):
    return {
        "id": f"n-{uuid.uuid4()}",
        "type": "card",
        "position": {"x": x, "y": y},
        "data": {
            "tipo": tipo,
            "titulo": titulo,
            "descricao": descricao,
            "bullets": bullets or [],
            "cor_override": cor_override,
            "borda": "media",
            "logo_asset_id": None,
            "logo_url": None,
        },
    }


def _e(src, tgt, label="", estilo="bezier", animado=False, cor="#8a8a95"):
    return {
        "id": f"e-{uuid.uuid4()}",
        "source": src,
        "target": tgt,
        "sourceHandle": "right",
        "targetHandle": "t-left",
        "type": "card",
        "data": {
            "estilo": estilo,
            "label": label,
            "seta": True,
            "animado": animado,
            "cor": cor,
            "espessura": "media",
        },
        "markerEnd": {"type": "arrowclosed", "color": cor},
    }


def _p(ordem, titulo, entrando, efeito="fade", duracao=600, stagger=100,
       camera_modo="auto-fit", camera_target=None, camera_zoom=1.0,
       escurecer=False, intensidade=60, narracao=""):
    return {
        "id": f"p-{uuid.uuid4()}",
        "ordem": ordem,
        "titulo": titulo,
        "elementos_entrando": entrando,
        "elementos_saindo": [],
        "entrada": {"efeito": efeito, "duracao_ms": duracao, "stagger_ms": stagger},
        "saida_anteriores": False,
        "camera": {
            "modo": camera_modo,
            "target": camera_target,
            "zoom": camera_zoom,
            "transicao_ms": 800,
        },
        "highlight": {"escurecer_outros": escurecer, "intensidade": intensidade},
        "narracao_apresentador": narracao,
    }


class Command(BaseCommand):
    help = "Cria uma apresentação demo (Automação Inteligente de Atendimento) para o primeiro usuário."

    def handle(self, *args, **options):
        user = Usuario.objects.order_by("id").first()
        if not user:
            self.stderr.write("Nenhum usuário encontrado. Crie um primeiro.")
            return

        # ---- Cards ----
        trigger = _n("trigger", "Cliente envia mensagem",
                     "WhatsApp Business via Evolution API",
                     0, 280,
                     ["Menção a produto/serviço", "Palavras-chave monitoradas", "Disparo em ≤ 1s"])

        ia = _n("ia", "IA Classificadora",
                "Agente GPT-4 identifica intenção e extrai dados",
                360, 280,
                ["Agendamento", "Dúvida comercial", "Reclamação", "Status do pedido"])

        decisao = _n("decisao", "Roteamento",
                     "Decisão baseada na classificação da IA",
                     720, 280,
                     ["If intenção = agendar → calendar", "If = lead → CRM", "Else → resposta direta"])

        agenda = _n("saida", "Criar agendamento",
                    "Google Calendar API + confirmação no chat",
                    1080, 80,
                    ["Sugere 3 horários livres", "Confirma com cliente", "Envia lembretes 24h/1h"])

        banco = _n("banco", "Registrar lead",
                   "Postgres + histórico de conversa",
                   1080, 280,
                   ["Cria/atualiza contato", "Tags por intenção", "Feed alimenta dashboard"])

        resposta = _n("integracao", "Resposta contextual",
                      "Evolution API responde em ≤ 3s",
                      1080, 480,
                      ["Mantém tom da marca", "Inclui referências do chat", "Encaminha a humano se score baixo"])

        fim = _n("customizado", "Lead qualificado",
                 "Entregue ao comercial com contexto completo",
                 1440, 280,
                 ["Score de intenção", "Resumo da conversa", "Próximos passos sugeridos"])

        nodes = [trigger, ia, decisao, agenda, banco, resposta, fim]

        # ---- Edges ----
        e1 = _e(trigger["id"], ia["id"], animado=True)
        e2 = _e(ia["id"], decisao["id"])
        e3 = _e(decisao["id"], agenda["id"], "agendar", "ortogonal", cor="#16a34a")
        e4 = _e(decisao["id"], banco["id"], "lead", "ortogonal", cor="#3b82f6")
        e5 = _e(decisao["id"], resposta["id"], "responder", "ortogonal", cor="#f97316")
        e6 = _e(agenda["id"], fim["id"], "", "ortogonal")
        e7 = _e(banco["id"], fim["id"], "", "ortogonal")
        e8 = _e(resposta["id"], fim["id"], "", "ortogonal")
        edges = [e1, e2, e3, e4, e5, e6, e7, e8]

        # ---- Passos da apresentação ----
        passos = [
            _p(0, "O ponto de entrada",
               [trigger["id"]],
               efeito="fade", camera_modo="foco-card", camera_target=trigger["id"], camera_zoom=1.3,
               narracao="Começamos pelo ponto onde o cliente nos encontra: WhatsApp. Em menos de 1 segundo o sistema já está processando."),

            _p(1, "A IA entra em cena",
               [ia["id"], e1["id"]],
               efeito="slide-right", duracao=700, stagger=150,
               camera_modo="zoom-area",
               narracao="Aqui está o diferencial: uma camada de IA lê a mensagem, identifica intenção e extrai dados estruturados. Isso substitui uma triagem humana."),

            _p(2, "Decisão automática",
               [decisao["id"], e2["id"]],
               efeito="zoom", duracao=600,
               camera_modo="foco-card", camera_target=decisao["id"], camera_zoom=1.4,
               escurecer=True, intensidade=55,
               narracao="A partir da classificação, o sistema decide sozinho qual caminho seguir. Isso antes exigia um atendente lendo cada mensagem."),

            _p(3, "Três ações em paralelo",
               [agenda["id"], banco["id"], resposta["id"], e3["id"], e4["id"], e5["id"]],
               efeito="pop", duracao=500, stagger=120,
               camera_modo="auto-fit",
               narracao="Dependendo da intenção, três ações disparam em paralelo: agendar, gravar o lead, ou responder. Todas em segundos."),

            _p(4, "Convergência",
               [fim["id"], e6["id"], e7["id"], e8["id"]],
               efeito="slide-left", duracao=650, stagger=100,
               camera_modo="travelling",
               narracao="Todo o fluxo converge em um lead qualificado, entregue ao seu comercial com contexto completo — conversa, score e próximos passos."),

            _p(5, "Visão completa",
               [],
               efeito="fade",
               camera_modo="auto-fit", camera_zoom=0.85,
               narracao="Essa é a visão completa. Seis etapas automatizadas, tempo total ≤ 10 segundos, zero intervenção humana até o comercial assumir o contato."),
        ]

        canvas_json = {
            "versao": 1,
            "viewport": {"x": 0, "y": 0, "zoom": 1},
            "nos": nodes,
            "arestas": edges,
        }

        timeline_json = {
            "versao": 1,
            "config_global": {
                "controle_padrao": "setas",
                "permite_modo_livre": True,
                "mostrar_indicador_progresso": True,
                "duracao_transicao_padrao_ms": 800,
            },
            "passos": passos,
        }

        config_json = {
            "tema": "dark",
            "cor_fundo": "#08080E",
            "cor_acento": "#D4AF37",
            "fonte_titulo": "Outfit",
            "fonte_corpo": "Outfit",
            "logo_cliente_url": None,
            "logo_cliente_posicao": "topo-direita",
        }

        apres, created = Apresentacao.objects.update_or_create(
            usuario=user,
            nome="Demo — Automação Inteligente de Atendimento",
            defaults={
                "cliente_nome": "Inova Systems Solutions",
                "status": "publicada",
                "canvas_json": canvas_json,
                "timeline_json": timeline_json,
                "config_json": config_json,
            },
        )
        verbo = "Criada" if created else "Atualizada"
        self.stdout.write(self.style.SUCCESS(
            f"{verbo}: {apres.nome}\n"
            f"ID: {apres.id}\n"
            f"Abra: http://localhost:5173/apresentacao/{apres.id}/editor\n"
            f"Player: http://localhost:5173/apresentacao/{apres.id}/play"
        ))
