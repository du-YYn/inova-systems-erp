"""Views públicas — sem autenticação."""
import logging
import os

from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle
from rest_framework import status
from django.db import transaction as db_tx
from django.http import HttpResponse
from django.utils import timezone

from core.logging_utils import mask_company_name, mask_email
from .models import Proposal, ProposalView, ClientOnboarding, Customer
from .serializers import ClientOnboardingPublicSerializer

logger = logging.getLogger('sales')


class ProposalPublicThrottle(AnonRateThrottle):
    rate = '60/hour'


# F7B.5: throttle adicional por token publico. AnonRateThrottle por IP nao
# protege contra enumeration distribuida — atras de NAT corporativo, varias
# maquinas compartilham IP. Throttling por token previne abuse focado num
# unico link (ex.: scraping repetido apos vazamento).
class _PublicTokenThrottle(SimpleRateThrottle):
    """Base: cache_key = scope + token-da-URL. Subclasses definem scope+rate."""
    def get_cache_key(self, request, view):
        token = view.kwargs.get('token')
        if not token:
            return None
        return f"throttle_{self.scope}_{token}"


class ProposalTokenViewThrottle(_PublicTokenThrottle):
    scope = 'proposal_view'
    rate = '30/minute'


class OnboardingTokenViewThrottle(_PublicTokenThrottle):
    scope = 'onboarding_view'
    rate = '30/minute'


class OnboardingTokenSubmitThrottle(_PublicTokenThrottle):
    scope = 'onboarding_submit'
    rate = '3/hour'


