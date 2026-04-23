from django.db import migrations


class Migration(migrations.Migration):
    """Merge migration que une os dois leaf nodes da app sales.

    Esta migration já foi criada e aplicada no servidor de produção em
    15/abr/2026 via `python manage.py makemigrations --merge` (nome foi
    gerado automaticamente pelo Django), mas nunca foi commitada ao
    repositório — o que causava conflito toda vez que uma nova migration
    era adicionada (dois leafs com mesmo número 0026).

    Este arquivo é a reconstrução fiel desse merge. Em ambientes onde o
    banco já tem django_migrations com essa entrada (produção), o Django
    detecta como aplicada e pula. Em ambientes limpos (CI, dev local), é
    aplicada como no-op.
    """

    dependencies = [
        ('sales', '0023_prospect_contact_email_optional'),
        ('sales', '0025_alter_partnercommission_prospect'),
    ]

    operations = []
