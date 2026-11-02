import pytest
from pathlib import Path
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import Client
from django.urls import reverse

from marketplace.models import Campaign, CampaignHistory, CartLine, Package
from marketplace.services import (
    cart_total_for_user,
    reset_demo_state_for_user,
    seed_showcase,
    submit_campaign,
    transition_campaign,
)
from marketplace.safe_paths import safe_local_path

User = get_user_model()


@pytest.fixture
def seeded(db):
    seed_showcase()
    return {
        "password": "reachboard-showcase-demo",
        "advertiser": User.objects.get(username="demo_advertiser"),
        "other": User.objects.get(username="demo_other"),
    }


def _login(client, user, password):
    assert client.login(username=user.username, password=password)


@pytest.mark.django_db
def test_cart_total_parity(seeded, client):
    _login(client, seeded["advertiser"], seeded["password"])
    client.post(
        reverse("cart_mutate"),
        {"slug": "northline-sound", "action": "add", "next": "/en/catalog/"},
    )
    client.post(
        reverse("cart_mutate"),
        {"slug": "echo-weekly", "action": "add", "next": "/en/catalog/"},
    )
    assert cart_total_for_user(seeded["advertiser"]) == 75
    page = client.get("/en/catalog/?q=Echo")
    assert page.status_code == 200
    assert b"Cart total: 75" in page.content


@pytest.mark.django_db
def test_stale_orm_instances_do_not_duplicate_history(seeded):
    advertiser = seeded["advertiser"]
    client = Client()
    _login(client, advertiser, seeded["password"])
    client.post(
        reverse("cart_mutate"),
        {"slug": "echo-weekly", "action": "add", "next": "/en/catalog/"},
    )
    client.post(reverse("checkout_campaign"))
    campaign = Campaign.objects.get(advertiser=advertiser)
    first = Campaign.objects.get(pk=campaign.pk)
    stale = Campaign.objects.get(pk=campaign.pk)
    submit_campaign(first, advertiser)
    history_after_first = CampaignHistory.objects.filter(campaign=campaign).count()
    assert history_after_first == 2
    submit_campaign(stale, advertiser)
    assert CampaignHistory.objects.filter(campaign=campaign).count() == history_after_first


@pytest.mark.django_db
def test_journey_submit_and_repeat(seeded, client):
    _login(client, seeded["advertiser"], seeded["password"])
    client.post(
        reverse("cart_mutate"),
        {"slug": "echo-weekly", "action": "add", "next": "/en/catalog/"},
    )
    checkout = client.post(reverse("checkout_campaign"))
    assert checkout.status_code == 302
    campaign = Campaign.objects.get(advertiser=seeded["advertiser"])
    assert campaign.status == Campaign.Status.DRAFT
    submit = client.post(reverse("campaign_submit", args=[campaign.pk]))
    assert submit.status_code == 302
    campaign.refresh_from_db()
    assert campaign.status == Campaign.Status.AWAITING_PAYMENT
    history_count = campaign.history.count()
    again = client.post(reverse("campaign_submit", args=[campaign.pk]))
    assert again.status_code == 302
    campaign.refresh_from_db()
    assert campaign.status == Campaign.Status.AWAITING_PAYMENT
    assert campaign.history.count() == history_count


@pytest.mark.django_db
def test_checkout_get_does_not_mutate(seeded, client):
    _login(client, seeded["advertiser"], seeded["password"])
    client.post(
        reverse("cart_mutate"),
        {"slug": "echo-weekly", "action": "add", "next": "/en/catalog/"},
    )
    response = client.get(reverse("checkout_campaign"))
    assert response.status_code == 405
    assert Campaign.objects.filter(advertiser=seeded["advertiser"]).count() == 0
    assert CartLine.objects.filter(user=seeded["advertiser"]).exists()


