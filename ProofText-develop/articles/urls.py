# articles/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (EditReportView, GetReferenceListView, GetReferenceView,
                    PlagiarismCheckViewSet, RegisterReportPageView,
                    ReportDeleteView, ReportDetailView, ReportViewSet,
                    analyze_report, generate_certificate)

router = DefaultRouter()
router.register(r"reports", ReportViewSet)
router.register(r"checks", PlagiarismCheckViewSet)

urlpatterns = [
    path("register-report/",
         RegisterReportPageView.as_view(), name="register_report"),
    path(
        "report/", GetReferenceListView.as_view(), name="report"
    ),  # ✅ вот это главное
    path("api/", include(router.urls)),
    path(
        "report/<int:pk>/", ReportDetailView.as_view(), name="report_info"
    ),  # страница конкретного доклада
    path(
        "get-reference/<int:report_id>/",
        GetReferenceView.as_view(),
        name="get_reference",
    ),
    path("reports/<int:pk>/edit/",
         EditReportView.as_view(), name="edit_report"),
    path("report/<int:pk>/delete/",
         ReportDeleteView.as_view(), name="delete_report"),
    path(
        "generate-certificate/<int:report_id>/",
        generate_certificate,
        name="generate_certificate",
    ),
    path("analyze-report/<int:report_id>/",
         analyze_report, name="analyze_report"),
]
