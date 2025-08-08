
document.addEventListener('DOMContentLoaded', async () => {
    // Find all headnote entries
    const linkTemplate = `/luba?sql=SQL`

    //populate links in headnotes list
    const headNumLinks = document.querySelectorAll('a.head-number');

    headNumLinks.forEach(headNumLink => {
        const sql = `SELECT * FROM headnotes WHERE headnote LIKE '${headNumLink.textContent}%' ORDER BY headnote ASC, year DESC`;
        const encodedSQL = encodeURIComponent(sql);
        const link = linkTemplate.replace(/SQL/, encodedSQL);
        headNumLink.setAttribute('href', link)
        headNumLink.setAttribute('title', `Search for headnote ${headNumLink.textContent}>`)
    })

    // add all links to headnotes
    const headnoteEntries = document.querySelectorAll('.headnote-entry');

    headnoteEntries.forEach(headnoteEntry => {
        // Add links to headings headnote numbers
        const headnoteHeader = headnoteEntry.querySelector('.headnote-header');
        if (headnoteHeader) {
            const headerText = headnoteHeader.innerHTML;
            //create section & subsection data and links to metadata
            const headParser = /(\d+)\.(\d+)?\.?(\d+)?/
            const match = headerText.match(headParser)
            const headnoteNum = match[0] ? match [0] : null
            const headSection = match[1] ? match[1] : null
            const headSubSec = match[2] ? match [2] : null
            const headSubSub = match[3] ? match [3] : null
            let newHeadnoteNum = ''
            if (headSection) {
                const sql = `SELECT * FROM headnotes WHERE headnote LIKE '${headSection}%' ORDER BY headnote ASC, year DESC`;
                const encodedSQL = encodeURIComponent(sql);
                const link = linkTemplate.replace(/SQL/, encodedSQL);
                newHeadnoteNum = `<a href="${link}" title="Search for headnote ${headSection}">${headSection}</a>.`
            } else {
                console.log(`No headnote for this section!?: ${headerText.trim()}`);
            }
            if (headSubSec) {
                const sql = `SELECT * FROM headnotes WHERE headnote LIKE '${headSection}.${headSubSec}%' ORDER BY headnote ASC, year DESC`;
                const encodedSQL = encodeURIComponent(sql);
                const link = linkTemplate.replace(/SQL/, encodedSQL);
                newHeadnoteNum += `<a href=${link} title="Search for headnote ${headSection}.${headSubSec}">${headSubSec}</a></div>`;
            }
            if (headSubSub) {
                const sql = `SELECT * FROM headnotes WHERE headnote LIKE '${headSection}.${headSubSec}.${headSubSub}%' ORDER BY headnote ASC, year DESC`;
                const encodedSQL = encodeURIComponent(sql);
                const link = linkTemplate.replace(/SQL/, encodedSQL);
                newHeadnoteNum += `.<a href="${link}" title="Search for headnote ${headSection}.${headSubSec}.${headSubSub}">${headSubSub}</a></div>`;
            }
            if (newHeadnoteNum.length > 0) {
                headnoteHeader.innerHTML = headerText.replace(headnoteNum, newHeadnoteNum)
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
                const sql = `SELECT * FROM headnotes WHERE reporter LIKE '%${citeReporter}%' OR case_cites LIKE '%${citeReporter}%' ORDER BY year DESC`;
                const encodedSQL = encodeURIComponent(sql);
                const link = linkTemplate.replace(/SQL/, encodedSQL);

                // Replace the citation part with a link
                caseCitation.innerHTML = citationText.replace(
                    citeReporter,
                    `<a href="${link}" class="citation-link" title="search headnotes for cases">${citeReporter}</a>`
                );
            }
        }

        // Add links to SQL searches in metadata
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
                            const sql = `SELECT * FROM headnotes WHERE reporter LIKE '%${cite.replace(/'/g, "''")}%' OR case_cites LIKE '%${cite.replace(/'/g, "''")}%' ORDER BY year DESC`;
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