from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.utils.translation import gettext_lazy as _

from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    model = CustomUser
    ordering = ["email"]
    list_display = (
        "email",
        "full_name",
        "is_staff",
        "is_active",
        "created_at",
    )  # заменили date_joined
    list_filter = ("is_staff", "is_active", "is_superuser")
    search_fields = ("email", "full_name")

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        (_("Персональная информация"), {"fields": ("full_name",)}),
        (
            _("Права доступа"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (
            _("Важные даты"),
            {"fields": ("last_login", "created_at")},
        ),  # заменили date_joined
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "email",
                    "full_name",
                    "password1",
                    "password2",
                    "is_staff",
                    "is_active",
                ),
            },
        ),
    )

    readonly_fields = ("created_at", "last_login")  # заменили date_joined
