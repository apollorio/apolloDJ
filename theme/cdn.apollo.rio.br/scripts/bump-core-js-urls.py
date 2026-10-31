# -*- coding: utf-8 -*-
"""Replace hardcoded core.js URLs with apollo_cdn_core_js_url() in apollo-* plugins."""
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "..")
OLD_SCRIPT = (
    '<script src="https://cdn.apollo.rio.br/v1.0.0/core.js" fetchpriority="high"></script>'
)
NEW_SCRIPT_PHP = (
    '<script src="<?php echo esc_url( function_exists(\'apollo_cdn_core_js_url\') '
    "? apollo_cdn_core_js_url() : 'https://cdn.apollo.rio.br/v1.0.0/core.js?v=t0x1x' ); ?>\" "  # dev=local added by apollo_cdn_core_js_url() on .local
    'fetchpriority="high" crossorigin="anonymous"></script>'
)
NEW_SCRIPT_HTML = (
    '<script src="https://cdn.apollo.rio.br/v1.0.0/core.js?v=t0x1x" '
    'fetchpriority="high" crossorigin="anonymous"></script>'
)
REPLACEMENTS_COMMON = [
    (
        "echo '<script src=\"https://cdn.apollo.rio.br/v1.0.0/core.js\" fetchpriority=\"high\"></script>';",
        "echo '<script src=\"' . esc_url( apollo_cdn_core_js_url() ) . '\" fetchpriority=\"high\" crossorigin=\"anonymous\"></script>';",
    ),
    (": 'https://cdn.apollo.rio.br/v1.0.0/core.js'", ": apollo_cdn_core_js_url()"),
    ("APOLLO_CDN_URL . 'core.js'", "apollo_cdn_core_js_url()"),
]

count = 0
for name in os.listdir(ROOT):
    if not name.startswith("apollo-"):
        continue
    base = os.path.join(ROOT, name)
    for dirpath, _, files in os.walk(base):
        for fname in files:
            if not fname.endswith((".php", ".html")):
                continue
            path = os.path.join(dirpath, fname)
            try:
                with open(path, "r", encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except OSError:
                continue
            orig = text
            new_script = NEW_SCRIPT_HTML if fname.endswith(".html") else NEW_SCRIPT_PHP
            text = text.replace(OLD_SCRIPT, new_script)
            for old, new in REPLACEMENTS_COMMON:
                text = text.replace(old, new)
            if text != orig:
                with open(path, "w", encoding="utf-8", newline="\n") as fh:
                    fh.write(text)
                count += 1
                print(path)

print(f"\nUpdated {count} files")
