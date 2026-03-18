from django.contrib import admin
from .models import SLAPolicy, SupportCategory, SupportTicket, KnowledgeBaseArticle


@admin.register(SLAPolicy)
class SLAPolicyAdmin(admin.ModelAdmin):
    list_display = ['name', 'response_time_high', 'resolution_time_high', 'is_active']


@admin.register(SupportCategory)
class SupportCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active']


@admin.register(SupportTicket)
class SupportTicketAdmin(admin.ModelAdmin):
    list_display = ['number', 'title', 'priority', 'status', 'assigned_to', 'created_at']
    list_filter = ['status', 'priority', 'ticket_type']
    search_fields = ['number', 'title']


@admin.register(KnowledgeBaseArticle)
class KnowledgeBaseArticleAdmin(admin.ModelAdmin):
    list_display = ['title', 'category', 'status', 'is_public', 'views_count']
    list_filter = ['status', 'is_public']
