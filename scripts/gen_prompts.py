#!/usr/bin/env python3
"""Generate per-couch prompt files from links.json + template."""
import json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
links = json.load(open(os.path.join(BASE, "links.json"), encoding="utf-8"))
tpl = open(os.path.join(BASE, "prompt_template.md"), encoding="utf-8").read()
os.makedirs(os.path.join(BASE, "prompts"), exist_ok=True)
for item in links:
    text = (tpl.replace("{ID}", item["id"])
               .replace("{URL}", item["url"])
               .replace("{RETAILER}", item["retailer"])
               .replace("{NOTE}", item["note"]))
    with open(os.path.join(BASE, "prompts", f'{item["id"]}.md'), "w", encoding="utf-8") as f:
        f.write(text)
print(f"generated {len(links)} prompts")
