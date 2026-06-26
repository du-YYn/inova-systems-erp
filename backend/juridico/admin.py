from django.contrib import admin

from .models import LegalCase, LegalCaseEvent, LegalCaseTask


class LegalCaseTaskInline(admin.TabularInline):
    model = LegalCaseTask
    extra = 0
    fields = ('stage', 'label', 'done', 'done_by', 'order', 'is_custom')
    raw_id_fields = ('done_by',)


class LegalCaseEventInline(admin.TabularInline):
    model = LegalCaseEvent
    extra = 0
    fields = (
        'event_type', 'from_status', 'to_status', 'from_process_type',
        'to_process_type', 'autentique_link', 'signed_at', 'created_by', 'created_at',
    )
    readonly_fields = ('created_at',)
    raw_id_fields = ('created_by',)


@admin.register(LegalCase)
class LegalCaseAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'customer', 'process_type', 'status', 'source',
        'autentique_id', 'signed_at', 'created_at',
    )
    list_filter = ('process_type', 'status', 'source')
    search_fields = ('customer__company_name', 'customer__name', 'autentique_id', 'notes')
    raw_id_fields = ('customer', 'project', 'created_by', 'onboarding', 'proposal')
    readonly_fields = ('signed_at', 'created_at', 'updated_at')
    date_hierarchy = 'created_at'
    inlines = [LegalCaseTaskInline, LegalCaseEventInline]


@admin.register(LegalCaseEvent)
class LegalCaseEventAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'case', 'event_type', 'from_status', 'to_status', 'created_at',
    )
    list_filter = ('event_type',)
    search_fields = ('case__customer__company_name', 'description')
    raw_id_fields = ('case', 'created_by')
    readonly_fields = ('created_at',)
    date_hierarchy = 'created_at'
