const {match} = require('assert');
const fs = require('fs');
//const sqlite3 = require('sqlite3').verbose();

class LUBADataJoiner {
    constructor(headnotesFile, opinionsFile) {
        this.headnotesFile = headnotesFile;
        this.opinionsFile = opinionsFile;
        this.headnotes = [];
        this.opinions = [];
        this.results = {
            headnotes: [],
            unmatched_headnotes: [],
            unmatched_opinions: [],
            citation_issues: []
        };
    }

    loadData() {
        console.log('Loading data files...');

        try {
            this.headnotes = JSON.parse(fs.readFileSync(this.headnotesFile, 'utf8'));
            console.log(`  Loaded ${this.headnotes.length} headnotes`);
        } catch (error) {
            console.error(`Error loading headnotes: ${error.message}`);
            return false;
        }

        try {
            this.opinions = JSON.parse(fs.readFileSync(this.opinionsFile, 'utf8'));
            console.log(`  Loaded ${this.opinions.length} opinions`);
        } catch (error) {
            console.error(`Error loading opinions: ${error.message}`);
            return false;
        }

        return true;
    }

    // Extract LUBA volume and page from headnote citation field or just reporter
    parseCite(citation) {
        if (!citation) return null;

        // Match pattern: "VV Or LUBA PPP"
        const lubaMatch = citation.match(/(\d{1,2})\s+Or\s+LUBA\s+(\d{1,4})/i);
        if (lubaMatch) {
            return {
                volume: parseInt(lubaMatch[1]),
                page: parseInt(lubaMatch[2])
            };
        }
        return null;
    }

