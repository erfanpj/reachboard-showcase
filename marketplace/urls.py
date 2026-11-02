from django.urls import path

from marketplace import views

urlpatterns = [
    path("", views.catalog_en, name="home"),
    path("en/catalog/", views.catalog_en, name="catalog_en"),
    path("fa/catalog/", views.catalog_fa, name="catalog_fa"),
    path("cart/line/", views.cart_mutate, name="cart_mutate"),
    path("demo/login/", views.demo_login, name="demo_login"),
    path("demo/logout/", views.demo_logout, name="demo_logout"),
    path("demo/reset/", views.demo_reset_view, name="demo_reset"),
    path("campaign/checkout/", views.checkout_campaign, name="checkout_campaign"),
    path("campaign/<int:pk>/", views.campaign_detail, name="campaign_detail"),
    path("campaign/<int:pk>/submit/", views.campaign_submit, name="campaign_submit"),
]
