"""Smoke test do stack de email (F0 do workflow de segurança).

Uso:
    docker compose exec backend python manage.py email_healthcheck --to seu@email.com
    docker compose exec backend python manage.py email_healthcheck --to seu@email.com --template password_reset

Executa:
  1. Valida configs EMAIL_* no settings
  2. Testa conexão SMTP (sem enviar)
  3. Envia email direto via send_mail()
  4. Renderiza e envia via EmailTemplate (opcional)
  5. Reporta message-id, tempo, erros
"""
import time
from django.conf import settings
from django.core.mail import send_mail, get_connection
from django.core.management.base import BaseCommand, CommandError

from notifications.email_renderer import render_template, send_template_email_sync
from notifications.models import EmailTemplate


class Command(BaseCommand):
    help = 'Smoke test do stack de email'

    def add_arguments(self, parser):
        parser.add_argument('--to', required=True, help='Email destino do teste')
        parser.add_argument(
            '--template', default=None,
            help='Slug do EmailTemplate para testar (ex: password_reset, welcome_partner)',
        )
        parser.add_argument(
            '--skip-send', action='store_true',
            help='Apenas valida config + conexão, não envia email real',
        )

    def handle(self, *args, **opts):
        to = opts['to']
        tpl_slug = opts['template']
        skip_send = opts['skip_send']

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== F0 Email Healthcheck ===\n'))

        self._check_config()

        if skip_send:
            self.stdout.write(self.style.WARNING('--skip-send: pulando envio real\n'))
            return

        self._check_smtp_connection()
        self._send_plain(to)

        if tpl_slug:
            self._send_template(tpl_slug, to)
        else:
            self._list_templates()

        self.stdout.write(self.style.SUCCESS('\n[OK] Healthcheck concluido\n'))

    def _check_config(self):
        self.stdout.write('[1] Config EMAIL_*:')
        required = [
            'EMAIL_BACKEND', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USE_TLS',
            'EMAIL_HOST_USER', 'DEFAULT_FROM_EMAIL',
        ]
        for key in required:
            val = getattr(settings, key, None)
            if key == 'EMAIL_HOST_PASSWORD':
                val = '***' if getattr(settings, key) else '(VAZIO!)'
            self.stdout.write(f'    {key} = {val}')

        pwd = getattr(settings, 'EMAIL_HOST_PASSWORD', '')
        if not pwd:
            self.stdout.write(self.style.ERROR(
                '    [!] EMAIL_HOST_PASSWORD vazio — emails vao falhar em SMTP real'
            ))
        if 'console' in settings.EMAIL_BACKEND:
            self.stdout.write(self.style.WARNING(
                '    [!] EMAIL_BACKEND = console — emails VAO PARA STDOUT, nao sao entregues'
            ))

    def _check_smtp_connection(self):
        self.stdout.write('\n[2] Testando conexao SMTP:')
        try:
            conn = get_connection()
            t0 = time.time()
            conn.open()
            conn.close()
            elapsed = (time.time() - t0) * 1000
            self.stdout.write(self.style.SUCCESS(
                f'    OK (conexao + handshake em {elapsed:.0f} ms)'
            ))
        except Exception as exc:
            raise CommandError(f'    FALHA ao conectar: {exc}')

    def _send_plain(self, to):
        self.stdout.write(f'\n[3] Enviando email simples para {to}:')
        subject = 'Inova ERP — Email Healthcheck (F0)'
        body = (
            'Este e um email automatico de teste do healthcheck do stack de email.\n\n'
            f'De: {settings.DEFAULT_FROM_EMAIL}\n'
            f'Para: {to}\n'
            f'Via: {settings.EMAIL_HOST}:{settings.EMAIL_PORT}\n\n'
            'Se voce recebeu este email, o SMTP basico esta funcional.\n'
            'Verifique tambem: caixa de SPAM, SPF/DKIM/DMARC alignment.\n'
        )
        t0 = time.time()
        try:
            sent = send_mail(
                subject, body, settings.DEFAULT_FROM_EMAIL, [to],
                fail_silently=False,
            )
            elapsed = (time.time() - t0) * 1000
            if sent:
                self.stdout.write(self.style.SUCCESS(
                    f'    OK (enviado em {elapsed:.0f} ms; return={sent})'
                ))
            else:
                self.stdout.write(self.style.ERROR('    send_mail retornou 0'))
        except Exception as exc:
            raise CommandError(f'    FALHA: {exc}')

    def _send_template(self, slug, to):
        self.stdout.write(f'\n[4] Testando EmailTemplate slug={slug} para {to}:')
        sample_vars = {
            'nome': 'Teste Healthcheck', 'first_name': 'Teste',
            'email': to, 'senha': 'senhaTeste123',
            'reset_link': 'https://example.com/reset',
            'company_name': 'Empresa Teste', 'prospect_company': 'Empresa Teste',
            'contact_name': 'Contato Teste',
            'link': 'https://example.com',
        }
        rendered = render_template(slug, sample_vars)
        if not rendered:
            self.stdout.write(self.style.ERROR(
                f'    Template "{slug}" nao encontrado ou inativo'
            ))
            return

        missing = []
        body = rendered['html']
        import re
        remaining = re.findall(r'\{\{(\w+)\}\}', body)
        if remaining:
            self.stdout.write(self.style.WARNING(
                f'    Variaveis nao substituidas no render: {remaining}'
            ))
            missing = remaining

        t0 = time.time()
        ok = send_template_email_sync(slug, to, sample_vars)
        elapsed = (time.time() - t0) * 1000
        if ok:
            self.stdout.write(self.style.SUCCESS(
                f'    OK (renderizado e enviado em {elapsed:.0f} ms)'
            ))
            if missing:
                self.stdout.write(self.style.WARNING(
                    f'    [!] Template tem {len(missing)} var(s) nao fornecidas no teste'
                ))
        else:
            self.stdout.write(self.style.ERROR('    FALHA no envio'))

    def _list_templates(self):
        self.stdout.write('\n[4] Templates disponiveis no DB:')
        for t in EmailTemplate.objects.all().order_by('slug'):
            status = 'ativo' if t.is_active else 'INATIVO'
            self.stdout.write(f'    - {t.slug} ({status}) - "{t.subject[:60]}"')
        self.stdout.write(
            '\n    Para testar um template: --template <slug>'
        )
