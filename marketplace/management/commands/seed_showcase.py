from django.core.management.base import BaseCommand

from marketplace.services import seed_showcase


class Command(BaseCommand):
    help = "Seed fictional Reachboard showcase packages and demo users."

    def handle(self, *args, **options):
        seed_showcase()
        self.stdout.write(self.style.SUCCESS("Reachboard showcase seeded."))
