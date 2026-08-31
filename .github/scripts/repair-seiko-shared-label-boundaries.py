from pathlib import Path
import re

replacements = {
    "app/label-designer.tsx": {
        "function uniqueSavedNamefunction uniqueSavedName": "function uniqueSavedName",
        "function normalizedMeasurementValuesfunction normalizedMeasurementValues": "function normalizedMeasurementValues",
    },
    "app/label-finalization.tsx": {
        "function labelOnlyPrint(copies = 1)function labelOnlyPrint() {": "function labelOnlyPrint(copies = 1) {",
    },
}

for filename, mapping in replacements.items():
    path = Path(filename)
    text = path.read_text(encoding="utf-8")
    for old, new in mapping.items():
        if old not in text:
            raise SystemExit(f"Expected boundary defect not found in {filename}: {old}")
        text = text.replace(old, new, 1)
    if re.search(r"function\s+[A-Za-z_$][\w$]*function\s+[A-Za-z_$]", text):
        raise SystemExit(f"Duplicated function boundary still present in {filename}")
    path.write_text(text, encoding="utf-8")

print("Shared SEIKO label function boundaries repaired.")
