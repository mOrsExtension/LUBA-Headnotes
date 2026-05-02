#!/usr/bin/env python3
"""
Simple DOCX parser for LUBA headnotes
Converted to DOCX manually using Word
to run type 'python luba_docx_parser.py <doc name.docx>'
"""

import re, json, os, traceback
from typing import List, Dict

def parse_docx_headnotes(file_path: str) -> List[Dict]:
    """
    Parse DOCX file and extract headnotes with formatting
    """
    try:
        from docx import Document
    except ImportError:
        print("python-docx is not installed. Run: pip install python-docx")
        return []

    print(f"Reading DOCX: {file_path}")

    wordDoc = Document(file_path)
    headNotes = []
    current_headnote = None

    for para in wordDoc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        # Check if this starts a new headnote (it should)
        headnote_match = re.match(r'^((?:\d{1,2}\.)+\d{0,2})(?=\D)', text)

        if headnote_match:
            # Save previous headnote if it exists
            if current_headnote:
                headNotes.append(current_headnote)

            # Start new current headnote
            current_headnote = {
                'headnote_number': headnote_match.group(1),
                'formatting': extract_formatting(para),
                'raw_text': text
            }
        elif current_headnote:
            # Continue existing current headnote
            current_headnote['raw_text'] += ' ' + text

            # Add formatting from this paragraph
            para_formatting = extract_formatting(para)
            current_headnote['formatting'].extend(para_formatting)

    # Picking up the last headnote
    if current_headnote:
        headNotes.append(current_headnote)

    print(f"Found {len(headNotes)} headnotes")
    return headNotes