class ProposalPublicView(APIView):
    """Retorna metadados da proposta (para tracking)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    # Sem throttle: visualização de um link público de proposta. Cada abertura
    # faz 2 chamadas (metadados + html); o limite por-token (antes 30/min)
    # estourava com ~15 aberturas/min e o proxy do frontend mascarava o 429
    # como 404/502 ("Proposta não encontrada"). Token é UUIDv4 (não enumerável)
    # e o conteúdo já é do cliente — ler não consome cota.
    throttle_classes = []

    def get(self, request, token):
        try:
            proposal = Proposal.objects.get(public_token=token)
        except Proposal.DoesNotExist:
            return Response(
                {'error': 'Proposta não encontrada.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not proposal.proposal_file:
            return Response(
                {'error': 'Nenhum arquivo anexado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Registrar visualização (deduplica por IP/dia)
        from django.utils import timezone as tz
        ip = request.META.get(
            'HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '')
        )
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()

        today = tz.now().date()
        already_viewed = ProposalView.objects.filter(
            proposal=proposal,
            ip_address=ip,
            viewed_at__date=today,
        ).exists() if ip else False

        if not already_viewed:
            ProposalView.objects.create(
                proposal=proposal,
                ip_address=ip or None,
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            )
            proposal.view_count = (proposal.view_count or 0) + 1
            update_fields = ['view_count']
            # Bug #16: na primeira visualizacao, promove 'sent' -> 'viewed'
            # e grava viewed_at. Status posteriores (negotiation/approved/
            # converted/rejected/expired) NAO sao revertidos.
            if proposal.status == 'sent':
                proposal.status = 'viewed'
                proposal.viewed_at = tz.now()
                update_fields.extend(['status', 'viewed_at'])
            proposal.save(update_fields=update_fields)

        # F7B.2: nao exponha view_count publicamente — telemetria interna.
        # Cliente/competidor nao precisa saber engajamento da empresa.
        return Response({
            'number': proposal.number,
            'title': proposal.title,
            'has_file': True,
        })


class ProposalPublicHTMLView(APIView):
    """Serve o arquivo HTML diretamente — renderiza no browser."""
    permission_classes = [AllowAny]
    authentication_classes = []
    # Link público de proposta — sem limite de abertura (ver ProposalPublicView).
    throttle_classes = []

    WHATSAPP_NUMBER = os.environ.get('WHATSAPP_NUMBER', '5541998594938')
    # Base do link público de cadastro (onboarding). Cada lead tem um token
    # ÚNICO (ClientOnboarding.public_token), então o botão "Aceito proposta"
    # leva ao cadastro do próprio lead — sem cruzamento de dados entre leads.
    ONBOARDING_BASE_URL = os.environ.get(
        'ONBOARDING_PUBLIC_BASE_URL', 'https://cadastro.inovasystemssolutions.com',
    ).rstrip('/')

    def get(self, request, token):
        try:
            proposal = Proposal.objects.select_related(
                'prospect',
            ).get(public_token=token)
        except Proposal.DoesNotExist:
            return HttpResponse(
                '<h1>Proposta não encontrada</h1>',
                content_type='text/html', status=404,
            )

        if not proposal.proposal_file:
            return HttpResponse(
                '<h1>Nenhum arquivo anexado</h1>',
                content_type='text/html', status=404,
            )

        # Ler o arquivo
        try:
            proposal.proposal_file.open('rb')
            content = proposal.proposal_file.read()
            proposal.proposal_file.close()
        except Exception:
            return HttpResponse(
                '<h1>Erro ao ler arquivo</h1>',
                content_type='text/html', status=500,
            )

        # PDF — servir diretamente sem injeção de botões
        if proposal.proposal_file.name.lower().endswith('.pdf'):
            response = HttpResponse(content, content_type='application/pdf')
            response['Content-Disposition'] = f'inline; filename="proposta-{proposal.number}.pdf"'
            response['Cache-Control'] = 'no-store, no-cache'
            response['X-Robots-Tag'] = 'noindex, nofollow'
            return response

        # MODO IFRAME ISOLADO (CodePen-style) — 2026-06-22.
        # O HTML é servido COM o JS preservado e renderizado num iframe
        # sandbox `allow-scripts` SEM `allow-same-origin` (origin opaco): o
        # script roda (animações/capa/scroll-reveal) mas NÃO acessa cookies/
        # storage/sessão do ERP nem o DOM da página pai, e `connect-src 'none'`
        # na CSP impede saída de rede. Por isso NÃO removemos mais o JS via
        # bleach (que quebrava propostas legítimas) — qualquer proposta funciona
        # como projetada. O sanitizer (html_sanitizer.py) segue disponível caso
        # se queira reativar a remoção de JS no futuro.
        #
        # Fallback p/ HTML gerado por IA que usa CSS dependente de JS (.reveal/
        # capa .intro) mas SEM incluir o <script> correspondente: se o HTML não
        # tem <script>, injeta o reveal-fix CSS (revela conteúdo + capa sai
        # sozinha). Se tem <script>, confia no JS da proposta.
        from .html_sanitizer import prepare_for_isolated_iframe
        content = prepare_for_isolated_iframe(content).encode('utf-8')

        # HTML — injetar botões CTA no final
        content = self._inject_cta_buttons(content, proposal)

        response = HttpResponse(content, content_type='text/html; charset=utf-8')
        # CSP do iframe isolado: permite JS/estilos inline da própria proposta,
        # mas TRAVA saída de rede (connect-src 'none' → sem exfiltração/fetch
        # externo) e mantém frame-ancestors 'self'. (A CSP efetiva ao cliente é
        # reaplicada pelo proxy do frontend/middleware; aqui é defesa + acesso
        # direto ao backend.)
        csp = (
            "default-src 'self' data: blob:; "
            "script-src 'unsafe-inline' 'unsafe-eval' data: blob:; "
            "style-src 'unsafe-inline' *; "
            "img-src * data: blob:; "
            "font-src * data:; "
            "media-src * data: blob:; "
            "connect-src 'none'; "
            "frame-ancestors 'self'; "
            "base-uri 'none'; "
            "form-action 'none'; "
            "object-src 'none'"
        )
        response['Content-Security-Policy'] = csp
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-XSS-Protection'] = '1; mode=block'
        response['Cache-Control'] = 'no-store, no-cache'
        response['X-Robots-Tag'] = 'noindex, nofollow'
        return response

    def _build_accept_url(self, proposal) -> str:
        """URL do botão "Aceito proposta de investimento".

        Aponta para o link ÚNICO de cadastro (onboarding) do lead — gerado
        automaticamente no upload da proposta (ProposalViewSet.upload_pdf).
        Como cada lead tem seu próprio ClientOnboarding.public_token, não há
        cruzamento de dados entre leads. Faz fallback para o WhatsApp de aceite
        quando ainda não há onboarding (proposta sem prospect ou enviada antes
        do auto-create).
        """
        if proposal.prospect_id and self.ONBOARDING_BASE_URL:
            onboarding = (
                ClientOnboarding.objects
                .filter(prospect_id=proposal.prospect_id)
                .only('public_token')
                .first()
            )
            if onboarding and onboarding.public_token:
                return f'{self.ONBOARDING_BASE_URL}/{onboarding.public_token}'
        # Fallback: WhatsApp de aceite (comportamento anterior — quando não há
        # link de cadastro disponível).
        return (
            f'https://wa.me/{self.WHATSAPP_NUMBER}'
            f'?text=Aceito%20a%20proposta%20%23{proposal.number}%20e%20gostaria%20'
            f'de%20receber%20o%20cadastro%20para%20iniciar.'
        )

    def _inject_cta_buttons(self, content: bytes, proposal) -> bytes:
        """Injeta botões de ação no final do HTML (puro CSS, sem JS).

        - "Aceito proposta de investimento" → link ÚNICO de cadastro
          (onboarding) do lead, gerado automaticamente no upload da proposta.
          Cada lead tem seu próprio token → sem cruzamento de dados.
        - "Tirar Dúvidas" → WhatsApp da equipe.

        Histórico: o Bug #9 (LGPD) havia trocado o link de cadastro por WhatsApp
        porque o token do onboarding ficava exposto no HTML público
        (compartilhável). Por decisão de processo o link de cadastro voltou — a
        mitigação é o token ser ÚNICO por lead. Ver _build_accept_url (faz
        fallback p/ WhatsApp se não houver onboarding).
        """
        whatsapp_url = (
            f'https://wa.me/{self.WHATSAPP_NUMBER}'
            f'?text=Ol%C3%A1!%20Vi%20a%20proposta%20e%20gostaria%20de%20tirar%20algumas%20d%C3%BAvidas.'
        )
        # "Aceito proposta" → cadastro ÚNICO do lead (ou WhatsApp de fallback).
        accept_url = self._build_accept_url(proposal)

        buttons_html = f'''
<!-- Inova Systems — Botões CTA -->
<div style="
    max-width: 700px;
    margin: 40px auto;
    padding: 32px 24px;
    text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
">
    <div style="
        width: 60px; height: 2px;
        background: linear-gradient(90deg, #A6864A, #c9a75e);
        margin: 0 auto 24px;
    "></div>
    <p style="
        font-size: 18px; font-weight: 600;
        color: #1a1a1a; margin: 0 0 8px;
    ">Gostou da proposta?</p>
    <p style="
        font-size: 14px; color: #666;
        margin: 0 0 28px;
    ">Aceite e preencha o cadastro para darmos início, ou tire suas dúvidas pelo WhatsApp.</p>
    <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
        <a href="{accept_url}" target="_blank" rel="noopener noreferrer" style="
            display: inline-flex; align-items: center; gap: 8px;
            padding: 14px 32px;
            background: linear-gradient(135deg, #A6864A, #c9a75e);
            color: #fff; font-size: 15px; font-weight: 600;
            text-decoration: none; border-radius: 12px;
            box-shadow: 0 4px 14px rgba(166, 134, 74, 0.3);
            transition: transform 0.2s;
        ">
            &#10003; Aceito proposta de investimento
        </a>
        <a href="{whatsapp_url}" target="_blank" style="
            display: inline-flex; align-items: center; gap: 8px;
            padding: 14px 32px;
            background: #25D366; color: #fff;
            font-size: 15px; font-weight: 600;
            text-decoration: none; border-radius: 12px;
            box-shadow: 0 4px 14px rgba(37, 211, 102, 0.3);
        ">
            &#9993; Tirar Dúvidas
        </a>
    </div>
    <p style="
        font-size: 11px; color: #999;
        margin: 20px 0 0;
    ">Inova Systems Solutions</p>
</div>
'''

        content_str = content.decode('utf-8', errors='replace')

        # Injetar antes do último </body> (case-insensitive)
        import re
        # Encontra a ÚLTIMA ocorrência de </body> (case-insensitive)
        matches = list(re.finditer(r'</body>', content_str, re.IGNORECASE))
        if matches:
            pos = matches[-1].start()
            result = content_str[:pos] + buttons_html + content_str[pos:]
        else:
            # Sem </body> — encontra último </html>
            html_matches = list(re.finditer(r'</html>', content_str, re.IGNORECASE))
            if html_matches:
                pos = html_matches[-1].start()
                result = content_str[:pos] + buttons_html + content_str[pos:]
            else:
                result = content_str + buttons_html

        return result.encode('utf-8')


# ── Client Onboarding ────────────────────────────────────────────────────────

class OnboardingPublicThrottle(AnonRateThrottle):
    rate = '10/hour'


class ClientOnboardingPublicView(APIView):
    """Formulário público de cadastro: GET carrega dados, POST submete.

    F7B.5: throttle por token (anti-enumeration) + por IP (anti-flood).
    POST tem throttle mais agressivo que GET (3/h vs 30/min) — submit
    e' acao destrutiva, scraping nao deveria conseguir spammar.
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get_throttles(self):
        # GET: throttle por token de leitura. POST: throttle de submit.
        if self.request.method == 'POST':
            return [OnboardingPublicThrottle(), OnboardingTokenSubmitThrottle()]
        return [OnboardingPublicThrottle(), OnboardingTokenViewThrottle()]

    def get(self, request, token):
        try:
            onboarding = ClientOnboarding.objects.select_related(
                'prospect'
            ).get(public_token=token)
        except ClientOnboarding.DoesNotExist:
            return Response(
                {'error': 'Formulário não encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # F7B.2: pos-submit, retornar payload minimo. CNPJ/CPF/endereco/telefone
        # nao saem mais do servidor — so o status pra UI saber se mostra
        # tela "ja preenchido". Frontend (`onboarding/[token]/page.tsx`)
        # nao precisa dos campos quando status != 'pending'.
        if onboarding.status != 'pending':
            return Response({
                'public_token': str(onboarding.public_token),
                'status': onboarding.status,
                'prospect_company_name': onboarding.prospect.company_name,
            })

        serializer = ClientOnboardingPublicSerializer(onboarding)
        return Response(serializer.data)

    def post(self, request, token):
        try:
            onboarding = ClientOnboarding.objects.select_related(
                'prospect', 'prospect__customer', 'customer',
            ).get(public_token=token)
        except ClientOnboarding.DoesNotExist:
            return Response(
                {'error': 'Formulário não encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if onboarding.status != 'pending':
            return Response(
                {'error': 'Este formulário já foi preenchido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # F7B.4: rejeitar antes de salvar se onboarding aponta pra customer
        # diferente do customer do prospect (corrupcao por race ou edicao manual).
        # Antes, _sync_customer abortava silenciosamente — submit ficava marcado
        # como submitted sem dados propagados.
        if (onboarding.customer_id
                and onboarding.prospect.customer_id
                and onboarding.customer_id != onboarding.prospect.customer_id):
            logger.error(
                'Onboarding %s tem customer_id divergente do prospect — submit recusado.',
                onboarding.id,
            )
            return Response(
                {'error': 'Inconsistência de dados detectada. Contate o suporte.'},
                status=status.HTTP_409_CONFLICT,
            )

        # Bug #8: LGPD Art. 18 VI — se o Customer ja foi anonimizado, o submit
        # do onboarding sobrescreveria os campos (company_name, document,
        # endereco, etc) re-populando dados que o cliente pediu para apagar.
        # Bloqueia explicitamente. Marcador: customer.is_active=False AND
        # company_name comeca com 'ANON-' (padrao definido em
        # CustomerViewSet.anonymize).
        target_customer = (
            onboarding.customer
            or getattr(onboarding.prospect, 'customer', None)
        )
        if target_customer and (
            not target_customer.is_active
            and target_customer.company_name.startswith('ANON-')
        ):
            logger.warning(
                'Onboarding %s: submit recusado — Customer %s anonimizado (LGPD).',
                onboarding.id, target_customer.id,
            )
            return Response(
                {'error': (
                    'Este cadastro nao pode mais ser preenchido. '
                    'Entre em contato com o suporte para abrir um novo cliente.'
                )},
                status=status.HTTP_410_GONE,
            )

        serializer = ClientOnboardingPublicSerializer(
            onboarding, data=request.data, partial=False,
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        ip = request.META.get(
            'HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '')
        )
        if ip and ',' in ip:
            ip = ip.split(',')[0].strip()

        # F7B.4: submit + _sync_customer numa unica transacao. Antes, sync
        # falhava silenciosamente em logger.warning enquanto o response retornava
        # `{success: True}` — onboarding ficava submitted mas Customer fora de
        # sincronia. Agora, falha em sync rola back tudo e retorna 500 explicito.
        try:
            with db_tx.atomic():
                serializer.save(
                    status='submitted',
                    submitted_at=timezone.now(),
                    ip_address=ip or None,
                    user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                )
                self._sync_customer(onboarding)
                self._advance_prospect_on_submit(onboarding)
        except Exception as exc:
            logger.exception(
                'Onboarding %s: falha durante submit/sync, rollback aplicado: %s',
                onboarding.id, exc,
            )
            return Response(
                {'error': 'Erro ao processar cadastro. Tente novamente em instantes.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Notificacoes/emails ficam fora da transacao — sao side effects que
        # nao devem reverter o submit se o broker estiver indisponivel.
        try:
            self._notify_team(onboarding)
        except Exception as exc:
            logger.warning('Onboarding %s: notify_team falhou: %s', onboarding.id, exc)

        try:
            self._send_onboarding_emails(onboarding)
        except Exception as exc:
            logger.warning('Onboarding %s: send_emails falhou: %s', onboarding.id, exc)

        return Response(
            {'success': True, 'message': 'Dados recebidos com sucesso!'},
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def _get_or_create_customer(onboarding):
        """Dedup/cria um Customer quando o onboarding nao tem nenhum vinculado.

        Bug B: leads que chegam em Coleta de Dados sem passar pela aprovacao da
        proposta (ex.: movidos manualmente no Kanban) ficavam sem Customer, e o
        gatilho do Juridico exige Customer. Espelha a dedup da aprovacao
        (email -> razao social/empresa -> cria). O submit publico e anonimo e
        Customer.created_by e obrigatorio, entao usa o dono do prospect.
        """
        prospect = onboarding.prospect
        email = (prospect.contact_email or '').strip()
        company = (onboarding.company_legal_name or prospect.company_name or '').strip()

        customer = None
        if email:
            customer = Customer.objects.filter(email=email).first()
        if customer is None and company:
            customer = Customer.objects.filter(company_name__iexact=company).first()
        if customer is None:
            customer = Customer.objects.create(
                customer_type='PJ',
                company_name=company,
                name=(prospect.contact_name or '').strip(),
                email=email,
                phone=(prospect.contact_phone or '').strip(),
                source='crm',
                created_by=prospect.created_by,
            )
            logger.info(
                'Bug B: Customer %s auto-criado no submit do onboarding %s '
                '(prospect %s).', customer.id, onboarding.id, prospect.id,
            )
        if not prospect.customer_id:
            prospect.customer = customer
            prospect.save(update_fields=['customer'])
        return customer

    @staticmethod
    def _sync_customer(onboarding):
        """Atualiza o Customer vinculado com os dados do onboarding (com lock).

        F7B.4: chamada ja roda dentro de transacao. Se algo falha, propaga
        a Exception pro caller fazer rollback do submit. Antes, qualquer
        erro virava `logger.warning` e o submit ficava marcado como
        completo mesmo com dados nao sincronizados.
        """
        # Determinar qual customer atualizar
        customer_id = onboarding.customer_id
        if not customer_id:
            prospect_customer = getattr(onboarding.prospect, 'customer', None)
            if prospect_customer:
                customer_id = prospect_customer.id
        if not customer_id:
            # Bug B: sem Customer vinculado (lead em Coleta de Dados que pulou a
            # aprovacao da proposta). Cria/deduplica para o submit ter destino no
            # Juridico (que exige Customer). Antes retornava sem criar e o
            # LegalCase nunca nascia.
            customer_id = ClientOnboardingPublicView._get_or_create_customer(onboarding).id

        # Lock no customer para evitar race com edicao concorrente.
        customer = Customer.objects.select_for_update().get(id=customer_id)

        # Montar endereço completo da empresa
        addr_parts = [onboarding.company_street]
        if onboarding.company_number:
            addr_parts.append(onboarding.company_number)
        if onboarding.company_complement:
            addr_parts.append(f'- {onboarding.company_complement}')
        if onboarding.company_neighborhood:
            addr_parts.append(f'- {onboarding.company_neighborhood}')

        customer.company_name = onboarding.company_legal_name
        customer.document = onboarding.company_cnpj
        customer.address = ', '.join(addr_parts)
        customer.city = onboarding.company_city
        customer.state = onboarding.company_state
        customer.cep = onboarding.company_cep
        customer.save(update_fields=[
            'company_name', 'document', 'address',
            'city', 'state', 'cep', 'updated_at',
        ])

        # Vincular onboarding ao customer se ainda não estiver
        if not onboarding.customer_id:
            onboarding.customer = customer
            onboarding.save(update_fields=['customer'])

        # F7B.5: nao logar razao social/CNPJ em texto-plano. Apenas IDs.
        logger.info(
            'Customer %s atualizado via onboarding %s (empresa: %s)',
            customer_id, onboarding.id,
            mask_company_name(onboarding.company_legal_name),
        )

    # v32: status do funil em que o card AINDA está aguardando o cliente
    # preencher o onboarding (Coleta de Dados). Inclui o legado data_collection.
    _PENDING_DATA_COLLECTION_STATUSES = ('coleta_de_dados', 'data_collection')

    @classmethod
    def _advance_prospect_on_submit(cls, onboarding):
        """Avança o card ligado de Coleta de Dados -> Projeto Fechado no submit.

        v32: quando o cliente envia o formulário de onboarding, o card do funil
        precisa progredir de 'coleta_de_dados' (ou do legado 'data_collection')
        para 'projeto_fechado'.

        IDEMPOTENTE e sem regressão: só avança se o prospect estiver num dos
        status de coleta. Cards já em terminal/adiante (projeto_fechado,
        em_producao, concluded, lost, ...) NÃO são alterados — um reenvio/
        reprocessamento não rebaixa o funil.
        """
        prospect = getattr(onboarding, 'prospect', None)
        if prospect is None:
            return
        if prospect.status not in cls._PENDING_DATA_COLLECTION_STATUSES:
            # Bug B: skip diagnosticavel. Card num status ANTERIOR a Coleta de
            # Dados (nao avancado) -> o submit chegou mas o funil nao progride;
            # avisa para nao ficar cego. Status ja avancados/terminais sao skip
            # legitimo (reprocessamento idempotente nao deve gerar ruido).
            from sales.views import ADVANCED_FUNNEL_STATUSES
            if prospect.status not in ADVANCED_FUNNEL_STATUSES:
                logger.warning(
                    'Onboarding %s submetido com prospect %s em status %r '
                    '(anterior a Coleta de Dados) — card NAO avancado para '
                    'projeto_fechado.',
                    onboarding.id, prospect.id, prospect.status,
                )
            return
        prospect.status = 'projeto_fechado'
        prospect.save(update_fields=['status'])
        logger.info(
            'Onboarding %s submetido: prospect %s avançado para projeto_fechado.',
            onboarding.id, prospect.id,
        )

    @staticmethod
    def _send_onboarding_emails(onboarding):
        """Envia emails de confirmação — isolados por destinatário."""
        from notifications.email_renderer import send_template_email

        # Email 1 → SOMENTE o cliente (email do prospect)
        client_email = onboarding.prospect.contact_email
        if client_email:
            send_template_email.delay('onboarding_submitted_client', client_email, {
                'nome_representante': onboarding.rep_full_name,
                'empresa': onboarding.company_legal_name,
            })
            logger.info(
                'Onboarding %s: email cliente enfileirado para %s',
                onboarding.id, mask_email(client_email),
            )

        # Email 2 → SOMENTE a equipe Inova (admins/managers)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        team_emails = User.objects.filter(
            role__in=['admin', 'manager'], is_active=True,
        ).values_list('email', flat=True)
        team_count = 0
        for email in team_emails:
            if email:
                send_template_email.delay('onboarding_submitted_team', email, {
                    'empresa': onboarding.company_legal_name,
                    'nome_representante': onboarding.rep_full_name,
                    'cnpj': onboarding.company_cnpj,
                })
                team_count += 1
        if team_count:
            logger.info(
                'Onboarding %s: email equipe enfileirado para %s admin/manager',
                onboarding.id, team_count,
            )

    @staticmethod
    def _notify_team(onboarding):
        """Cria notificações para a equipe sobre o preenchimento."""
        from notifications.models import Notification
        from django.contrib.auth import get_user_model
        User = get_user_model()

        recipients = User.objects.filter(
            role__in=['admin', 'manager'], is_active=True,
        )
        if onboarding.prospect.assigned_to_id:
            recipients = recipients | User.objects.filter(
                id=onboarding.prospect.assigned_to_id,
            )

        # Titulo/mensagem da notificacao IN-APP podem mostrar dados — sao
        # vistos por usuarios autenticados. Apenas o LOG e' que nao deve
        # vazar PII em texto-plano.
        for user in recipients.distinct():
            Notification.objects.create(
                user=user,
                notification_type='general',
                title=f'Cadastro recebido — {onboarding.prospect.company_name}',
                message=f'{onboarding.rep_full_name} preencheu o formulário de cadastro.',
                object_type='onboarding',
                object_id=onboarding.id,
            )
        logger.info(
            'Notificacoes de onboarding %s enviadas para %s usuarios',
            onboarding.id, recipients.distinct().count(),
        )
