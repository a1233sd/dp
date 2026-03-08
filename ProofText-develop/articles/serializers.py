# articles/serializers.py
from rest_framework import serializers

from .models import PlagiarismCheck, Report


class ReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = "__all__"


class PlagiarismCheckSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlagiarismCheck
        fields = "__all__"