def extract_formatting(paragraph) -> List[Dict]:
    """
    Extract bold/italic runs from a paragraph, consolidate adjacent runs
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

def extract_headnote_data(headnote: Dict) -> Dict:
    """
    Extract structured data from headnote
    """
    raw_text = headnote['raw_text']
    warnings = []

    # Extract headnote number
    number = headnote['headnote_number']

    # Extract topic ("Headnote - subsection - sub-sub") without period
    # assumes topic doesn't end with num or capital letter to avoid tripping on "U.S." or "197.xxx"
    topic_pattern = r'^(?:[\d.]{2,}\s+)([\s\S]+?[^S-U0-9]\.)'
    topic_match = re.search(topic_pattern, raw_text)
    topic = ""
    if topic_match:
        topic = topic_match.group(1).strip().rstrip('.')
    else:
        warnings.append(f"No topic found in {raw_text} using {topic_pattern}")

    # Validate whether topic & headnote number have same number of levels
    en_dash_count = len(re.findall(r'\u2013', topic))
    dot_count = len(re.findall(r'\.\d', number))
    if not en_dash_count == dot_count:
        warnings.append(f"Headnote '{number}' & topic '{topic}' appear mismatched")

    # Get case name from last italic formatting block and remove it from formatting list
    case_name = ""
    if headnote['formatting']:
        italic_blocks = [fmt['text'] for fmt in headnote['formatting'] if fmt['type'] == 'italic']
        if italic_blocks:
            case_name = italic_blocks[-1].strip(" ,")  # remove any trailing comma or spaces from last italic block
            if re.match(r'^v\.\s', case_name):  # dealing with situation where first party is italicized in separate italicized run (e.g., "some guy" "v. county")
                if len(italic_blocks) > 1:
                    case_name = italic_blocks[-2].strip() + " " + case_name
                    print (case_name)
                    del headnote['formatting'][-2]
                    warnings.append(f"Case italicization was broken; check reporter for {case_name}")
                else:
                    warnings.append(f"Missing party before 'v.' in case {case_name}")
            del headnote['formatting'][-1]
        else:
            match_vs = re.findall(r'\S*?\sv\.\s[\s\S]*?,', raw_text)  # cruder regular expressions search as backup
            if match_vs:
                case_name = match_vs[len(match_vs)-1].strip(" ,") # takes last reporter
                warnings.append(f'No italicized case name; case "{case_name}" was parsed via regular expressions, may be missing part of party name')
            else:
                warnings.append('No italicized case name found; no LUBA case found by regular expressions')

    # Remove topic from formatting list
    if len(headnote['formatting']) > 0 and headnote['formatting'][0]['type'] == 'bold':
        checkText = headnote['formatting'][0]['text']
        if re.match(number, checkText) or re.match(topic, checkText):
            del headnote['formatting'][0]

    # Extract reporter (#### Or LUBA YYYY) by looking after the case name
    reporter = ""
    year = None
    if case_name:
        # Find text after the case name
        case_name_pos = raw_text.rfind(case_name)
        if case_name_pos != -1:
            text_after_case = raw_text[case_name_pos + len(case_name):].strip()
            text_after_case = re.sub(r' OR ', ' Or ', text_after_case) # turn any "OR" into "Or"
            # Look for reporter pattern: "## Or LUBA ### (YYYY)" cases on/before 2020
            reporter_pattern = r'\s*(\d+\s+Or\s+LUBA\s+\d+)\s+\((\d{4})\)'
            reporter_pattern = re.search(reporter_pattern, text_after_case)
            if reporter_pattern:
                reporter = reporter_pattern.group(1).strip()
                try:
                    year = int(reporter_pattern.group(2))
                except:
                    year = None
                    warnings.append(f'No case year found in {text_after_case}')

            # method for retrieving reporters after circa 2020
            if not (reporter):
                post_reporter_match = r'LUBA Nos? \d{4}-([0-9/-])+\s\(\w{3,4}\s\d{1,2},\s(\d{4})\)'
                post_match = re.search(post_reporter_match, text_after_case)
                if post_match:
                    reporter = post_match.group(0).strip()
                    try:
                        year = int(post_match.group(2))
                    except:
                        year = None
                        warnings.append(f'No case year found in {text_after_case}')
                # NOTE: We could extract month (or full date) too from group (1), but don't have a place to put it yet
                else:
                    warnings.append(f'No case cite found in {text_after_case}')

    # Extract summary (between topic and case name)
    summary = raw_text
    if topic_match:
        summary = summary[topic_match.end():].strip()
    if case_name:
        case_name_pos = summary.rfind(case_name)
        if case_name_pos != -1:
            summary = summary[:case_name_pos].strip()

    # Remove double spaces
    summary = re.sub(r'\s+', ' ', summary).strip()

    # Extract ORS citations
    ors_pattern = r'(\d{1,3}[A-C]?\.\d{3,4})(?=\D)'
    ors_cites = re.findall(ors_pattern, summary)

    # Extract & normalize OAR citations
    oar_pattern = r'((\d{3})-(\d{2,4})-(\d{2,4}))(?=\D)'
    oar_cite_pieces = re.findall(oar_pattern, summary)
    oar_cites = []
    for cite in oar_cite_pieces:
        first = f"{int(cite[1]):03d}"
        second = f"{int(cite[2]):03d}"
        third = f"{int(cite[3]):04d}"
        oar_cites.append (f"{first}-{second}-{third}")

    # Extract case citations (excluding the main case)
    state_cases_pattern = r'\d{1,3}\sOr\.?\s*(?:App\.?|LUBA)?\s*\d{1,4}'
    scotus_cases_pattern = r'\d{1,3}\sU\.?S\.?\s\d{1,4}'
    pac_fed_reporter_pattern = r'\d{1,3}\s(?:F|P)\.?\dd\s\d{1,4}'
    case_cites = re.findall(state_cases_pattern, summary)
    case_cites += re.findall(scotus_cases_pattern, summary)
    case_cites += re.findall(pac_fed_reporter_pattern, summary)

    return {
        'headnote': number,
        'topic': topic,
        'summary': summary,
        'case_name': case_name,
        'reporter': reporter,
        'year': year,
        'ors_cites': list(set(ors_cites)),  # Removes duplicates
        'oar_cites': list(set(oar_cites)),
        'case_cites': list(set(case_cites)),
        'formatting': headnote['formatting'],
        'warnings': warnings
    }

def process_docx_file(docx_path: str, output_meta: str, output_json: str = None) -> List[Dict]:
    """
    Main processing function
    """

    if not os.path.exists(docx_path):
        print(f"Error. Word file not found at: {docx_path}")
        return []

    # Parse raw headnotes into list with formatting
    raw_headnotes = parse_docx_headnotes(docx_path)

    if not raw_headnotes:
        print("Error. No headnotes found")
        return []

    # Process each headnote
    parsed_headnotes = []
    errors = []
    parse_warning_list = []

    for i, raw_headnote in enumerate(raw_headnotes):
        try:
            parsed = extract_headnote_data(raw_headnote)
            parsed['index'] = str(i)
            for a_warning in parsed['warnings']:
                parse_warning_list.append(f'item {i}: {a_warning}')
            parsed_headnotes.append(parsed)
        except Exception as e:
            error_info = {
                'index': i,
                'error': str(e),
                'preview': raw_headnote['raw_text'][:100] + "..."
            }
            errors.append(error_info)
            print(f"Error parsing headnote {i}: {e} : {traceback.format_exc()}")

    print(f"Successfully parsed __{len(parsed_headnotes)}__ headnotes")
    if errors:
        print(f"Errors: {len(errors)}")

    # Save results
    if output_json:
        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(parsed_headnotes, f, indent=2, ensure_ascii=False)

        print(f"Saved file as : {output_json}")

    if output_meta:
        metadata = {
            'metadata': {
                'total_headnotes': len(parsed_headnotes),
                'parsing_failures': len(errors),
                'possible_errors': parse_warning_list,
                'processed_date': str(__import__('datetime').datetime.now()),
                'errors': errors if errors else []
            }
        }
        with open(output_meta, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)

        print(f"Saved file as : {output_meta}")

    return parsed_headnotes

# entry into program
if __name__ == "__main__":
    import sys

    # Check for python-docx
    try:
        import docx
    except ImportError:
        print("Missing required package. Install:")
        print("pip install python-docx")
        sys.exit(1)

    if len(sys.argv) < 1:
        print("Docx file missing. Type 'python docx_parser.py <docx_file>'")
        sys.exit(1)

    docx_file = sys.argv[1]
    date_stamp = str(__import__('datetime').datetime.now().strftime("%Y-%m-%d--%H-%M"))
    json_output = f"LUBA_headnotes_{date_stamp}.json"
    json_output_meta = f"Headnotes_Results_{date_stamp}.json"

    # run parser to return headnotes as list
    headnotes = process_docx_file(docx_file, json_output_meta, json_output)

    if headnotes:
        # Summary stats
        years = [h['year'] for h in headnotes if h['year']]
        topics = [h['topic'] for h in headnotes if h['topic']]
        ors_total = sum(len(h.get('ors_cites', [])) for h in headnotes)
        oar_total = sum(len(h.get('oar_cites', [])) for h in headnotes)
        cases_total = sum(len(h.get('case_cites', [])) for h in headnotes)
        errors_total = sum(len(h.get('warning_list',[])) for h in headnotes)
        print(f"\n Summary:")
        if years:
            print(f"Years: {min(years)} - {max(years)}")
        if topics:
            print(f"      Total headnotes: {len(topics)}")
            print(f"     Unique headnotes: {len(set(topics))}")
            print(f"  ORS citations found: {ors_total}")
            print(f"  OAR citations found: {oar_total}")
            print(f" Court case citations: {cases_total}")
            print(f"      Possible errors: {errors_total}")
        else:
            print("Zero headnotes successfully parsed. Check your DOCX file format.")