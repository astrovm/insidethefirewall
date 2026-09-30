"""Check accepted script modes and rejection of broken local pages/assets."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("validation", Path(__file__).with_name("validate-static.py"))
validation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validation)


class StaticValidationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.root.joinpath("package.json").write_text('{"type":"commonjs"}')

    def page(self, content):
        self.root.joinpath("index.html").write_text(
            '<!DOCTYPE html><html><head><title>Fixture</title></head><body>' + content + '</body></html>'
        )

    def test_classic_and_module_scripts(self):
        self.root.joinpath("app.js").write_text('export const value = 1;')
        self.page('<script type="module" src="app.js"></script><script type="module">export const inline = 2;</script>')
        validation.validate(self.root)
        self.page('<script src="app.js"></script>')
        with self.assertRaises(subprocess.CalledProcessError):
            validation.validate(self.root)

    def test_invalid_inline_javascript(self):
        self.page('<script>const broken = ;</script>')
        with self.assertRaises(subprocess.CalledProcessError):
            validation.validate(self.root)

    def test_unterminated_inline_script(self):
        self.page('<script>const broken = ;')
        with self.assertRaisesRegex(ValueError, 'unterminated script'):
            validation.validate(self.root)

    def test_missing_and_outside_assets(self):
        for reference, error in [('missing.png', 'missing local asset'), ('../outside.png', 'escapes site root')]:
            with self.subTest(reference=reference):
                self.page(f'<img src="{reference}">')
                with self.assertRaisesRegex(ValueError, error):
                    validation.validate(self.root)

    def test_css_and_manifest_assets(self):
        self.page('<link rel="stylesheet" href="style.css"><link rel="manifest" href="site.webmanifest">')
        self.root.joinpath('style.css').write_text('body { background: url(missing.png); }')
        self.root.joinpath('site.webmanifest').write_text('{"icons":[{"src":"icon.png"}]}')
        with self.assertRaisesRegex(ValueError, 'missing.png'):
            validation.validate(self.root)
        self.root.joinpath('missing.png').touch()
        with self.assertRaisesRegex(ValueError, 'icon.png'):
            validation.validate(self.root)
        self.root.joinpath('icon.png').touch()
        validation.validate(self.root)


if __name__ == '__main__':
    unittest.main()
