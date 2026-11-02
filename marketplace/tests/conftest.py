import os

import pytest


@pytest.fixture(scope="session", autouse=True)
def _django_settings_module():
    os.environ["DJANGO_SETTINGS_MODULE"] = "reachboard_site.settings"
