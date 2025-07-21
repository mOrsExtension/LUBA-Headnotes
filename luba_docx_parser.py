#!/usr/bin/env python3
"""
Simple DOCX parser for LUBA headnotes
Converted to DOCX manually using Word
"""

import re
import json
from typing import List, Dict
import os

def parse_docx_headnotes(docx_path: str) -> List[Dict]:
    """
    Parse DOCX file and extract headnotes with formatting
    """
    try:
        from docx import Document
    except ImportError:
        print("python-docx is not installed. Run: pip install python-docx")
        return []

    print(f"Reading DOCX: {docx_path}")

    wordDoc = Document(docx_path)
    headNotes = []
    current_headnote = None

    for para in wordDoc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        # Check if this starts a new headnote
        headnote_match = re.match(r'^((?:\d+\.)+\d+)\s+', text)

        if headnote_match:
            # Save previous headnote if it exists
            if current_headnote:
                headNotes.append(current_headnote)

            # Start new headnote
            current_headnote = {
                'headnote_number': headnote_match.group(1),
                'paragraphs': [text],
                'formatting': extract_paragraph_formatting(para),
                'raw_text': text
            }
        elif current_headnote:
            # Continue current headnote
            current_headnote['paragraphs'].append(text)
            current_headnote['raw_text'] += '\n\n' + text

            # Add formatting from this paragraph
            para_formatting = extract_paragraph_formatting(para)
            current_headnote['formatting'].extend(para_formatting)

    # Picking up the last headnote
    if current_headnote:
        headNotes.append(current_headnote)

    print(f"Found {len(headNotes)} headnotes")
    return headNotes

def extract_paragraph_formatting(paragraph) -> List[Dict]:
    """
    Extract bold/italic runs from a paragraph, consolidating adjacent runs
    """
    # First, collect all runs with their formatting
    runs_data = []
    for run in paragraph.runs:
        if run.text:  # Don't strip - preserve spaces
            runs_data.append({
                'text': run.text,
                'bold': run.bold,
                'italic': run.italic
            })

    # Consolidate adjacent runs with same formatting
    formatList = []

    # Bold runs
    bold_text = ""
    for run_data in runs_data:
        if run_data['bold']:
            bold_text += run_data['text']
        else:
            if bold_text.strip():  # Only add if there's actual content
                formatList.append({
                    'type': 'bold',
                    'text': bold_text.strip()
                })
            bold_text = ""

    # Final bold text
    if bold_text.strip():
        formatList.append({
            'type': 'bold',
            'text': bold_text.strip()
        })

    # Process italic runs
    italic_text = ""
    for run_data in runs_data:
        if run_data['italic']:
            italic_text += run_data['text']
        else:
            if italic_text.strip():
                formatList.append({
                    'type': 'italic',
                    'text': italic_text.strip()
                })
            italic_text = ""

    # Final italic text
    if italic_text.strip():
        formatList.append({
            'type': 'italic',
            'text': italic_text.strip()
        })

    return formatList

