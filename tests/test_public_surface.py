import re
import unittest
from pathlib import Path


class PublicSurfaceTest(unittest.TestCase):
    def test_composer_shell_is_english_and_keeps_primary_controls(self):
        html = (
            Path(__file__).resolve().parents[1]
            / "electron_gui"
            / "assets"
            / "index.html"
        ).read_text(encoding="utf-8")

        self.assertIsNone(re.search(r"[\u3400-\u4dbf\u4e00-\u9fff]", html))
        self.assertIn('<html lang="en">', html)
        self.assertIn('placeholder="Enter a rule name..."', html)
        self.assertIn('id="refresh_button">Refresh</button>', html)
        self.assertIn('id="start_button">Compose Rule</button>', html)


if __name__ == "__main__":
    unittest.main()
