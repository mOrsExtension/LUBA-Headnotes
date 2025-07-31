document.addEventListener('DOMContentLoaded', function() {

    // Apply formatting from the stored formatting data
        const formattingScripts = document.querySelectorAll('.formatting-data');
    formattingScripts.forEach(function(script) {
        try {
            const formattingText = script.textContent.trim();
            const targetId = script.getAttribute('data-target');
            const targetElement = document.getElementById(targetId);

            // Skip if no formatting data or target element
            if (!targetElement || !formattingText || formattingText === '[]' || formattingText === '') {
                return;
            }

            // Parse the SQLite text representation of the JSON array
            let formatting;
            try {
                formatting = JSON.parse(formattingText);
            } catch (jsonError) {
                // If JSON.parse fails, decode HTML entities and try again
                try {
                    const decodedText = decodeHtmlEntities(formattingText);
                    formatting = JSON.parse(decodedText);
                } catch (secondError) {
                    console.log('Could not parse formatting after HTML decode:', formattingText);
                    return;
                }
            }

            if (formatting && Array.isArray(formatting) && formatting.length > 0) {
                let text = targetElement.textContent;

                // Apply formatting (currently just handles italic)
                formatting.forEach(function(format) {
                    if (format.type === 'italic' && format.text) {
                        const regex = new RegExp(escapeRegExp(format.text), 'g');
                        text = text.replace(regex, '<em>' + format.text + '</em>');
                    }
                        if (format.type === 'bold' && format.text) {
                        const regex = new RegExp(escapeRegExp(format.text), 'g');
                        text = text.replace(regex, '<strong>' + format.text + '</strong>');
                    }
                });

                targetElement.innerHTML = text;
            }
        } catch (e) {
            console.log('Could not process formatting data:', e);
        }
    });

    // Handle SQL example buttons
    const sqlExamples = document.querySelectorAll('.sql-example');
    const sqlTextarea = document.querySelector('textarea[name="sql"]');

    sqlExamples.forEach(function(button) {
        button.addEventListener('click', function() {
            if (sqlTextarea) {
                sqlTextarea.value = this.getAttribute('data-sql');
            }
        });
    });

    // Add clickable links to headnotes and citations
    addClickableLinks();
});

