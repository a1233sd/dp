# users/tests/test_users.py
import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

User = get_user_model()


@pytest.mark.django_db
def test_register_user(client):
    response = client.post(
        reverse("register_form"),
        {
            "email": "test@example.com",
            "full_name": "Test User",
            "password": "strongpassword123",
        },
    )
    assert response.status_code == 302  # Редирект после регистрации
    assert User.objects.filter(email="test@example.com").exists()


@pytest.mark.django_db
def test_login_user(client):
    user = User.objects.create_user(
        email="login@example.com", full_name="Login User", password="secret"
    )
    response = client.post(
        reverse("auth"),
        {
            "email": "login@example.com",
            "password": "secret",
        },
    )
    assert response.status_code == 302  # Редирект на профиль
    assert response.url == reverse("profile")


@pytest.mark.django_db
def test_logout_user(client):
    user = User.objects.create_user(
        email="logout@example.com",
        full_name="Logout User",
        password="secret"
    )
    client.login(email="logout@example.com", password="secret")
    response = client.get(reverse("logout"))
    assert response.status_code == 302
    assert response.url == reverse("auth")


@pytest.mark.django_db
def test_profile_view_requires_login(client):
    response = client.get(reverse("profile"))
    assert response.status_code == 302
    assert reverse("auth") in response.url


@pytest.mark.django_db
def test_profile_view_authenticated(client):
    user = User.objects.create_user(
        email="profile@example.com", full_name="Logout User", password="pass"
    )
    client.login(email="profile@example.com", password="pass")
    response = client.get(reverse("profile"))
    assert response.status_code == 200
    assert (
        b"profile" in response.content
    )  # предполагается, что шаблон содержит это слово


@pytest.mark.django_db
def test_update_profile(client):
    user = User.objects.create_user(
        email="edit@example.com", full_name="Old Name", password="pass"
    )
    client.login(email="edit@example.com", password="pass")
    response = client.post(
        reverse("update_profile"),
        {"full_name": "New Name", "email": "edit@example.com"},
    )
    user.refresh_from_db()
    assert user.full_name == "New Name"
    assert response.status_code == 302


@pytest.mark.django_db
def test_delete_account(client):
    user = User.objects.create_user(
        email="del@example.com", full_name="Logout User", password="pass"
    )
    client.login(email="del@example.com", password="pass")
    response = client.post(reverse("delete_account"))
    assert response.status_code == 302
    assert not User.objects.filter(email="del@example.com").exists()
