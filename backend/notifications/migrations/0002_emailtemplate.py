from django.db import migrations, models


def create_default_templates(apps, schema_editor):
    EmailTemplate = apps.get_model('notifications', 'EmailTemplate')

    BASE_STYLE = """
<div style="background:#0a0a0a;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;background:#111;border-radius:16px;border:1px solid #1a1a1a;overflow:hidden;">
<div style="padding:24px 32px;border-bottom:1px solid #1a1a1a;text-align:center;">
<h1 style="color:#A6864A;font-size:24px;margin:0;">Inova.</h1>
<p style="color:#666;font-size:12px;margin:4px 0 0;">Systems Solutions</p>
</div>
<div style="padding:32px;">
{content}
</div>
<div style="padding:16px 32px;border-top:1px solid #1a1a1a;text-align:center;">
<p style="color:#555;font-size:11px;margin:0;">Inova Systems Solutions &mdash; inovasystemssolutions.com</p>
</div>
</div>
</div>
""".strip()

    def wrap(content):
        return BASE_STYLE.replace('{content}', content)

    templates = [
        {
            'slug': 'welcome_partner',
            'name': 'Boas-vindas Parceiro',
            'subject': 'Bem-vindo ao programa de parceiros — Inova Systems',
            'recipient_type': 'partner',
            'variables': [
                {'key': 'nome', 'description': 'Nome do parceiro'},
                {'key': 'email', 'description': 'Email de acesso'},
                {'key': 'senha', 'description': 'Senha provisória'},
                {'key': 'link_portal', 'description': 'Link do portal'},
            ],
            'body_html': wrap(
                '<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Olá, {{nome}}!</h2>'
                '<p style="color:#999;font-size:14px;line-height:1.6;">Você foi cadastrado como parceiro de indicação da Inova Systems. Abaixo estão seus dados de acesso:</p>'
                '<div style="background:#0a0a0a;border-radius:12px;padding:20px;margin:20px 0;">'
                '<p style="color:#999;font-size:13px;margin:0 0 8px;"><strong style="color:#ccc;">Email:</strong> {{email}}</p>'
                '<p style="color:#999;font-size:13px;margin:0;"><strong style="color:#ccc;">Senha:</strong> {{senha}}</p>'
                '</div>'
                '<p style="color:#999;font-size:14px;">Recomendamos alterar sua senha no primeiro acesso.</p>'
                '<div style="text-align:center;margin:28px 0 0;">'
                '<a href="{{link_portal}}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#A6864A,#c9a75e);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">Acessar Portal do Parceiro</a>'
                '</div>'
            ),
        },
        {
            'slug': 'password_reset',
            'name': 'Redefinição de Senha',
            'subject': 'Redefinição de senha — Inova Systems',
            'recipient_type': 'requester',
            'variables': [
                {'key': 'nome', 'description': 'Nome do usuário'},
                {'key': 'link_reset', 'description': 'Link para redefinir senha'},
            ],
            'body_html': wrap(
                '<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Redefinição de Senha</h2>'
                '<p style="color:#999;font-size:14px;line-height:1.6;">Olá, {{nome}}. Você solicitou a redefinição de sua senha.</p>'
                '<p style="color:#999;font-size:14px;">Clique no botão abaixo para criar uma nova senha. O link é válido por 24 horas.</p>'
                '<div style="text-align:center;margin:28px 0;">'
                '<a href="{{link_reset}}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#A6864A,#c9a75e);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">Redefinir Senha</a>'
                '</div>'
                '<p style="color:#666;font-size:12px;">Se você não solicitou isso, ignore este email.</p>'
            ),
        },
        {
            'slug': 'lead_received',
            'name': 'Novo Lead de Parceiro',
            'subject': 'Novo lead indicado: {{empresa_lead}}',
            'recipient_type': 'team',
            'variables': [
                {'key': 'nome_parceiro', 'description': 'Nome do parceiro que indicou'},
                {'key': 'partner_id', 'description': 'ID do parceiro'},
                {'key': 'empresa_lead', 'description': 'Nome da empresa indicada'},
            ],
            'body_html': wrap(
                '<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Novo Lead Recebido</h2>'
                '<p style="color:#999;font-size:14px;line-height:1.6;">O parceiro <strong style="color:#A6864A;">{{nome_parceiro}}</strong> ({{partner_id}}) indicou um novo lead:</p>'
                '<div style="background:#0a0a0a;border-radius:12px;padding:20px;margin:20px 0;border-left:3px solid #A6864A;">'
                '<p style="color:#fff;font-size:16px;font-weight:600;margin:0;">{{empresa_lead}}</p>'
                '</div>'
                '<p style="color:#999;font-size:14px;">Acesse o CRM para qualificar este lead.</p>'
            ),
        },
        {
            'slug': 'lead_closed',
            'name': 'Lead Fechado — Comissão',
            'subject': 'Parabéns! Seu lead {{empresa_lead}} foi fechado',
            'recipient_type': 'partner',
            'variables': [
                {'key': 'nome_parceiro', 'description': 'Nome do parceiro'},
                {'key': 'empresa_lead', 'description': 'Nome da empresa'},
                {'key': 'valor_projeto', 'description': 'Valor do projeto'},
                {'key': 'valor_comissao', 'description': 'Valor da comissão'},
            ],
            'body_html': wrap(
                '<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Lead Fechado!</h2>'
                '<p style="color:#999;font-size:14px;line-height:1.6;">Olá, {{nome_parceiro}}! Seu lead foi fechado com sucesso.</p>'
                '<div style="background:#0a0a0a;border-radius:12px;padding:20px;margin:20px 0;">'
                '<p style="color:#999;font-size:13px;margin:0 0 8px;"><strong style="color:#ccc;">Empresa:</strong> {{empresa_lead}}</p>'
                '<p style="color:#999;font-size:13px;margin:0 0 8px;"><strong style="color:#ccc;">Valor do Projeto:</strong> {{valor_projeto}}</p>'
                '<p style="color:#A6864A;font-size:18px;font-weight:700;margin:12px 0 0;">Sua comissão: {{valor_comissao}}</p>'
                '</div>'
                '<p style="color:#999;font-size:14px;">A comissão será processada conforme as condições acordadas.</p>'
            ),
        },
        {
            'slug': 'onboarding_submitted_client',
            'name': 'Cadastro Recebido — Cliente',
            'subject': 'Cadastro recebido — Inova Systems',
            'recipient_type': 'client',
            'variables': [
                {'key': 'nome_representante', 'description': 'Nome do representante legal'},
                {'key': 'empresa', 'description': 'Nome da empresa'},
            ],
            'body_html': wrap(
                '<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Cadastro Recebido!</h2>'
                '<p style="color:#999;font-size:14px;line-height:1.6;">Olá, {{nome_representante}}.</p>'
                '<p style="color:#999;font-size:14px;line-height:1.6;">Os dados de <strong style="color:#fff;">{{empresa}}</strong> foram recebidos com sucesso. O projeto já está em andamento!</p>'
                '<p style="color:#999;font-size:14px;">Nossa equipe entrará em contato em breve com os próximos passos.</p>'
                '<div style="text-align:center;margin:28px 0 0;">'
                '<p style="color:#A6864A;font-size:16px;font-weight:600;">Obrigado pela confiança!</p>'
                '</div>'
            ),
        },
        {
            'slug': 'onboarding_submitted_team',
            'name': 'Cadastro Recebido — Equipe',
            'subject': 'Cadastro preenchido: {{empresa}}',
            'recipient_type': 'team',
            'variables': [
                {'key': 'empresa', 'description': 'Nome da empresa'},
                {'key': 'nome_representante', 'description': 'Nome do representante'},
                {'key': 'cnpj', 'description': 'CNPJ da empresa'},
            ],
            'body_html': wrap(
                '<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Cadastro Preenchido</h2>'
                '<p style="color:#999;font-size:14px;line-height:1.6;">O cliente preencheu o formulário de cadastro.</p>'
                '<div style="background:#0a0a0a;border-radius:12px;padding:20px;margin:20px 0;">'
                '<p style="color:#999;font-size:13px;margin:0 0 8px;"><strong style="color:#ccc;">Empresa:</strong> {{empresa}}</p>'
                '<p style="color:#999;font-size:13px;margin:0 0 8px;"><strong style="color:#ccc;">Representante:</strong> {{nome_representante}}</p>'
                '<p style="color:#999;font-size:13px;margin:0;"><strong style="color:#ccc;">CNPJ:</strong> {{cnpj}}</p>'
                '</div>'
                '<p style="color:#999;font-size:14px;">Acesse a aba Cadastros no CRM para revisar os dados.</p>'
            ),
        },
    ]

    for t in templates:
        EmailTemplate.objects.get_or_create(slug=t['slug'], defaults=t)


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('slug', models.SlugField(help_text='Identificador único (ex: welcome_partner)', unique=True)),
                ('name', models.CharField(help_text='Nome amigável', max_length=200)),
                ('subject', models.CharField(help_text='Assunto do email (aceita {{variáveis}})', max_length=300)),
                ('body_html', models.TextField(help_text='Corpo HTML do email (aceita {{variáveis}})')),
                ('variables', models.JSONField(default=list, help_text='Lista de variáveis disponíveis')),
                ('recipient_type', models.CharField(choices=[('client', 'Cliente'), ('partner', 'Parceiro'), ('team', 'Equipe Inova'), ('requester', 'Solicitante')], default='team', max_length=20)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'email_templates',
                'ordering': ['name'],
            },
        ),
        migrations.RunPython(create_default_templates, migrations.RunPython.noop),
    ]
