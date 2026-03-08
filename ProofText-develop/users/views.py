from django.contrib import messages
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_POST
from django.views.generic import View

from articles.models import Report

from .serializers import UserSerializer


@require_POST
@login_required
def update_profile(request):
    user = request.user
    user.full_name = request.POST.get("full_name", user.full_name)
    user.email = request.POST.get("email", user.email)
    user.save()
    return redirect("profile")


class LogoutView(View):
    def get(self, request):
        logout(request)
        messages.info(request, "Вы вышли из системы")
        return redirect("auth")


@method_decorator(login_required, name="dispatch")
class ProfileView(View):
    def get(self, request):
        reports = (Report.objects.filter(author=request.user).order_by
                   ("-created_at"))
        return render(request, "profile.html", {"reports": reports})


class AuthFormView(View):
    def get(self, request):
        return render(request, "auth.html")

    def post(self, request):
        email = request.POST.get("email")
        password = request.POST.get("password")
        user = authenticate(request, email=email, password=password)
        if user:
            login(request, user)
            messages.success(request, f"Вы вошли как "
                                      f"{user.full_name or user.email}")
            return redirect("profile")
        messages.error(request, "Неверный email или пароль")
        # Передаём register_errors=None, чтобы активна была вкладка входа
        return render(request, "auth.html", {"register_errors": None})


class RegisterFormView(View):
    def get(self, request):
        # Передаём register_errors=None, чтобы активна была вкладка входа
        return render(request, "auth.html", {"register_errors": None})

    def post(self, request):
        data = {
            "email": request.POST.get("email"),
            "full_name": request.POST.get("full_name"),
            "password": request.POST.get("password"),
        }
        serializer = UserSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            messages.success(request, "Регистрация успешна,"
                                      " теперь войдите")
            return redirect("auth")
        # Передаём ошибки сериализатора в шаблон для отображения
        return render(request, "auth.html",
                      {"register_errors": serializer.errors})


@login_required
@require_POST
def delete_account_view(request):
    user = request.user
    logout(request)
    user.delete()
    return redirect("home")  # Или другой маршрут после удаления
