from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0019_prospect_concluded_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='proposal',
            name='proposal_file',
            field=models.FileField(blank=True, help_text='PDF da proposta', null=True, upload_to='proposals/%Y/%m/'),
        ),
        migrations.AddField(
            model_name='proposal',
            name='public_token',
            field=models.UUIDField(blank=True, default=None, null=True, unique=True, help_text='Token para link público'),
        ),
        migrations.AddField(
            model_name='proposal',
            name='view_count',
            field=models.IntegerField(default=0),
        ),
        migrations.CreateModel(
            name='ProposalView',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('viewed_at', models.DateTimeField(auto_now_add=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.CharField(blank=True, max_length=500)),
                ('proposal', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='views', to='sales.proposal')),
            ],
            options={'db_table': 'proposal_views', 'ordering': ['-viewed_at']},
        ),
    ]
