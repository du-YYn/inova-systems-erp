# Email Healthcheck (F0)

Guia para validar o stack de email do Inova ERP antes de entregar features que dependem dele (verificação de cadastro, LGPD data-export, password reset, onboarding).

## Stack atual

- **Provedor SMTP:** Resend (`smtp.resend.com:587` com STARTTLS)
- **Remetente:** `noreply@inovasystemssolutions.com`
- **Backend Django:** `django.core.mail.backends.smtp.EmailBackend` em prod, `console` em dev
- **Templates:** armazenados no DB (`EmailTemplate` model), renderizados via `notifications/email_renderer.py`
- **Envio assíncrono:** `send_template_email` como Celery task com retry x3

## Templates seedados (migration 0002)

| Slug | Propósito |
|------|-----------|
| `welcome_partner` | Registro de parceiro com credenciais |
| `password_reset` | Token de reset de senha |
| `lead_received` | Confirma recebimento de lead |
| `lead_closed` | Fecha lead (ganho/perdido) |
| `onboarding_submitted_client` | Confirma submit para cliente |
| `onboarding_submitted_team` | Notifica equipe sobre novo onboarding |

## Como rodar o healthcheck

Em **produção** (via Docker Compose):

```bash
# 1. Validação básica (sem enviar)
docker compose exec backend python manage.py email_healthcheck \
    --to seu@email.com --skip-send

# 2. Envio de email simples
docker compose exec backend python manage.py email_healthcheck \
    --to seu@email.com

# 3. Renderiza e envia um template específico
docker compose exec backend python manage.py email_healthcheck \
    --to seu@email.com --template password_reset

# 4. Testar cada template
for slug in welcome_partner password_reset lead_received lead_closed \
            onboarding_submitted_client onboarding_submitted_team; do
    docker compose exec backend python manage.py email_healthcheck \
        --to seu@email.com --template $slug
done
```

Em **dev local** (sem Docker):

```bash
cd backend
python manage.py email_healthcheck --to seu@email.com
```

## Checklist de validação

### [ ] 1. Config correta em `.env` de produção
- [ ] `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` (não `console`)
- [ ] `EMAIL_HOST_PASSWORD` = API key da Resend (começa com `re_...`)
- [ ] `DEFAULT_FROM_EMAIL` usa domínio verificado na Resend
- [ ] `FRONTEND_URL` aponta para URL real de prod (templates usam isso em links)

### [ ] 2. Conexão SMTP estabelece em < 2 s
Resultado esperado do healthcheck no passo `[2]`.

### [ ] 3. Email simples chega na inbox
- [ ] Chega em < 5 s
- [ ] **NÃO** cai na caixa de SPAM
- [ ] Remetente renderizado como "Inova Systems" (não como endereço cru)

### [ ] 4. Cada template renderiza sem variáveis faltando
Atenção ao aviso `[!] Template tem X var(s) nao fornecidas` — pode significar que:
- A variável é opcional (esperado)
- OU a integração real esqueceu de popular (investigar)

### [ ] 5. DNS do domínio remetente
Verificar no painel DNS do domínio `inovasystemssolutions.com`:

```bash
dig TXT inovasystemssolutions.com | grep -i spf
# Esperado: "v=spf1 include:amazonses.com include:_spf.resend.com -all"

dig TXT resend._domainkey.inovasystemssolutions.com
# Esperado: chave pública DKIM fornecida pela Resend

dig TXT _dmarc.inovasystemssolutions.com
# Esperado: "v=DMARC1; p=quarantine; rua=mailto:..."
```

Sem SPF/DKIM/DMARC alinhados, emails caem em SPAM ou são rejeitados por Gmail/Outlook.

### [ ] 6. Rate limit / quota
Logar no dashboard Resend e confirmar:
- [ ] API key ativa, sem alertas
- [ ] Plano com quota compatível (Free = 100/dia; Pro = 50k/mês)
- [ ] Domínio verificado (status "Verified")

### [ ] 7. Celery worker processando emails async
Se `notifications.email_renderer.send_template_email` for usado via `.delay()`:

```bash
docker compose logs -f celery-worker | grep -i "send_template_email"
```

Esperado: ver tasks executando em segundos, sem `MaxRetriesExceededError`.

### [ ] 8. Error handling
- [ ] Email inválido (`xxx@@invalid`) → `send_mail` levanta exceção, tratada em `email_renderer.py:63-64`
- [ ] SMTP down → task Celery faz retry 3x com backoff 60s
- [ ] Falha não vaza senha: `register_partner` em `sales/partner_views.py:146-186` **vaza `str(e)` no response** (fix em F7.10)

## Troubleshooting

### "FALHA ao conectar: [Errno 110] Connection timed out"
- Firewall bloqueando porta 587 (verificar egress rules do servidor)
- Provider Resend caído (verificar status.resend.com)

### "SMTPAuthenticationError: (535, 'Authentication failed')"
- API key errada ou expirada
- `EMAIL_HOST_USER` deve ser literalmente `resend` (é o user fixo da Resend)

### Email chega mas cai em SPAM
- Falta SPF/DKIM/DMARC → ver passo [5]
- `DEFAULT_FROM_EMAIL` usando domínio não verificado
- Assunto com palavras de spam (evitar "GRÁTIS", excesso de `!`, etc.)

### Template renderiza com `{{variavel}}` literal
- Variável não foi passada no `send_template_email(variables={...})`
- Nome da variável errado no template (case-sensitive)

## Histórico de execução

Registre abaixo cada healthcheck rodado em produção:

| Data | Quem | Resultado | Observações |
|------|------|-----------|-------------|
| 2026-04-24 | — | Pendente | Executar após deploy do F0 |
