from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from marketplace.fixtures_data import PACKAGES
from marketplace.models import Campaign, CampaignHistory, CartLine, Package

User = get_user_model()

CAMPAIGN_TRANSITIONS = {
    Campaign.Status.DRAFT: {Campaign.Status.AWAITING_PAYMENT},
    Campaign.Status.AWAITING_PAYMENT: set(),
}


def cart_total_for_user(user) -> Decimal:
    total = Decimal("0")
    for line in CartLine.objects.filter(user=user).select_related("package"):
        total += line.package.payable * line.quantity
    return total


def cart_lines_for_user(user):
    return list(
        CartLine.objects.filter(user=user)
        .select_related("package")
        .order_by("package__slug")
    )


def add_package(user, slug: str) -> None:
    package = Package.objects.get(slug=slug)
    line, created = CartLine.objects.get_or_create(
        user=user, package=package, defaults={"quantity": 1}
    )
    if not created:
        line.quantity += 1
        line.save(update_fields=("quantity",))


def remove_package(user, slug: str) -> None:
    CartLine.objects.filter(user=user, package__slug=slug).delete()


def reset_demo_state_for_user(user) -> None:
    CartLine.objects.filter(user=user).delete()
    campaigns = Campaign.objects.filter(advertiser=user)
    CampaignHistory.objects.filter(campaign__in=campaigns).delete()
    campaigns.delete()


def ensure_owner(campaign: Campaign, user) -> None:
    if campaign.advertiser_id != user.pk:
        raise PermissionDenied("Campaign belongs to another advertiser.")


def transition_campaign(campaign: Campaign, next_status: str, *, item=None) -> None:
    allowed = CAMPAIGN_TRANSITIONS.get(campaign.status, set())
    if next_status not in allowed:
        raise ValidationError(
            f"Transition from {campaign.status} to {next_status} is not allowed."
        )
    previous = campaign.status
    campaign.status = next_status
    campaign.save(update_fields=("status", "updated_at"))
    CampaignHistory.objects.create(
        campaign=campaign,
        package=item,
        from_status=previous,
        to_status=next_status,
        scope=CampaignHistory.Scope.CAMPAIGN,
    )
    if item is not None:
        CampaignHistory.objects.create(
            campaign=campaign,
            package=item,
            from_status=previous,
            to_status=next_status,
            scope=CampaignHistory.Scope.ITEM,
        )


def _append_submit_history(campaign: Campaign, *, item_package) -> None:
    previous = Campaign.Status.DRAFT
    next_status = Campaign.Status.AWAITING_PAYMENT
    CampaignHistory.objects.create(
        campaign=campaign,
        package=item_package,
        from_status=previous,
        to_status=next_status,
        scope=CampaignHistory.Scope.CAMPAIGN,
    )
    if item_package is not None:
        CampaignHistory.objects.create(
            campaign=campaign,
            package=item_package,
            from_status=previous,
            to_status=next_status,
            scope=CampaignHistory.Scope.ITEM,
        )


@transaction.atomic
def checkout_cart_to_campaign(user) -> Campaign:
    lines = cart_lines_for_user(user)
    if not lines:
        raise ValidationError("Cart is empty.")
    campaign = Campaign.objects.create(
        advertiser=user,
        status=Campaign.Status.DRAFT,
        title="New campaign",
    )
    for line in lines:
        campaign.items.create(package=line.package, quantity=line.quantity)
    CartLine.objects.filter(user=user).delete()
    return campaign


@transaction.atomic
def submit_campaign(campaign: Campaign, actor) -> Campaign:
    ensure_owner(campaign, actor)
    locked = (
        Campaign.objects.select_for_update()
        .filter(pk=campaign.pk, advertiser_id=actor.pk)
        .first()
    )
    if locked is None:
        raise PermissionDenied("Campaign belongs to another advertiser.")
    if locked.status == Campaign.Status.AWAITING_PAYMENT:
        return locked
    if locked.status != Campaign.Status.DRAFT:
        raise ValidationError("Only draft campaigns can be submitted.")

    updated_rows = Campaign.objects.filter(
        pk=locked.pk,
        advertiser_id=actor.pk,
        status=Campaign.Status.DRAFT,
    ).update(status=Campaign.Status.AWAITING_PAYMENT, updated_at=timezone.now())

    if updated_rows == 0:
        locked.refresh_from_db()
        if locked.status == Campaign.Status.AWAITING_PAYMENT:
            return locked
        raise ValidationError("Only draft campaigns can be submitted.")

    locked.refresh_from_db()
    item = locked.items.select_related("package").first()
    _append_submit_history(locked, item_package=item.package if item else None)
    return locked


def seed_showcase() -> None:
    for row in PACKAGES:
        Package.objects.update_or_create(
            slug=row["slug"],
            defaults={k: v for k, v in row.items() if k != "slug"},
        )
    password = settings.DEMO_PASSWORD
    for username in (settings.DEMO_ADVERTISER_USERNAME, settings.DEMO_OTHER_USERNAME):
        user, created = User.objects.get_or_create(username=username)
        if created:
            user.set_password(password)
            user.save(update_fields=("password",))