function addClickableLinks() {
    // Find all headnote entries
    const headnoteEntries = document.querySelectorAll('.headnote-entry');

    headnoteEntries.forEach(function(entry) {
        // Add links to headnote numbers
        const headnoteHeader = entry.querySelector('.headnote-header');
        if (headnoteHeader) {
            const headerText = headnoteHeader.innerHTML;
            const headnoteMatch = headerText.match(/<strong>Headnote:<\/strong>\s*([^;]+)/);

            if (headnoteMatch) {
                const headnoteNumber = headnoteMatch[1].trim();
                const sql = `SELECT * FROM headnotes WHERE headnote = '${headnoteNumber.replace(/'/g, "''")}' ORDER BY year DESC`;
                const encodedSQL = encodeURIComponent(sql);
                const link = `/luba?sql=${encodedSQL}`;

                const newHeaderText = headerText.replace(
                    headnoteMatch[0],
                    `<strong>Headnote:</strong> <a href="${link}" class="citation-link">${headnoteNumber}</a>`
                );
                headnoteHeader.innerHTML = newHeaderText;
            }
        }

        // Add links to case citations
        const caseCitation = entry.querySelector('.case-citation');
        if (caseCitation) {
            const citationText = caseCitation.textContent;
            const citationMatch = citationText.match(/Case Citation:\s*(.+)/);

            if (citationMatch) {
                const fullCitation = citationMatch[1].trim();

                // Look for patterns like "80 Or LUBA 221" or "125 Or App 588"
                const citationPatterns = [
                    /(\d+\s+Or\s+LUBA\s+\d+)/gi,
                    /(\d+\s+Or\s+App\s+\d+)/gi,
                    /(\d+\s+Or\s+\d+)/gi
                ];

                let citationPart = null;
                for (let pattern of citationPatterns) {
                    const match = fullCitation.match(pattern);
                    if (match) {
                        citationPart = match[0];
                        break;
                    }
                }

                if (citationPart) {
                    // Create SQL to find this citation in either citation field or case_cites field
                    const sql = `SELECT * FROM headnotes WHERE citation LIKE '%${citationPart.replace(/'/g, "''")}%' OR case_cites LIKE '%${citationPart.replace(/'/g, "''")}%' ORDER BY year DESC`;
                    const encodedSQL = encodeURIComponent(sql);
                    const link = `/luba?sql=${encodedSQL}`;

                    // Replace the citation part with a link
                    const linkedCitation = fullCitation.replace(
                        citationPart,
                        `<a href="${link}" class="citation-link">${citationPart}</a>`
                    );

                    caseCitation.innerHTML = caseCitation.innerHTML.replace(
                        fullCitation,
                        linkedCitation
                    );
                }
            }
        }

        // Add links to case cites in metadata
        const metadataLines = entry.querySelectorAll('.metadata-line');
        metadataLines.forEach(function(line) {
            const lineText = line.textContent;

            // Handle Case Cites line
            if (lineText.includes('Case Cites:')) {
                const citesMatch = lineText.match(/Case Cites:\s*(.+)/);
                if (citesMatch) {
                    const citesText = citesMatch[1];
                    // Split by comma and create links for each citation
                    const citations = citesText.split(',').map(cite => cite.trim());

                    const linkedCitations = citations.map(function(cite) {
                        if (cite && cite !== '') {
                            const sql = `SELECT * FROM headnotes WHERE citation LIKE '%${cite.replace(/'/g, "''")}%' OR case_cites LIKE '%${cite.replace(/'/g, "''")}%' ORDER BY year DESC`;
                            const encodedSQL = encodeURIComponent(sql);
                            const link = `/luba?sql=${encodedSQL}`;
                            return `<a href="${link}" class="citation-link">${cite}</a>`;
                        }
                        return cite;
                    }).join(', ');

                    line.innerHTML = line.innerHTML.replace(citesText, linkedCitations);
                }
            }

            // Handle ORS Cites line
            if (lineText.includes('ORS Cites:')) {
                const orsMatch = lineText.match(/ORS Cites:\s*(.+)/);
                if (orsMatch) {
                    const orsText = orsMatch[1];
                    const orsCitations = orsText.split(',').map(cite => cite.trim());

                    const linkedORS = orsCitations.map(function(cite) {
                        if (cite && cite !== '') {
                            const sql = `SELECT * FROM headnotes WHERE ors_cites LIKE '%${cite.replace(/'/g, "''")}%' ORDER BY year DESC`;
                            const encodedSQL = encodeURIComponent(sql);
                            const link = `/luba?sql=${encodedSQL}`;
                            return `<a href="${link}" class="citation-link">${cite}</a>`;
                        }
                        return cite;
                    }).join(', ');

                    line.innerHTML = line.innerHTML.replace(orsText, linkedORS);
                }
            }

            // Handle OAR Cites line
            if (lineText.includes('OAR Cites:')) {
                const oarMatch = lineText.match(/OAR Cites:\s*(.+)/);
                if (oarMatch) {
                    const oarText = oarMatch[1];
                    const oarCitations = oarText.split(',').map(cite => cite.trim());

                    const linkedOAR = oarCitations.map(function(cite) {
                        if (cite && cite !== '') {
                            const sql = `SELECT * FROM headnotes WHERE oar_cites LIKE '%${cite.replace(/'/g, "''")}%' ORDER BY year DESC`;
                            const encodedSQL = encodeURIComponent(sql);
                            const link = `/luba?sql=${encodedSQL}`;
                            return `<a href="${link}" class="citation-link">${cite}</a>`;
                        }
                        return cite;
                    }).join(', ');

                    line.innerHTML = line.innerHTML.replace(oarText, linkedOAR);
                }
            }
        });
    });
}

// Helper function to decode HTML entities
function decodeHtmlEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

// Helper function - escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}