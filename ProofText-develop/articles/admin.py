# articles/admin.py
from django.contrib import admin

from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ["title", "author", "created_at", "status"]
    search_fields = ["title", "author__email"]
    list_filter = ["status", "created_at"]
