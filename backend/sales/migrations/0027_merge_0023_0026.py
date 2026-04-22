from django.db import migrations


class Migration(migrations.Migration):
    """Merge dos dois leafs existentes na app sales:
    - 0023_prospect_contact_email_optional (ramo paralelo)
    - 0026_service_catalog_and_payment_plan (catálogo + plano de pagamento)
    """

    dependencies = [
        ('sales', '0023_prospect_contact_email_optional'),
        ('sales', '0026_service_catalog_and_payment_plan'),
    ]

    operations = []
