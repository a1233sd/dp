from __future__ import annotations

import uuid

from django.db import models


class Report(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    original_name = models.CharField(max_length=255)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    cloud_link = models.URLField(blank=True, null=True)
    added_to_cloud = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']


class Check(models.Model):
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(Report, related_name='checks', on_delete=models.CASCADE)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES)
    similarity = models.FloatField(blank=True, null=True)
    matches = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-created_at']
