from django.contrib.auth.models import (AbstractBaseUser, BaseUserManager,
                                        PermissionsMixin)
from django.db import models


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, full_name=None,
                    **extra_fields):
        if not email:
            raise ValueError("Email обязателен")
        if not full_name:
            raise ValueError("Имя обязательно")

        email = self.normalize_email(email)
        user = self.model(email=email, full_name=full_name, **extra_fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password=None, full_name=None,
                         **extra_fields):
        extra_fields.setdefault("is_admin", True)
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)

        if not full_name:
            raise ValueError("Superuser должен иметь имя (full_name)")

        return self.create_user(email, password, full_name, **extra_fields)


class CustomUser(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)  # ❗ без blank=True
    is_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]  # 👈 обязательно!

    objects = CustomUserManager()

    def __str__(self):
        return self.email