def parse_headnote_content(headnote: Dict) -> Dict:
    """
    Extract structured data from headnote using improved patterns
    """
    full_text = headnote['raw_text']

    # Extract headnote number
    number = headnote['headnote_number']

    # Extract topic (improved pattern)
    topic_pattern = r'^(?:[\d.]+\s+)([^.]+\.)'
    topic_match = re.search(topic_pattern, full_text)
    topic = ""
    if topic_match:
        topic = topic_match.group(1).strip().rstrip('.')

    # Get case name from last italic formatting block
    case_name = ""
    if headnote['formatting']:
        italic_blocks = [fmt['text'] for fmt in headnote['formatting'] if fmt['type'] == 'italic']
        if italic_blocks:
            case_name = italic_blocks[-1].strip()
            del headnote['formatting'][-1]
    if len(headnote['formatting']) > 0:
        del headnote['formatting'][0]

    # Extract citation number and year (look after the case name)
    citation_num = ""
    year = None
    if case_name:
        # Find text after the case name
        case_name_pos = full_text.rfind(case_name)
        if case_name_pos != -1:
            text_after_case = full_text[case_name_pos + len(case_name):].strip()

            # Look for citation pattern: , ## Or LUBA ### (YEAR)
            citation_pattern = r',\s*(\d+\s+Or\s+LUBA\s+\d+)\s*\((\d{4})\)'
            citation_match = re.search(citation_pattern, text_after_case)
            if citation_match:
                citation_num = citation_match.group(1).strip()
                try:
                    year = int(citation_match.group(2))
                except:
                    year = None

    # Extract summary (between topic and case name)
    summary = full_text
    if topic_match:
        summary = summary[topic_match.end():].strip()
    if case_name:
        case_name_pos = summary.rfind(case_name)
        if case_name_pos != -1:
            summary = summary[:case_name_pos].strip()

    # Clean up summary (remove double spaces)
    summary = re.sub(r'\s+', ' ', summary).strip()

    # Extract ORS citations
    ors_pattern = r'(\d{1,3}[A-C]?\.\d{3,4})(?=[\D\s])'
    ors_citations = re.findall(ors_pattern, full_text)

    # Extract OAR citations
    oar_pattern = r'(\d{3}-\d{2,4}-\d{2,4})(?=[\D\s])'
    oar_citations = re.findall(oar_pattern, full_text)

    # Extract case citations (excluding the main case)
    cases_pattern = r'(\d{1,3}\s+Or\s+(?:App\s+|LUBA\s+)?\d{1,4})(?=[\D\s])'
    all_case_citations = re.findall(cases_pattern, full_text)

    # Remove the main case citation from the list
    other_case_citations = []
    main_citation = citation_num.strip() if citation_num else ""
    for case_cite in all_case_citations:
        if case_cite.strip() != main_citation:
            other_case_citations.append(case_cite.strip())

    return {
        'headnote_number': number,
        'topic': topic,
        'summary': summary,
        'case_name': case_name,
        'citation': citation_num,
        'year': year,
        'full_citation': f"{case_name}, {citation_num} ({year})" if case_name and citation_num and year else "",
        'ors_citations': list(set(ors_citations)),  # Remove duplicates
        'oar_citations': list(set(oar_citations)),
        'other_cases': list(set(other_case_citations)),
        'formatting': headnote['formatting'],
        'raw_text': headnote['raw_text']
    }

def process_docx_file(docx_path: str, output_json: str = None) -> List[Dict]:
    """
    Main processing function
    """

    if not os.path.exists(docx_path):
        print(f"Error. File not found: {docx_path}")
        return []

    # Parse raw headnotes
    raw_headnotes = parse_docx_headnotes(docx_path)

    if not raw_headnotes:
        print("Error. No headnotes found")
        return []

    # Process each headnote
    parsed_headnotes = []
    errors = []

    for i, raw_headnote in enumerate(raw_headnotes):
        try:
            parsed = parse_headnote_content(raw_headnote)
            parsed_headnotes.append(parsed)
        except Exception as e:
            error_info = {
                'index': i,
                'error': str(e),
                'preview': raw_headnote['raw_text'][:200] + "..."
            }
            errors.append(error_info)
            print(f"Error parsing headnote {i}: {e}")

    print(f"Successfully parsed __{len(parsed_headnotes)}__ headnotes")
    if errors:
        print(f"Errors: {len(errors)}")

    # Save results
    if output_json:
        output_data = {
            'metadata': {
                'source_file': docx_path,
                'total_headnotes': len(parsed_headnotes),
                'errors': len(errors),
                'processed_date': str(__import__('datetime').datetime.now())
            },
            'headnotes': parsed_headnotes,
            'errors': errors if errors else []
        }

        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"Saved file as : {output_json}")

    return parsed_headnotes

if __name__ == "__main__":
    import sys

    # Check for python-docx
    try:
        import docx
    except ImportError:
        print("Missing required package. Install:")
        print("pip install python-docx")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("Usage: python docx_parser.py <docx_file> [output.json]")
        print("\nSteps:")
        print("1. Convert RTF to DOCX using Word (File → Save As)")
        print("2. Run: python docx_parser.py headnotes.docx output.json")
        sys.exit(1)

    docx_file = sys.argv[1]
    json_output = sys.argv[2] if len(sys.argv) > 2 else "parsed_headnotes.json"

    # Process the file
    headnotes = process_docx_file(docx_file, json_output)

    if headnotes:
        # Summary stats
        years = [h['year'] for h in headnotes if h['year']]
        topics = [h['topic'] for h in headnotes if h['topic']]
        ors_total = sum(len(h.get('ors_citations', [])) for h in headnotes)
        oar_total = sum(len(h.get('oar_citations', [])) for h in headnotes)
        cases_total = sum(len(h.get('other_cases', [])) for h in headnotes)
        print(f"\n Summary:")
        if years:
            print(f"Years: {min(years)} - {max(years)}")
        if topics:
            print(f"    Unique headnotes: {len(set(topics))}")
        print(f"  ORS citations found: {ors_total}")
        print(f"  OAR citations found: {oar_total}")
        print(f"  Court case citations: {cases_total}")
    else:
        print("Zero headnotes successfully parsed. Check your DOCX file format.")