@pytest.mark.django_db
def test_wrong_owner_gets_404(seeded, client):
    _login(client, seeded["advertiser"], seeded["password"])
    client.post(
        reverse("cart_mutate"),
        {"slug": "echo-weekly", "action": "add", "next": "/en/catalog/"},
    )
    client.post(reverse("checkout_campaign"))
    campaign = Campaign.objects.get(advertiser=seeded["advertiser"])
    _login(client, seeded["other"], seeded["password"])
    detail = client.get(reverse("campaign_detail", args=[campaign.pk]))
    assert detail.status_code == 404


@pytest.mark.django_db
def test_reset_scoped_to_current_user(seeded, client):
    _login(client, seeded["advertiser"], seeded["password"])
    client.post(
        reverse("cart_mutate"),
        {"slug": "echo-weekly", "action": "add", "next": "/en/catalog/"},
    )
    client.post(reverse("checkout_campaign"))
    _login(client, seeded["other"], seeded["password"])
    client.post(
        reverse("cart_mutate"),
        {"slug": "northline-sound", "action": "add", "next": "/en/catalog/"},
    )
    other_cart_before = CartLine.objects.filter(user=seeded["other"]).count()
    other_campaigns_before = Campaign.objects.filter(advertiser=seeded["other"]).count()
    _login(client, seeded["advertiser"], seeded["password"])
    client.post(reverse("demo_reset"), {"next": "/en/catalog/"})
    assert Campaign.objects.filter(advertiser=seeded["advertiser"]).count() == 0
    assert CartLine.objects.filter(user=seeded["advertiser"]).count() == 0
    assert CartLine.objects.filter(user=seeded["other"]).count() == other_cart_before
    assert (
        Campaign.objects.filter(advertiser=seeded["other"]).count() == other_campaigns_before
    )


@pytest.mark.django_db
def test_external_next_redirect_blocked(seeded, client):
    _login(client, seeded["advertiser"], seeded["password"])
    response = client.post(
        reverse("cart_mutate"),
        {
            "slug": "echo-weekly",
            "action": "add",
            "next": "https://evil.example/phish",
        },
        follow=False,
    )
    assert response.status_code == 302
    assert response["Location"] == "/en/catalog/"


@pytest.mark.django_db
def test_unknown_package_action(seeded, client):
    _login(client, seeded["advertiser"], seeded["password"])
    bad_slug = client.post(
        reverse("cart_mutate"),
        {"slug": "no-such-package", "action": "add", "next": "/en/catalog/"},
    )
    assert bad_slug.status_code == 400
    bad_action = client.post(
        reverse("cart_mutate"),
        {"slug": "echo-weekly", "action": "drop", "next": "/en/catalog/"},
    )
    assert bad_action.status_code == 400


@pytest.mark.django_db
def test_illegal_transition_rejected(seeded):
    seed_showcase()
    advertiser = User.objects.get(username="demo_advertiser")
    campaign = Campaign.objects.create(advertiser=advertiser, status=Campaign.Status.DRAFT)
    with pytest.raises(ValidationError):
        transition_campaign(campaign, "paid")


@pytest.mark.django_db
def test_csrf_required_on_cart_post(seeded):
    client = Client(enforce_csrf_checks=True)
    _login(client, seeded["advertiser"], seeded["password"])
    response = client.post(
        reverse("cart_mutate"),
        {"slug": "echo-weekly", "action": "add"},
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_demo_login_shows_showcase_branding(seeded, client):
    page = client.get(reverse("demo_login"))
    assert b"Reachboard" in page.content
    assert b"Fictional" in page.content


@pytest.mark.django_db
def test_safe_local_path_rules():
    assert safe_local_path("/fa/catalog/") == "/fa/catalog/"
    assert safe_local_path("https://evil.test/x") == "/en/catalog/"
    assert safe_local_path("/../etc/passwd") == "/en/catalog/"


@pytest.mark.django_db
def test_seed_creates_six_packages(seeded):
    assert Package.objects.count() == 6


def test_static_demo_submit_reset_regression():
    import subprocess
    import sys

    root = Path(__file__).resolve().parents[2]
    script = root / "tools" / "verify_static_demo.mjs"
    result = subprocess.run(
        ["node", str(script)],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert "STATIC_DEMO_OK" in result.stdout
