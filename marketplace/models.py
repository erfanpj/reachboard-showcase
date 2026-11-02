from decimal import Decimal

from django.contrib.auth.models import User
from django.db import models


class Package(models.Model):
    slug = models.SlugField(unique=True)
    title_en = models.CharField(max_length=120)
    title_fa = models.CharField(max_length=120)
    channel_en = models.CharField(max_length=80)
    channel_fa = models.CharField(max_length=80)
    placement_en = models.CharField(max_length=200)
    placement_fa = models.CharField(max_length=200)
    deliverable_en = models.CharField(max_length=200)
    deliverable_fa = models.CharField(max_length=200)
    payable = models.DecimalField(max_digits=8, decimal_places=0)

    class Meta:
        ordering = ("slug",)

    def __str__(self) -> str:
        return self.title_en


class CartLine(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="cart_lines")
    package = models.ForeignKey(Package, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ("user", "package")


class Campaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        AWAITING_PAYMENT = "awaiting_payment", "Awaiting payment"

    advertiser = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="campaigns"
    )
    title = models.CharField(max_length=200, default="New campaign")
    status = models.CharField(
        max_length=32, choices=Status.choices, default=Status.DRAFT
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def total_amount(self) -> Decimal:
        total = Decimal("0")
        for item in self.items.select_related("package"):
            total += item.package.payable * item.quantity
        return total

    def status_headline_en(self) -> str:
        if self.status == self.Status.DRAFT:
            return "Review your line items before sending for payment."
        if self.status == self.Status.AWAITING_PAYMENT:
            return "Sent for payment review — wallet stays at zero in this demo."
        return self.get_status_display()


class CampaignItem(models.Model):
    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE, related_name="items"
    )
    package = models.ForeignKey(Package, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField(default=1)


class CampaignHistory(models.Model):
    class Scope(models.TextChoices):
        CAMPAIGN = "campaign", "Campaign"
        ITEM = "item", "Campaign item"

    campaign = models.ForeignKey(
        Campaign, on_delete=models.CASCADE, related_name="history"
    )
    package = models.ForeignKey(
        Package, on_delete=models.SET_NULL, null=True, blank=True
    )
    from_status = models.CharField(max_length=32, blank=True)
    to_status = models.CharField(max_length=32)
    scope = models.CharField(max_length=16, choices=Scope.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
