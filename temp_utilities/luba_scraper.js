/**requirements: Node & NPM.js (http://node.js)
 * Puppeteer (> npm puppeteer)
 * Set year range (at bottom of script) before running
 **/

const puppeteer = require('puppeteer');
const fs = require('fs');

class LUBAScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = 'https://www.oregon.gov';
        this.mainPageUrl = 'https://www.oregon.gov/luba/Pages/Final-Opinions.aspx';
        this.allOpinions = [];
    }

    async init() {
        this.browser = await puppeteer.launch({
            headless: false, // Less likely for site to block
            devtools: false
        });
        this.page = await this.browser.newPage();

        // Listen for browser console messages (for debugging)
        this.page.on('console', msg => {
            console.log('BROWSER:', msg.text());
        });

        // Set user agent to avoid bot detection
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Set viewport
        await this.page.setViewport({ width: 1280, height: 720 });
    }

    async getAvailableYears() {
        console.log('Fetching available years...');
        await this.page.goto(this.mainPageUrl, { waitUntil: 'networkidle2' });

        // Extract year links
        const yearLinks = await this.page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const yearData = [];

            // Look for links that are just 4-digit years
            links.forEach(link => {
                const text = link.textContent.trim();
                const href = link.href;

                // Check if text is a 4-digit year between 1979-2025 (reasonable range)
                if (/^\d{4}$/.test(text) && parseInt(text) >= 1979 && parseInt(text) <= 2025) {
                    yearData.push({
                        year: text,
                        url: href
                    });
                }
            });

            return yearData.sort((a, b) => parseInt(b.year) - parseInt(a.year)); // Sort descending
        });

        console.log(`Found ${yearLinks.length} years: ${yearLinks.map(y => y.year).join(', ')}`);
        return yearLinks;
    }

    async scrapeYear(yearData) {
        console.log(`\nScraping year ${yearData.year}...`);

        try {
            await this.page.goto(yearData.url, { waitUntil: 'networkidle2' });

            // Extract all case information from the year page
            const opinions = await this.page.evaluate((year) => {
                const results = [];

                // Find all month sections (look for month headers)
                const monthHeaders = ['January', 'February', 'March', 'April', 'May', 'June',
                                    'July', 'August', 'September', 'October', 'November', 'December'];

                // Get all text content and look for patterns
                const allText = document.body.innerText;
                const lines = allText.split('\n');
                let currentMonth = '';

                lines.forEach(line => {
                    line = line.trim();

                    // Check if line is a month header and if so, increment month
                    if (monthHeaders.includes(line)) {
                        currentMonth = String(monthHeaders.indexOf(line) + 1).padStart(2, '0');
                        return;
                    }

                    // Look for case entries using regex pattern
                    // Pattern: [LUBA-NO] Case v. Entity, Reporter (Year) or [LUBA-NO] Case v. Entity (Unpublished)
                    // Use the specific "XX Or LUBA YYY" pattern as anchor to avoid breaking on commas in party names
                    const casePattern = /(\d{2,4}-\d\S+)\s*(.*?v\..*?)(?:,\s*(\d+\s+Or\s+LUBA\s+\d+)\s*\(\d{4}\)|\s*\(Unpublished\)|$)/;
                    const match = line.match(casePattern);

                    if (match && currentMonth) {
                        const lubaNo = match[1].trim();
                        let caseName = match[2].trim();
                        const reporter = match[3] ? match[3].trim() : '';
                        const isUnpublished = line.includes('(Unpublished)');

                        // Clean up case name - remove extra whitespace
                        caseName = caseName.replace(/\s+/g, ' ').trim();

                        // Try to extract URL from the page
                        const links = Array.from(document.querySelectorAll('a'));
                        let url = '';

                        // Look for a link that contains the LUBA number
                        const lubaNoClean = lubaNo.replace(/[^\d-]/g, ''); // Remove non-digits and hyphens
                        for (const link of links) {
                            if (link.href && (link.href.includes(lubaNoClean) || link.textContent.includes(lubaNo))) {
                                url = link.href;
                                break;
                            }
                        }

                        results.push({
                            case: caseName,
                            year: year,
                            month: currentMonth,
                            reporter: isUnpublished ? 'Unpublished' : reporter,
                            luba_no: lubaNo,
                            url: url
                        });
                    }
                });

                console.log(`     Opinions founds through line searching = ${results.length}`)

                return results;
            }, yearData.year);

            // Alternative approach using DOM traversal if the regex approach misses cases
            const domOpinions = await this.page.evaluate((year) => {
                const results = [];
                const monthMap = {
                    'January': '01', 'February': '02', 'March': '03', 'April': '04',
                    'May': '05', 'June': '06', 'July': '07', 'August': '08',
                    'September': '09', 'October': '10', 'November': '11', 'December': '12'
                };

                // Find all links that look like PDF opinion links
                const links = Array.from(document.querySelectorAll('a[href*="/luba/Docs/"]'));

                links.forEach(link => {
                    const href = link.href;
                    const text = link.parentElement.textContent || link.parentElement.innerText;

                    if (!text || !href) return;

                    // Extract LUBA number from link text [2004-067]
                    const lubaNo = link.textContent || link.innerText;
                    if (!lubaNo) return;

                    // Get the text after the LUBA number (case name and citation)
                    const afterLuba = text.substring(text.indexOf(lubaNo) + lubaNo.length).trim();

                    // Try to parse case name and reporter
                    let caseName = '';
                    let reporter = '';

                    // Check for unpublished
                    if (afterLuba.includes('(Unpublished)')) {
                        caseName = afterLuba.replace('(Unpublished)', '').trim();
                        reporter = 'Unpublished';
                    } else {
                        // Look for reporter pattern: "XX Or LUBA YYY (YEAR)"
                        const reporterMatch = afterLuba.match(/^(.*?),\s*(\d+\s+Or\s+LUBA\s+\d+)\s*\(\d{4}\)/);
                        if (reporterMatch) {
                            caseName = reporterMatch[1].trim();
                            reporter = reporterMatch[2].trim();
                        } else {
                            // No reporter found, entire text is case name
                            caseName = afterLuba.replace(/,\s*$/, '').trim();
                        }
                    }

                    // Extract month from URL path
                    let month = '';
                    const monthMatch = href.match(/\/(\d{2})-\d{2}\//);
                    if (monthMatch) {
                        month = monthMatch[1];
                    }

                    if (month && caseName) {
                        results.push({
                            case: caseName,
                            year: year,
                            month: month,
                            reporter: reporter || '',
                            luba_no: lubaNo,
                            url: href
                        });
                    }
                });

                console.log(`     Opinions founds through DOM searching = ${results.length}`)

                return results;
            }, yearData.year);

            // Use longer results as they're likely more accurate
            const yearOpinions = domOpinions.length >= opinions.length ? domOpinions : opinions;

            console.log(`  Found ${yearOpinions.length} opinions for ${yearData.year}`);

            // Add to main collection
            this.allOpinions.push(...yearOpinions);

            return yearOpinions;

        } catch (error) {
            console.error(`Error scraping year ${yearData.year}:`, error.message);
            return [];
        }
    }

    async scrapeAllYears(startYear = null, endYear = null) {
        const yearLinks = await this.getAvailableYears();

        // Filter years if specified
        const yearsToScrape = yearLinks.filter(yearData => {
            const year = parseInt(yearData.year);
            if (startYear && year < startYear) return false;
            if (endYear && year > endYear) return false;
            return true;
        });

        console.log(`\nScraping ${yearsToScrape.length} years...`);

        for (const yearData of yearsToScrape) {
            await this.scrapeYear(yearData);

            // Add a small delay between requests to be polite
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return this.allOpinions;
    }

    async saveToFile(filename = 'luba_opinions.json') {
        console.log(`\nSaving ${this.allOpinions.length} opinions to ${filename}...`);

        // Sort by year and month
        this.allOpinions.sort((a, b) => {
            if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year); // Descending by year
            return parseInt(a.month) - parseInt(b.month); // Ascending by month
        });

        const jsonOutput = JSON.stringify(this.allOpinions, null, 2);
        fs.writeFileSync(filename, jsonOutput);

        console.log(`Successfully saved to ${filename}`);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Usage example
async function main() {
    const scraper = new LUBAScraper();

    try {
        await scraper.init();

        // Scrape all years, or specify a range:
        // await scraper.scrapeAllYears(2020, 2024); // Only 2020-2024
        // await scraper.scrapeAllYears(2005, 2005); // Only 2005 for testing
        await scraper.scrapeAllYears(); // Scrape all available years

        await scraper.saveToFile('luba_opinions.json');

    } catch (error) {
        console.error('Scraping failed:', error);
    } finally {
        await scraper.close();
    }
}

// Run the scraper
if (require.main === module) {
    main().catch(console.error);
}

module.exports = LUBAScraper;