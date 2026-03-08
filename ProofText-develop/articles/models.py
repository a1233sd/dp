# articles/models.py
from django.db import models

from users.models import CustomUser


class Report(models.Model):
    STATUS_CHOICES = [
        ("draft", "Черновик"),
        ("published", "Опубликовано"),
        ("archived", "Архив"),
    ]

    author = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True)
    file = models.FileField(
        upload_to="reports_files/", blank=True, null=True
    )  # <-- заменили file_path на FileField
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20,
                              choices=STATUS_CHOICES, default="draft")

    ai_generated_percent = models.FloatField(null=True, blank=True)
    originality_percent = models.FloatField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.author.email})"


class PlagiarismCheck(models.Model):
    report = models.ForeignKey(Report, on_delete=models.CASCADE)
    originality_percent = models.DecimalField(max_digits=5, decimal_places=2)
    checked_at = models.DateTimeField(auto_now_add=True)
    certificate_url = models.TextField(blank=True)

    def __str__(self):
        return f"Check for '{self.report.title}' – {self.originality_percent}%"
