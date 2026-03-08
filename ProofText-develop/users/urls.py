# users/urls.py
from django.urls import path

from .views import (AuthFormView, LogoutView, ProfileView, RegisterFormView,
                    delete_account_view, update_profile)

urlpatterns = [
    path("auth/", AuthFormView.as_view(), name="auth"),  # Страница входа
    path(
        "register/", RegisterFormView.as_view(), name="register_form"
    ),  # Страница регистрации (обработка)
    path("profile/", ProfileView.as_view(),
         name="profile"),  # Профиль пользователя
    path("logout/", LogoutView.as_view(), name="logout"),  # Выход
    path("delete/", delete_account_view, name="delete_account"),
    path("profile/update/", update_profile, name="update_profile"),
]
