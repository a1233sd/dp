from __future__ import annotations

from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies: list[tuple[str, str]] = []

    operations = [
        migrations.CreateModel(
            name='Report',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('original_name', models.CharField(max_length=255)),
                ('text', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('cloud_link', models.URLField(blank=True, null=True)),
                ('added_to_cloud', models.BooleanField(default=False)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='Check',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('status', models.CharField(choices=[('queued', 'Queued'), ('processing', 'Processing'), ('completed', 'Completed'), ('failed', 'Failed')], max_length=32)),
                ('similarity', models.FloatField(blank=True, null=True)),
                ('matches', models.JSONField(blank=True, default=list)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('report', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='checks', to='plagiarism.report')),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
