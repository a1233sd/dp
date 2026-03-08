# articles/views.py
from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, UserPassesTestMixin
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse_lazy
from django.views import View
from django.views.generic import DeleteView, DetailView, TemplateView
from rest_framework import viewsets

from .forms import ReportForm
from .models import PlagiarismCheck, Report
from .serializers import PlagiarismCheckSerializer, ReportSerializer
from .use_cases import (analyze_report_logic, extract_text_from_pdf,
                        prepare_pdf_certificate)


class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.all()
    serializer_class = ReportSerializer


class PlagiarismCheckViewSet(viewsets.ModelViewSet):
    queryset = PlagiarismCheck.objects.all()
    serializer_class = PlagiarismCheckSerializer


class RegisterReportPageView(LoginRequiredMixin, View):
    template_name = "register_report.html"

    def get(self, request):
        reports = (Report.objects.filter(author=request.user).
                   order_by("-created_at"))
        form = ReportForm()
        return render(request, self.template_name,
                      {"reports": reports, "form": form})

    def post(self, request):
        form = ReportForm(request.POST, request.FILES)
        if form.is_valid():
            report = form.save(commit=False)
            report.author = request.user

            if not report.content and report.file:
                extracted_text = extract_text_from_pdf(report.file)
                if extracted_text:
                    report.content = extracted_text
                else:
                    messages.warning(request,
                                     "Не удалось извлечь текст из PDF.")

            if not report.content:
                messages.error(
                    request,
                    "Доклад не может быть пустым."
                    " Введите текст или загрузите PDF.",
                )
                reports = Report.objects.filter(author=request.user).order_by(
                    "-created_at"
                )
                return render(
                    request, self.template_name,
                    {"reports": reports, "form": form}
                )

            report.save()
            messages.success(request, "Доклад успешно зарегистрирован!")
            return redirect("register_report")

        messages.error(request, "Пожалуйста, исправьте ошибки в форме.")
        reports = (Report.objects.filter(author=request.user).
                   order_by("-created_at"))
        return render(request, self.template_name,
                      {"reports": reports, "form": form})


class EditReportView(LoginRequiredMixin, View):
    template_name = "edit_report.html"

    def get(self, request, pk):
        report = get_object_or_404(Report, pk=pk, author=request.user)
        form = ReportForm(instance=report)
        return render(request, self.template_name,
                      {"form": form, "report": report})

    def post(self, request, pk):
        report = get_object_or_404(Report, pk=pk, author=request.user)
        form = ReportForm(request.POST, request.FILES, instance=report)

        if form.is_valid():
            report = form.save(commit=False)

            if not report.content and report.file:
                extracted_text = extract_text_from_pdf(report.file)
                if extracted_text:
                    report.content = extracted_text
                else:
                    messages.warning(request,
                                     "Не удалось извлечь текст из PDF.")

            if not report.content:
                messages.error(
                    request,
                    "Доклад не может быть пустым. "
                    "Введите текст или загрузите PDF.",
                )
                return render(
                    request, self.template_name,
                    {"form": form, "report": report}
                )

            report.save()
            messages.success(request, "Доклад успешно обновлён!")
            return redirect("report_info", pk=report.pk)

        messages.error(request, "Пожалуйста, исправьте ошибки в форме.")
        return render(request, self.template_name,
                      {"form": form, "report": report})


class ReportDetailView(DetailView):
    model = Report
    template_name = "info_report.html"
    context_object_name = "report"


class GetReferenceListView(LoginRequiredMixin, TemplateView):
    template_name = "report.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        user = self.request.user
        context["reports"] = (
            Report.objects.filter(author=user).order_by("-created_at")
            if user.is_authenticated
            else []
        )
        return context


class GetReferenceView(TemplateView):
    template_name = "get-reference.html"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        report_id = self.kwargs.get("report_id")
        report = get_object_or_404(Report, id=report_id)
        context["report"] = report

        plagiarism_details = (self.request.session.pop
                              ("plagiarism_details", None))
        context["plagiarism_details"] = plagiarism_details\
            if plagiarism_details else []

        return context


class ReportDeleteView(LoginRequiredMixin, UserPassesTestMixin, DeleteView):
    model = Report
    template_name = "reports/report_confirm_delete.html"
    success_url = reverse_lazy("profile")

    def test_func(self):
        report = self.get_object()
        return report.author == self.request.user

    def delete(self, request, *args, **kwargs):
        messages.success(request, "Доклад успешно удалён.")
        return super().delete(request, *args, **kwargs)


def analyze_report(request, report_id):
    report = get_object_or_404(Report, id=report_id)

    if not report.content:
        messages.error(request, "Текст доклада пустой.")
        return redirect("get_reference", report_id=report.id)

    originality_percent, ai_score, details = analyze_report_logic(report)

    request.session["plagiarism_details"] = details
    messages.success(
        request,
        f"Проверка завершена. Оригинальность:"
        f"{originality_percent:.2f}%, ИИ: {ai_score:.2f}%",
    )
    return redirect("get_reference", report_id=report.id)


def generate_certificate(request, report_id):
    report = get_object_or_404(Report, id=report_id)
    buffer = prepare_pdf_certificate(report)

    response = HttpResponse(buffer, content_type="application/pdf")
    response["Content-Disposition"] = (
        f'attachment; filename="certificate_report_{report.id}.pdf"'
    )
    return response
