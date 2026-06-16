"""v32: Customer.email — unique PARCIAL (apenas quando email != '').

O que faz: adiciona uma UniqueConstraint parcial em Customer.email com
condição ``email != ''``. E-mails em branco ('') continuam permitidos em
qualquer quantidade (default do EmailField(blank=True)); a unicidade vale só
para e-mails não-vazios. A aplicação JÁ depende dessa unicidade
(ProposalViewSet trata IntegrityError de e-mail duplicado como corrida
concorrente — ver views.py _ensure_customer_for_prospect / M1).

SEGURANÇA DE DEPLOY (H1 code review — ERP em PRODUÇÃO):
    Customer.email nunca teve unicidade. O banco de produção PODE conter dois
    ou mais Customers com o MESMO e-mail não-vazio (importação legada, lançamento
    duplicado, mesmo contato em empresas diferentes, conversão de lead do site).
    Se houver QUALQUER duplicata, o ``AddConstraint`` aborta a migration inteira
    com um IntegrityError opaco do PostgreSQL ("could not create unique index")
    — quebrando o deploy no startup do container, sem dizer QUAIS linhas estão
    em conflito.

    Por isso, ANTES do AddConstraint roda um pré-check SOMENTE LEITURA
    (``RunPython``, sem reverse) que detecta duplicatas de e-mail não-vazio e
    levanta um erro CLARO e ACIONÁVEL, listando os e-mails e os IDs em conflito.
    Em base limpa (local/dev/prod sem duplicatas) é um NO-OP e a constraint
    aplica normalmente.

    O pré-check NÃO mexe em dado nenhum: decidir COMO reconciliar as duplicatas
    (qual linha mantém o e-mail, qual é mesclada/em-branco) é decisão de
    negócio do John/ops — não é improvisável numa migration. Reconciliada a
    base (merge/blank das linhas perdedoras, passo aditivo), o deploy roda.

Reverse: o reverse do AddConstraint remove a constraint; o pré-check tem reverse
no-op (nunca alterou dado).
"""

from django.db import migrations, models


def check_no_duplicate_emails(apps, schema_editor):
    """Pré-check read-only: aborta com erro acionável se houver e-mail
    não-vazio duplicado (que faria o AddConstraint quebrar o deploy)."""
    Customer = apps.get_model('sales', 'Customer')
    from django.db.models import Count

    dups = (
        Customer.objects.exclude(email='')
        .values('email')
        .annotate(n=Count('id'))
        .filter(n__gt=1)
        .order_by('-n')
    )
    dups = list(dups)
    if not dups:
        return  # base limpa — no-op

    lines = []
    for row in dups:
        ids = list(
            Customer.objects.filter(email=row['email'])
            .order_by('id')
            .values_list('id', flat=True)
        )
        lines.append(f"  {row['email']!r}: {row['n']} registros (ids={ids})")
    detail = '\n'.join(lines)
    # A query real e via ORM (acima). O texto abaixo so cita um SELECT de
    # verificacao manual (nao executado) — ruff S608 e falso-positivo aqui.
    raise RuntimeError(
        'Migration sales.0036 abortada: existem Customers com e-mail '  # noqa: S608
        'NÃO-VAZIO duplicado, o que impede a criação da UniqueConstraint '
        "parcial 'uniq_customer_email_not_blank' (o AddConstraint falharia "
        'com IntegrityError no deploy).\n'
        f'{len(dups)} e-mail(s) em conflito:\n{detail}\n\n'
        'Ação (decisão de negócio — John/ops): reconcilie as duplicatas '
        'antes de aplicar (mesclar os registros ou esvaziar o e-mail das '
        'linhas perdedoras — passo ADITIVO). Em seguida rode o migrate '
        'novamente. Verificação manual:\n'
        "  SELECT email, COUNT(*) FROM customers WHERE email <> '' "
        'GROUP BY email HAVING COUNT(*) > 1;'
    )


def reverse_check(apps, schema_editor):
    """No-op: o pré-check nunca alterou dado."""


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0035_add_funnel_status_choices_v32'),
    ]

    operations = [
        migrations.RunPython(check_no_duplicate_emails, reverse_check),
        migrations.AddConstraint(
            model_name='customer',
            constraint=models.UniqueConstraint(condition=models.Q(('email__gt', '')), fields=('email',), name='uniq_customer_email_not_blank'),
        ),
    ]
