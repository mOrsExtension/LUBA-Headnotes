import re
import copy
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn

# ── CONFIG ──────────────────────────────────────────────────────────────────
INPUT_PATH = r"/../headnotes_full_2025-08-06.docx"
# ────────────────────────────────────────────────────────────────────────────

# Matches headnotes like: 1.1.1  16.  3.2  10.1.2.4  (bold, at start of para)
HEADNOTE_RE = re.compile(r"^\d{1,2}(\.\d{1,2})*\.?$")

def get_bold_prefix(para):
    """Return the first bold run's text (stripped), or None if paragraph doesn't start bold."""
    for run in para.runs:
        if run.text.strip():
            return run.text.strip() if run.bold else None
    return None

def is_headnote(para):
    prefix = get_bold_prefix(para)
    if not prefix:
        return False
    # Strip trailing period for matching, but keep original for filename
    token = prefix.rstrip(".")
    parts = token.split(".")
    return all(p.isdigit() and 1 <= len(p) <= 2 for p in parts if p)

def copy_paragraph_to_doc(src_para, dest_doc):
    """Deep-copy a paragraph's XML into the destination document body."""
    new_para = copy.deepcopy(src_para._element)
    dest_doc.element.body.append(new_para)

def safe_filename(label):
    """E.g. turn  '1.1.1' into a '1_1_1' for safe filename component."""
    return re.sub(r"[^\w\.-]", "_", label)

def split_document(input_path):
    input_path = Path(input_path)
    doc = Document(input_path)
    paragraphs = doc.paragraphs

    # Find split points: (index_into_paragraphs, headnote_label)
    splits = []
    for i, para in enumerate(paragraphs):
        if is_headnote(para):
            label = get_bold_prefix(para).rstrip(".")
            splits.append((i, label))

    if not splits:
        print("No headnotes found. Check that the bold prefix text matches the expected pattern.")
        return

    print(f"Found {len(splits)} headnote sections.")

    # Build ranges: each section runs from its start index up to the next split
    ranges = []
    for idx, (start, label) in enumerate(splits):
        end = splits[idx + 1][0] if idx + 1 < len(splits) else len(paragraphs)
        ranges.append((start, end, label))

    output_dir = input_path.parent

    for i, (start, end, label) in enumerate(ranges):
        new_doc = Document()
        # Remove the default empty paragraph Word adds to new documents
        for p in new_doc.paragraphs:
            p._element.getparent().remove(p._element)

        for para in paragraphs[start:end]:
            copy_paragraph_to_doc(para, new_doc)

        filename = f"{input_path.stem}_{str(i+1).zfill(3)}_{safe_filename(label)}.docx"
        out_path = output_dir / filename
        new_doc.save(out_path)
        print(f"  Saved: {filename}  ({end - start} paragraphs)")

    print("Done.")

split_document(INPUT_PATH)