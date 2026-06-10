from django.contrib import admin

from .models import DirectorEscalation, DirectoryMeeting


@admin.register(DirectorEscalation)
class DirectorEscalationAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'originating_ticket', 'raised_by', 'decision', 'decided_by',
        'decided_at', 'resolved', 'created_at',
    )
    list_filter = ('decision', 'resolved')
    search_fields = ('originating_ticket__number', 'summary', 'decision_notes')
    raw_id_fields = ('originating_ticket', 'raised_by', 'decided_by')
    readonly_fields = ('decided_at', 'created_at', 'updated_at')
    date_hierarchy = 'created_at'


@admin.register(DirectoryMeeting)
class DirectoryMeetingAdmin(admin.ModelAdmin):
    list_display = ('id', 'date', 'week_ref', 'created_by', 'created_at')
    list_filter = ('week_ref',)
    search_fields = ('notes', 'week_ref')
    raw_id_fields = ('created_by',)
    filter_horizontal = ('attendees',)
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'date'
