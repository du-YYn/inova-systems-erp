from django.contrib import admin

from .models import LegalCase


@admin.register(LegalCase)
class LegalCaseAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'customer', 'process_type', 'status', 'source',
        'autentique_id', 'signed_at', 'created_at',
    )
    list_filter = ('process_type', 'status', 'source')
    search_fields = ('customer__company_name', 'customer__name', 'autentique_id', 'notes')
    raw_id_fields = ('customer', 'project', 'created_by')
    readonly_fields = ('signed_at', 'created_at', 'updated_at')
    date_hierarchy = 'created_at'
