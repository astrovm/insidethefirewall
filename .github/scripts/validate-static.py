"""Validate HTML entrypoints, local assets, CSS URLs and JavaScript syntax.

Remote URLs are deliberately not fetched: PR checks must work without production
services or credentials. Game assets are checked against the exported project.
"""
import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urlsplit


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = set()
        self.references = []
        self.scripts = []
        self.script = None
        self.doctype = False
        self.title = ""
        self.in_title = False

    def handle_decl(self, declaration):
        self.doctype |= declaration.lower() == "doctype html"

    def handle_starttag(self, tag, attributes):
        self.tags.add(tag)
        attributes = dict(attributes)
        for key in ("src", "href", "poster"):
            if attributes.get(key):
                self.references.append(attributes[key])
        if tag == "title":
            self.in_title = True
        if tag == "script" and not attributes.get("src"):
            script_type = attributes.get("type", "text/javascript")
            if script_type in ("module", "text/javascript", "application/javascript", ""):
                self.script = (script_type == "module", [])

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag == "script" and self.script is not None:
            self.scripts.append(self.script)
            self.script = None

    def handle_data(self, data):
        if self.script is not None:
            self.script[1].append(data)
        if self.in_title:
            self.title += data


def local_reference(root, source, reference):
    url = urlsplit(reference)
    if url.scheme or url.netloc or not url.path:
        return
    decoded = unquote(url.path)
    destination = (root / decoded.lstrip("/") if decoded.startswith("/") else source.parent / decoded).resolve()
    if not destination.is_relative_to(root):
        raise ValueError(f"{source}: asset escapes site root: {reference}")
    if not destination.exists():
        raise ValueError(f"{source}: missing local asset: {reference}")


def check_javascript(code, module=False):
    command = ["node", "--check"]
    if module:
        command.append("--input-type=module")
    subprocess.run(command, input=code, text=True, check=True)


def validate(root):
    root = root.resolve()
    pages = sorted(root.rglob("*.html"))
    if not pages:
        raise ValueError(f"No HTML pages in {root}")
    for path in pages:
        page = Page()
        page.feed(path.read_text())
        if not page.doctype or not {"html", "head", "body", "title"} <= page.tags or not page.title.strip():
            raise ValueError(f"{path}: expected HTML document with doctype, head, body and title")
        for reference in page.references:
            local_reference(root, path, reference)
        for module, script in page.scripts:
            check_javascript("".join(script), module)
    for path in root.rglob("*.js"):
        subprocess.run(["node", "--check", str(path)], check=True)
    for path in root.rglob("*.css"):
        css = re.sub(r"/\*.*?\*/", "", path.read_text(), flags=re.S)
        for reference in re.findall(r"url\(\s*['\"]?([^)'\"]+)['\"]?\s*\)", css):
            local_reference(root, path, reference.strip())
    for path in root.rglob("*.webmanifest"):
        manifest = json.loads(path.read_text())
        for icon in manifest.get("icons", []):
            local_reference(root, path, icon["src"])
    project = root / "assets/project.json"
    if project.exists():
        data = json.loads(project.read_text())
        if not data.get("targets"):
            raise ValueError("Game project contains no targets")
        for target in data["targets"]:
            for asset in target.get("costumes", []) + target.get("sounds", []):
                name = asset.get("md5ext") or f'{asset["assetId"]}.{asset["dataFormat"]}'
                local_reference(root, project, name)
    print(f"Validated {len(pages)} HTML page(s), local assets and JavaScript in {root}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    validate(parser.parse_args().root)
