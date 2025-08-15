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
        this.pageUrls = [
            'https://www.oregon.gov/luba/Pages/Final-Opinions.aspx',
            'https://www.oregon.gov/luba/Pages/Published-Orders.aspx'
        ];
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

    async getAvailableYears(url) {
        console.log(`\nFetching available years from: ${url}`);

        try {
            await this.page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait a bit for page to fully load
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Extract year links
        const yearLinks = await this.page.evaluate(() => {
                console.log("Running in browser context");
            const links = Array.from(document.querySelectorAll('a'));
                console.log(`Found ${links.length} total links`);
            const yearData = [];

            // Look for links that are just 4-digit years
            links.forEach(link => {
                    const text = link.textContent ? link.textContent.trim() : '';
                const href = link.href;

                // Check if text is a 4-digit year between 1979-2025 (reasonable range)
                if (/^\d{4}$/.test(text) && parseInt(text) >= 1979 && parseInt(text) <= 2025) {
                    yearData.push({
                        year: text,
                        url: href
                    });
                }
            });

                console.log(`Found ${yearData.length} year links`);
            return yearData.sort((a, b) => parseInt(b.year) - parseInt(a.year)); // Sort descending
        });

            console.log(`  Found ${yearLinks.length} years: ${yearLinks.map(y => y.year).slice(0, 10).join(', ')}${yearLinks.length > 10 ? '...' : ''}`);
        return yearLinks;

        } catch (error) {
            console.error(`Error getting years from ${url}:`, error.message);
            return [];
        }
    }

    async scrapeYear(yearData, sourceType = 'opinions') {
        console.log(`\nScraping ${sourceType} for year ${yearData.year}...`);

        try {
            await this.page.goto(yearData.url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for content to load
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Extract all case information from the year page
            const opinions = await this.page.evaluate((year, sourceType) => {
                console.log(`Processing ${sourceType} for year ${year}`);
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

                    // Check if line is a month header and if so, set current month
                    if (monthHeaders.includes(line)) {
                        currentMonth = String(monthHeaders.indexOf(line) + 1).padStart(2, '0');
                        return;
                    }

                    // Look for case entries using regex pattern
                    // Pattern: [LUBA-NO] Case v. Entity, Reporter (Year) or [LUBA-NO] Case v. Entity (Unpublished)
                    // Updated to handle both formats with and without brackets
                    const casePattern = /\[?(\d{2,4}-\d\S+)\]?\s*(.*?v\.?.*?)(?:,\s*(\d+\s+Or\s+LUBA\s+\d+)\s*\(\d{4}\)|\s*\(Unpublished\)|$)/;
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
                            url: url,
                            source_type: sourceType
                        });
                    }
                });

                console.log(`Line searching found ${results.length} entries`);
                return results;
            }, yearData.year, sourceType);

            // Alternative approach using DOM traversal
            const domOpinions = await this.page.evaluate((year, sourceType) => {
                const results = [];
                const monthMap = {
                    'January': '01', 'February': '02', 'March': '03', 'April': '04',
                    'May': '05', 'June': '06', 'July': '07', 'August': '08',
                    'September': '09', 'October': '10', 'November': '11', 'December': '12'
                };

                // Find all links that look like PDF opinion/order links
                const links = Array.from(document.querySelectorAll('a[href*="/luba/Docs/"]'));

                console.log(`Links: ${links.length}`)

                links.forEach(link => {
                    const href = link.href;
                    const linkText = (link.textContent || link.innerText || '').trim();

                    // Get surrounding text context
                    const parentText = link.parentElement ?
                        (link.parentElement.textContent || link.parentElement.innerText || '') : '';
                    if (!linkText || !href) return;

                    // Extract LUBA number - could be the link text itself or in brackets
                    let lubaNo = '';
                    if (/^\d{2,4}-\d\S+$/.test(linkText)) {
                        lubaNo = linkText;
                    } else {
                        // Look for LUBA number in brackets or nearby
                        const lubaMatch = parentText.match(/\[?(\d{2,4}-\d\S+)\]?/);
                        if (lubaMatch) {
                            lubaNo = lubaMatch[1];
                        }
                    }

                    if (!lubaNo) return;

                    // Get the text after the LUBA number (case name and citation)
                    let contextText = parentText;
                    const lubaIndex = contextText.indexOf(lubaNo);
                    if (lubaIndex !== -1) {
                        contextText = contextText.substring(lubaIndex + lubaNo.length).trim();
                    }

                    // Try to parse case name and reporter
                    let caseName = '';
                    let reporter = '';

                    // Check for unpublished
                    if (contextText.includes('(Unpublished)')) {
                        caseName = contextText.replace('(Unpublished)', '').trim();
                        reporter = 'Unpublished';
                    } else {
                        // Look for reporter pattern: "XX Or LUBA YYY (YEAR)"
                        const reporterMatch = contextText.match(/^(.*?),\s*(\d+\s+Or\s+LUBA\s+\d+)\s*\(\d{4}\)/i);
                        if (reporterMatch) {
                            caseName = reporterMatch[1].trim();
                            reporter = reporterMatch[2].trim();
                        } else {
                            // No reporter found, try to extract case name
                            caseName = contextText.replace(/,\s*$/, '').trim();
                            // If case name is too long, truncate at reasonable point
                            if (caseName.length > 200) {
                                caseName = caseName.substring(0, 200).trim();
                            }
                        }
                    }

                    // Extract month from URL path
                    let month = '';
                    const monthMatch = href.match(/\/(\d{2})-\d{2}\//);
                    if (monthMatch) {
                        month = monthMatch[1];
                    }

                    // If we couldn't get month from URL, try to find it from context
                    if (!month) {
                        let element = link.parentElement;
                        let attempts = 0;
                        while (element && element !== document.body && attempts < 5) {
                            const textContent = element.textContent || element.innerText || '';
                            for (const [monthName, monthNum] of Object.entries(monthMap)) {
                                if (textContent.includes(monthName)) {
                                    month = monthNum;
                                    break;
                                }
                            }
                            if (month) break;
                            element = element.parentElement;
                            attempts++;
                        }
                    }

                    if (month && caseName && caseName.match(/\sv\.?\s/)) {
                        results.push({
                            case: caseName,
                            year: year,
                            month: month,
                            reporter: reporter || '',
                            luba_no: lubaNo,
                            url: href,
                            source_type: sourceType
                        });
                    }
                });

                console.log(`DOM searching found ${results.length} entries`);
                return results;
            }, yearData.year, sourceType);

            // Use the approach that found more results
            const yearOpinions = domOpinions.length >= opinions.length ? domOpinions : opinions;

            console.log(`  Found ${yearOpinions.length} ${sourceType} for ${yearData.year}`);

            // Add to main collection
            this.allOpinions.push(...yearOpinions);

            return yearOpinions;

        } catch (error) {
            console.error(`Error scraping year ${yearData.year} for ${sourceType}:`, error.message);
            return [];
        }
    }

    async scrapeAllYears(startYear = null, endYear = null) {
        console.log('Starting to scrape both opinions and orders...');

        // Process each URL type sequentially to avoid conflicts
        for (const url of this.pageUrls) {
            const sourceType = url.includes('Opinions') ? 'opinions' : 'orders';
            console.log(`\n=== Processing ${sourceType.toUpperCase()} ===`);

            try {
                const yearLinks = await this.getAvailableYears(url);

                if (yearLinks.length === 0) {
                    console.log(`No years found for ${sourceType}, skipping...`);
                    continue;
                }

        // Filter years if specified
        const yearsToScrape = yearLinks.filter(yearData => {
            const year = parseInt(yearData.year);
            if (startYear && year < startYear) return false;
            if (endYear && year > endYear) return false;
            return true;
        });

                console.log(`Will scrape ${yearsToScrape.length} years for ${sourceType}`);

                // Process years sequentially
        for (const yearData of yearsToScrape) {
                    await this.scrapeYear(yearData, sourceType);

                    // Add a delay between requests to be polite
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error(`Error processing ${sourceType}:`, error.message);
                // Continue with next source type even if this one fails
            }
        }

        return this.allOpinions;
    }

    async saveToFile(filename = 'luba_opinions.json') {
        console.log(`\nSaving ${this.allOpinions.length} total entries to ${filename}...`);

        // Sort by year and month
        this.allOpinions.sort((a, b) => {
            if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year); // Descending by year
            return parseInt(a.month) - parseInt(b.month); // Ascending by month
        });

        const jsonOutput = JSON.stringify(this.allOpinions, null, 2);
        fs.writeFileSync(filename, jsonOutput);

        console.log(`Successfully saved to ${filename}`);

        // Create summary
        const summary = {
            total_entries: this.allOpinions.length,
            by_source: {},
            by_year: {},
            years_covered: [...new Set(this.allOpinions.map(op => op.year))].sort(),
            sample_entries: this.allOpinions.slice(0, 5)
        };

        // Count by source type
        this.allOpinions.forEach(entry => {
            const sourceType = entry.source_type || 'unknown';
            summary.by_source[sourceType] = (summary.by_source[sourceType] || 0) + 1;

            summary.by_year[entry.year] = (summary.by_year[entry.year] || 0) + 1;
        });

        fs.writeFileSync(filename.replace('.json', '_summary.json'), JSON.stringify(summary, null, 2));
        console.log(`Summary saved to ${filename.replace('.json', '_summary.json')}`);
        console.log(`Breakdown: ${JSON.stringify(summary.by_source)}`);
    }

    async close() {
        if (this.browser) {
            try {
            await this.browser.close();
            } catch (error) {
                console.error('Error closing browser:', error.message);
            }
        }
    }
}

// Usage example
async function main() {
    const scraper = new LUBAScraper();

    try {
        await scraper.init();

        // Scrape all years, or specify a range:
        // await scraper.scrapeAllYears(1975, 2020); // Only specific range
        await scraper.scrapeAllYears(1990, 1990); // Only 2005 for testing
        // await scraper.scrapeAllYears(); // Scrape all available years

        await scraper.saveToFile('luba_opinions_and_orders.json');

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