    //strip case to common factors to simplify matching/validation
    normalize(aCase) {
        let cleanCase = aCase.replace(/[,.’"'~?/\\&%^$#@!*\(\)\[\])]/g, '')
        cleanCase = cleanCase.replace(/(\s+|-)/g, ' ')
        cleanCase = cleanCase.toLowerCase()
        cleanCase = cleanCase.replace(/(inc\b|llc|lp\b|et\sal|et\sseq|etc|city\sof|county|in\sre|estate\sof|association|assoc|company|\bco\b|corporation|\bcorp\b|district|\bdist\b|oregon|department|dept|division|\bdiv\b|condominiums?|condos?|conservation|\bcons\b|neigh\b|neighborhood|organization|\borgs?\b|\bthe\b|\band\b|)/gi, '')
        cleanCase = cleanCase.replace(/\s+/g, ' ')
        return cleanCase.trim()
    }

    // helper validates case name matches between first 3 words of opinion & headnote
    matchCases (headName, opinionName) {
        const headClean = this.normalize(headName);
        const opinionClean = this.normalize(opinionName);

        if (headClean !== opinionClean) {
            const headTrim = headClean.split(' ').slice(0, 3).join(' ');
            const opinionTrim = opinionClean.split(' ').slice(0, 3).join(' ');

            if (headTrim !== opinionTrim) {
                return (`Name mismatch: '${headClean}' vs '${opinionClean}'`);
            }
        }

        return null
    }


    // Create lookup maps for efficient joining
    createLookupMaps() {
        console.log('Creating lookup maps...');

        // Map opinions by LUBA citation components for precise matching
        this.opinionMaps = {
            byPageAndVolume: new Map(), // page number + volume (most reliable)
            byPageAndYear: new Map(),   // page number + year (good enough)
            byCaseName: new Map()     // case name (for validation only)
        };

        this.opinions.forEach((opinion, index) => {
            const opinionWithIndex = { ...opinion, _originalIndex: index };

            // By page number + volume (primary matching strategy)
            const parsedOpinionCite = this.parseCite(opinion.reporter);
            if (parsedOpinionCite) {
                const pageVolKey = `${parsedOpinionCite.page}_${parsedOpinionCite.volume}`;
                if (this.opinionMaps.byPageAndVolume.has(pageVolKey)) {
                    let duplicate = this.opinionMaps.byPageAndVolume.get(pageVolKey)
                    let oldError = duplicate.error ? `;\n${duplicate.error}` : ''
                    let err = `Luba Nos. ${opinion.luba_no.trim()} and ${duplicate.luba_no.trim()} ` +
                    `share reporter: ${opinion.reporter}${oldError}`
                    console.log(err)
                    opinionWithIndex.error = err
                }
                this.opinionMaps.byPageAndVolume.set(pageVolKey, opinionWithIndex);
            }

            // By page number and year (backup)
            if (parsedOpinionCite) {
                const pageYearKey = `${parsedOpinionCite.page}_${opinion.year}`;
                if (this.opinionMaps.byPageAndVolume.has(pageYearKey)) {
                    console.log(`duplicate value for ${pageYearKey} (page & year)!!`)
                }
                this.opinionMaps.byPageAndYear.set(pageYearKey, opinionWithIndex);
            }

            // By case name (for validation warnings)
            if (opinion.case) {
                const normalizedCase = this.normalize(opinion.case);
                if (!this.opinionMaps.byCaseName.has(normalizedCase)) {
                    this.opinionMaps.byCaseName.set(normalizedCase, []);
                } // allows for duplicates by creating list
                this.opinionMaps.byCaseName.get(normalizedCase).push(opinionWithIndex);
            }
        });

        console.log(`  Created page volume maps: ${this.opinionMaps.byPageAndVolume.size} entries`);
        console.log(`  Created page year maps: ${this.opinionMaps.byPageAndYear.size} entries`);
        console.log(`  Created case name map: ${this.opinionMaps.byCaseName.size} unique case names`);
    }

    // Try to match a headnote to an opinion
    findMatchingOpinion(headnote) {
        let matchedOpinion = null;
        let matchMethod = '';
        let validationWarnings = [];

        // Only match headnotes that have valid LUBA citations
        const headnoteCitation = this.parseCite(headnote.citation);
        if (!headnoteCitation) {
            return { opinion: null, method: 'no_valid_citation', warnings: ['Headnote has no valid LUBA citation'] };
        }

        // Primary strategy: Match by page number + volume
        const pageVolumeKey = `${headnoteCitation.page}_${headnoteCitation.volume}`;
        matchedOpinion = this.opinionMaps.byPageAndVolume.get(pageVolumeKey);

        if (matchedOpinion) {
            matchMethod = 'page_vol_exact';

            // Validate that the match makes sense
            // Check for year discrepancies (potential typos)
            const opinionYear = this.parseCite(matchedOpinion.year);

            if (opinionYear && opinionYear !== headnoteCitation.year) {
                validationWarnings.push(`Year mismatch: headnote is from ${headnoteCitation.year} vs opinion from ${opinionYear}`);
            }

            // Check case name similarity for validation
            if (headnote.case_name && matchedOpinion.case) {
                const mismatch = this.matchCases(headnote.case_name, matchedOpinion.case)
                if (mismatch) {
                    validationWarnings.push(mismatch)
                }
            }

            // Check for issues within the opinion map itself:
            if (matchedOpinion.error) {
                validationWarnings.push(matchedOpinion.error)
            }
        }

        // Secondary strategy: Match by page number + year
        if (!matchedOpinion) {
            const pageYearKey = `${headnoteCitation.page}_${headnoteCitation.year}`;
            matchedOpinion = this.opinionMaps.byPageAndYear.get(pageYearKey);
        }

        if (matchedOpinion && matchMethod == '') {
            matchMethod = 'page_year';

            const opinionVolume = matchedOpinion.volume

            if (opinionVolume) {
                validationWarnings.push(`Volume mismatch: headnote is volume ${headnoteCitation.volume} vs opinion v. ${matchedOpinion.volume}`);
            } else {
                validationWarnings.push(`Volume mismatch: headnote is volume ${headnoteCitation.volume} but opinion's volume is unknown.`);
            }

            // Check case name similarity for validation
            if (headnote.case_name && matchedOpinion.case) {
                const mismatch = this.matchCases(headnote.case_name, matchedOpinion.case)
                if (mismatch) {
                    validationWarnings.push(mismatch)
                }
            }
        }

        // If no match found, check if there are other opinions with the same case name
        // This helps identify potential data issues
        if (!matchedOpinion && headnote.case_name) {
            const normalizedCase = this.normalize(headnote.case_name);
            const sameCaseOpinions = this.opinionMaps.byCaseName.get(normalizedCase) || [];

            if (sameCaseOpinions.length > 0) {
                if (sameCaseOpinions.length > 1) {
                    validationWarnings.push(`Opinions for '${headnote.case_name}' exist but reporters mismatched: ${sameCaseOpinions.map(op => `${op.reporter} (${op.year})`).join('; ')}`);
                    matchMethod = 'case_too_many'
                } else {
                    matchedOpinion = sameCaseOpinions[0]
                    validationWarnings.push(`Only opinion found with matching name has mismatched reporter: ${matchedOpinion.case}, ${matchedOpinion.reporter || ''} (${matchedOpinion.year || ''})`);
                    matchMethod = 'case_only'
                }
            }
        }

        if (!matchMethod)
        {
            matchMethod = 'unmatched'
        }

        return {
            opinion: matchedOpinion,
            method: matchMethod,
            warnings: validationWarnings,
            citationData: headnoteCitation
        };
    }

    // Perform the join operation
    performJoin() {
        console.log('Performing join operation...');

        const usedOpinionIds = new Set();
        let validationWarnings = [];

        this.headnotes.forEach((headnote, index) => {
            const { opinion, method, warnings, citationData } = this.findMatchingOpinion(headnote);

            let finalRecord = {
                // Headnote data
                headnote_id: headnote.index || index,
                headnote: headnote.headnote,
                topic: headnote.topic,
                summary: headnote.summary,
                case_name: headnote.case_name,
                reporter: headnote.citation,
                year: headnote.year,
                ors_cites: headnote.ors_cites || [],
                oar_cites: headnote.oar_cites || [],
                case_cites: headnote.case_cites || [],
                formatting: headnote.formatting || [],
                warnings: headnote.error_list || [],
            }

            if (opinion) {
                // Create joined record
                let addJointProperties = {
                    opinion_matched_by: method,
                    opinion_case_name: opinion.case,
                    opinion_month: opinion.month,
                    opinion_year: opinion.year,
                    opinion_reporter: opinion.reporter,
                    opinion_pdf_url: opinion.url,
                    luba_no: opinion.luba_no,
                };

                for (const prop in addJointProperties) {
                    finalRecord[prop] = addJointProperties[prop]
                };

                usedOpinionIds.add(opinion._originalIndex);

            } else {
                // Unmatched headnote
                const reason = method === 'no_valid_citation' ? 'Invalid LUBA citation' : 'Matching opinion not found.';

                this.results.unmatched_headnotes.push({
                    headnote_id: headnote.index || index,
                    case_name: headnote.case_name,
                    citation: headnote.citation,
                    year: headnote.year,
                    reason: reason,
                    warnings: warnings
                });
                finalRecord['warnings'].push(`No LUBA opinion: ${reason}`);
            }

            // Collect validation warnings (matched or not)
            if (warnings.length > 0) {
                validationWarnings.push({
                    headnote_id: headnote.index || index,
                    case_name: headnote.case_name,
                    warnings: warnings
                });
                warnings.forEach(warn => {
                    finalRecord['warnings'].push(warn)
                });
            }
            this.results.headnotes.push(finalRecord);

        });

        // Find unmatched opinions (those with LUBA citations that didn't match any headnotes)
        this.opinions.forEach((opinion, index) => {
            if (!usedOpinionIds.has(index) && opinion.reporter !== 'Unpublished') {
                this.results.unmatched_opinions.push({
                    case: opinion.case,
                    year: opinion.year,
                    reporter: opinion.reporter,
                    luba_no: opinion.luba_no,
                    reason: 'No matching headnote found'
                });
            }
        });

        // Store validation warnings
        this.results.validation_warnings = validationWarnings;

        console.log('\nJoin Results:');
        console.log(`  Matched: ${this.results.headnotes.length}`);
        console.log(`  Unmatched headnotes: ${this.results.unmatched_headnotes.length}`);
        console.log(`  Unmatched published opinions: ${this.results.unmatched_opinions.length}`);
        console.log(`  Validation warnings: ${validationWarnings.length}`);
    }

    calculateConfidence(method) {
        switch (method) {
            case 'page_volume_exact': return 0.95;
            case 'page_year': return 0.75;
            default: return 0.40;
        }
    }

    // New Headnotes:
    async saveToFile(filename = 'luba_headnotes_opinions.json') {
        console.log(`\nSaving headnotes joined to opinions to ${filename}...`);

        const jsonOutput = JSON.stringify(this.results.headnotes, null, 2);
        fs.writeFileSync(filename, jsonOutput);

        console.log(`Successfully saved to ${filename}`);
    }

    exportReports(baseFilename = 'luba_join_report') {
        console.log('\nExporting validation reports...');

        // Summary report
        const summary = {
            total_headnotes: this.headnotes.length,
            total_opinions: this.opinions.length,
            matched_records: this.results.headnotes.length,
            unmatched_headnotes: this.results.unmatched_headnotes.length,
            unmatched_opinions: this.results.unmatched_opinions.length,
            citation_issues: this.results.citation_issues.length,
            match_methods: {}
        };

        // Count match methods
        this.results.headnotes.forEach(record => {
            summary.match_methods[record.match_method] = (summary.match_methods[record.match_method] || 0) + 1;
        });

        fs.writeFileSync(`${baseFilename}_summary.json`, JSON.stringify(summary, null, 2));

        // Detailed reports
        fs.writeFileSync(`${baseFilename}_unmatched_headnotes.json`, JSON.stringify(this.results.unmatched_headnotes, null, 2));
        fs.writeFileSync(`${baseFilename}_unmatched_opinions.json`, JSON.stringify(this.results.unmatched_opinions, null, 2));
        fs.writeFileSync(`${baseFilename}_validation_warnings.json`, JSON.stringify(this.results.validation_warnings, null, 2));

        console.log(`  Reports exported: ${baseFilename}_*.json`);
    }
}

// Usage
async function main() {
    const joiner = new LUBADataJoiner('./LUBA_headnotes_full.json', 'luba_opinions_2.json');

    if (!joiner.loadData()) {
        console.error('Failed to load data files');
        return;
    }

    joiner.createLookupMaps();
    joiner.performJoin();

    // Export results
    joiner.exportReports();
    joiner.saveToFile();
//    await joiner.exportToSQLite();

    console.log('\nJoin operation completed!');
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = LUBADataJoiner;