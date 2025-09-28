from django.contrib import admin
from django.urls import path

from plagiarism import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/reports/', views.reports_collection, name='reports-collection'),
    path('api/reports/<uuid:report_id>/', views.report_detail, name='report-detail'),
    path('api/checks/<uuid:check_id>/', views.check_detail, name='check-detail'),
    path('api/diff/', views.diff_view, name='diff-view'),
]
