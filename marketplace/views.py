from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.http import Http404, HttpResponseBadRequest, HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_http_methods, require_POST

from marketplace.fixtures_data import CREDIT_LABEL_EN, CREDIT_LABEL_FA, PACKAGES
from marketplace.models import Campaign, Package
from marketplace.safe_paths import safe_local_path
from marketplace.services import (
    add_package,
    cart_lines_for_user,
    cart_total_for_user,
    checkout_cart_to_campaign,
    ensure_owner,
    remove_package,
    reset_demo_state_for_user,
    submit_campaign,
)


def _catalog_context(request, *, locale: str):
    query = (request.GET.get("q") or "").strip().lower()
    packages = list(Package.objects.all())
    if query:
        packages = [
            p
            for p in packages
            if query in p.title_en.lower()
            or query in p.title_fa
            or query in p.slug
            or query in p.channel_en.lower()
        ]
    lines = cart_lines_for_user(request.user) if request.user.is_authenticated else []
    total = cart_total_for_user(request.user) if request.user.is_authenticated else 0
    count = sum(line.quantity for line in lines)
    compare_slugs = ("echo-weekly", "northline-sound")
    compare_packages = [p for p in Package.objects.filter(slug__in=compare_slugs)]
    return {
        "locale": locale,
        "html_lang": "fa" if locale == "fa" else "en",
        "html_dir": "rtl" if locale == "fa" else "ltr",
        "packages": packages,
        "cart_lines": lines,
        "cart_total": total,
        "cart_count": count,
        "credit_label": CREDIT_LABEL_FA if locale == "fa" else CREDIT_LABEL_EN,
        "compare_packages": compare_packages,
        "fixture_count": len(PACKAGES),
    }


def catalog_en(request):
    return render(request, "marketplace/catalog_en.html", _catalog_context(request, locale="en"))


def catalog_fa(request):
    return render(request, "marketplace/catalog_fa.html", _catalog_context(request, locale="fa"))


@require_POST
def cart_mutate(request):
    if not request.user.is_authenticated:
        return redirect("demo_login")
    slug = request.POST.get("slug")
    action = request.POST.get("action", "add")
    next_url = safe_local_path(request.POST.get("next"))
    if action not in {"add", "remove"}:
        return HttpResponseBadRequest("Unknown cart action.")
    try:
        if action == "remove":
            remove_package(request.user, slug)
        else:
            add_package(request.user, slug)
    except Package.DoesNotExist:
        return HttpResponseBadRequest("Unknown package.")
    return redirect(next_url)


@require_http_methods(["GET", "POST"])
def demo_login(request):
    next_default = safe_local_path(request.GET.get("next"))
    if request.method == "POST":
        user = authenticate(
            request,
            username=request.POST.get("username"),
            password=request.POST.get("password"),
        )
        if user is not None:
            login(request, user)
            return redirect(safe_local_path(request.POST.get("next"), next_default))
    return render(
        request,
        "marketplace/demo_login.html",
        {"safe_next": next_default},
    )


@require_POST
def demo_logout(request):
    logout(request)
    return redirect("catalog_en")


@login_required
@require_POST
def demo_reset_view(request):
    from django.conf import settings

    if request.user.username not in {
        settings.DEMO_ADVERTISER_USERNAME,
        settings.DEMO_OTHER_USERNAME,
    }:
        return HttpResponseForbidden("Demo reset allowed for showcase accounts only.")
    reset_demo_state_for_user(request.user)
    return redirect(safe_local_path(request.POST.get("next")))


@login_required
@require_POST
def checkout_campaign(request):
    try:
        campaign = checkout_cart_to_campaign(request.user)
    except ValidationError as exc:
        return render(
            request,
            "marketplace/error.html",
            {"message": str(exc)},
            status=400,
        )
    return redirect("campaign_detail", pk=campaign.pk)


@login_required
def campaign_detail(request, pk: int):
    campaign = get_object_or_404(Campaign.objects.select_related("advertiser"), pk=pk)
    try:
        ensure_owner(campaign, request.user)
    except Exception:
        raise Http404("Campaign not found.")
    history = campaign.history.select_related("package").all()
    return render(
        request,
        "marketplace/campaign_detail.html",
        {
            "campaign": campaign,
            "items": campaign.items.select_related("package"),
            "history": history,
            "credit_label": CREDIT_LABEL_EN,
        },
    )


@login_required
@require_POST
def campaign_submit(request, pk: int):
    campaign = get_object_or_404(Campaign, pk=pk)
    try:
        ensure_owner(campaign, request.user)
    except Exception:
        raise Http404("Campaign not found.")
    submit_campaign(campaign, request.user)
    return redirect("campaign_detail", pk=campaign.pk)
