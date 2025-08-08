
document.addEventListener('DOMContentLoaded', async () => {
    // Find all headnote entries
    const headnoteEntries = document.querySelectorAll('.headnote-entry');

    headnoteEntries.forEach(headnoteEntry => {
        const linkTemplate = `/luba?sql=SQL`
        // Add links to headnote numbers
        const headnoteHeader = headnoteEntry.querySelector('.headnote-header');
        if (headnoteHeader) {
            const headerText = headnoteHeader.innerHTML;
            const headnoteMatch = headerText.match(/<strong>Headnote:<\/strong>\s*([^:]+)/);
            let sectionDiv = null
            let subsectionDiv = null

            if (headnoteMatch) {
                const headnoteNumber = headnoteMatch[1].trim();
                const sql = `SELECT * FROM headnotes WHERE headnote = '${headnoteNumber.replace(/'/g, "''")}' ORDER BY year DESC`;
                const encodedSQL = encodeURIComponent(sql);
                const link = linkTemplate.replace(/SQL/, encodedSQL);

                const newHeaderText = headerText.replace(
                    headnoteMatch[0],
                    `<strong>Headnote:</strong> <a href="${link}" class="citation-link">${headnoteNumber}</a>`
                );
                headnoteHeader.innerHTML = newHeaderText;

                //create section & subsection data and links to metadata
                const headParser = /(\d+\.)(\d+)?/
                const match = headnoteNumber.match(headParser)
                const headSection = match[1] ? match[1] : null
                const headSubSec = match[2] ? match [0] : null
                headNoteMeta = headnoteEntry.querySelector('.metadata').children[0]
                if (headNoteMeta) {
                    if (headSubSec) {
                        subsectionDiv = document.createElement('div')
                        const sql = `SELECT * FROM headnotes WHERE headnote LIKE '%${headSubSec}%' ORDER BY headnote ASC, year DESC`;
                        const encodedSQL = encodeURIComponent(sql);
                        const link = linkTemplate.replace(/SQL/, encodedSQL);
                        subsectionDiv.innerHTML = `<div class="metadata-line"><strong>Subsection:</strong> <a href=${link}>${headSubSec}</a></div>`;
                        headNoteMeta.insertBefore(subsectionDiv, headNoteMeta.children[1])
                    }
                    if (headSection) {
                        sectionDiv = document.createElement('div')
                        const sql = `SELECT * FROM headnotes WHERE headnote LIKE '%${headSection}%' ORDER BY headnote ASC, year DESC`;
                        const encodedSQL = encodeURIComponent(sql);
                        const link = linkTemplate.replace(/SQL/, encodedSQL);
                        sectionDiv.innerHTML = `<div class="metadata-line"><strong>Section:</strong> <a href=${link}>${headSection}</a></div>`;
                        headNoteMeta.insertBefore(sectionDiv, headNoteMeta.children[1])
                    }
                }
            }
        }

        // Add links to LUBA case citations
        const caseCitation = headnoteEntry.querySelector('.case-citation');
        if (caseCitation) {

            const citationText = caseCitation.textContent.trim();
            // Pattern search "VV Or LUBA PPP"
            const match = citationText.match(/(\d+\sOr\sLUBA\s\d+)\s+\((\d{4})/i);
            let citeReporter = match ? match[1] : null

            if (citeReporter) {
                // Create SQL to citation in either citation field or case_cites field
                const sql = `SELECT * FROM headnotes WHERE citation LIKE '%${citeReporter}%' OR case_cites LIKE '%${citeReporter}%' ORDER BY year DESC`;
                const encodedSQL = encodeURIComponent(sql);
                const link = linkTemplate.replace(/SQL/, encodedSQL);

                // Replace the citation part with a link
                caseCitation.innerHTML = citationText.replace(
                    citeReporter,
                    `<a href="${link}" class="citation-link" title="search headnotes for cases">${citeReporter}</a>`
                );
            }
        }

        // Add links to case cites in metadata
        const metadataLines = headnoteEntry.querySelectorAll('.metadata-line');
        metadataLines.forEach(line => {
            const lineText = line.textContent;

            // Handle Case Cites line
            if (lineText.includes('Case Cites:')) {
                const citesMatch = lineText.match(/Case Cites:\s*(.+)/);
                if (citesMatch) {
                    const citesText = citesMatch[1];
                    // Split by comma and create links for each citation
                    const citations = citesText.split(',').map(cite => cite.trim());

                    const linkedCitations = citations.map(cite => {
                        if (cite && cite !== '') {
                            const sql = `SELECT * FROM headnotes WHERE citation LIKE '%${cite.replace(/'/g, "''")}%' OR case_cites LIKE '%${cite.replace(/'/g, "''")}%' ORDER BY year DESC`;
                            const encodedSQL = encodeURIComponent(sql);
                            const link = linkTemplate.replace(/SQL/, encodedSQL);
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

                    const linkedORS = orsCitations.map(cite => {
                        if (cite && cite !== '') {
                            const sql = `SELECT * FROM headnotes WHERE ors_cites LIKE '%${cite.replace(/'/g, "''")}%' ORDER BY year DESC`;
                            const encodedSQL = encodeURIComponent(sql);
                            const link = linkTemplate.replace(/SQL/, encodedSQL);
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

                    const linkedOAR = oarCitations.map(cite => {
                        if (cite && cite !== '') {
                            const sql = `SELECT * FROM headnotes WHERE oar_cites LIKE '%${cite.replace(/'/g, "''")}%' ORDER BY year DESC`;
                            const encodedSQL = encodeURIComponent(sql);
                            const link = linkTemplate.replace(/SQL/, encodedSQL);
                            return `<a href="${link}" class="citation-link">${cite}</a>`;
                        }
                        return cite;
                    }).join(', ');

                    line.innerHTML = line.innerHTML.replace(oarText, linkedOAR);
                }
            }
            // Handle Luba No line
            if (lineText.includes('LUBA No.:')) {
                const lubaNumMatch = lineText.match(/(\d{4})-(\d+)(\/\d+)?(\/\d+)?(\/\d+)?(\/\d+)*/);
                if (lubaNumMatch) {
                    const matchString = lubaNumMatch[0]
                    let replaceString = matchString
                    const year = lubaNumMatch[1];

                    lubaNumMatch.forEach((aMatch, index) => {
                        if (index > 1 && aMatch) {
                            const caseNum = aMatch.replace(/\//,'').trim();
                            const caseNumRE = RegExp(`\\b${caseNum}(\\b|$)`,'g');
                            console.log(caseNumRE);
                            const sql = `SELECT * FROM headnotes WHERE luba_no LIKE '%${year}%'AND luba_no LIKE '%${caseNum}%' ORDER BY year DESC, reporter ASC, headnote ASC`;
                            const encodedSQL = encodeURIComponent(sql);
                            const link = linkTemplate.replace(/SQL/, encodedSQL);
                            replaceString = replaceString.replace(caseNumRE, `<a href="${link}" class="luba_num_link">${caseNum}</a>`);
                        }
                    })

                    line.innerHTML = line.innerHTML.replace(matchString, replaceString);
                }
            }
        });
    });
})