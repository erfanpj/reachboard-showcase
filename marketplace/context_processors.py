from django.conf import settings


def reachboard_chrome(request):
    return {
        "brand_name": "Reachboard",
        "demo_account_label": "Demo account",
        "showcase_disclaimer": (
            "Fictional marketplace showcase for portfolio review. "
            "Not a production product."
        ),
        "demo_password_hint": settings.DEMO_PASSWORD,
        "locale": "en",
    }
