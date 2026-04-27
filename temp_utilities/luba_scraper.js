/** Purpose: Scrapes case info and links to opinion/order (not actual PDFs) from
 * LUBA's Final Opinions and Published Orders pages by year
 * requirements: Node & NPM.js (http://node.js)
 * Puppeteer (> npm puppeteer)
 **/

/* CONFIG */
const yearFirst = 1979;
const yearLast = 2021;
let outputFile = "luba_opinions"; // + date & .json
let rawDataFile = "raw_data"; // .json  -- created if it doesn't exist, otherwise, data is read & used or added to
// *************

/* INITIALIZE */
const puppeteer = require("puppeteer");
const fs = require("fs");

const monthData = [
  ["January", "01", "Jan"],
  ["February", "02", "Feb"],
  ["March", "03", "Mar"],
  ["April", "04", "Apr"],
  ["May", "05", "May"],
  ["June", "06", "June"],
  ["July", "07", "July"],
  ["August", "08", "Aug"],
  ["September", "09", "Sept"],
  ["October", "10", "Oct"],
  ["November", "11", "Nov"],
  ["December", "12", "Dec"],
].map(([name, num, abbr]) => ({ name, num, abbr }));

class LUBAScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.pageUrls = [
      "https://www.oregon.gov/luba/Pages/Final-Opinions.aspx",
      "https://www.oregon.gov/luba/Pages/Published-Orders.aspx",
    ];
    this.allOpinions = [];
    this.rawData = [];
    /** [{month, lubaNo, text, url warnings}] */
    this.matchList = [];
    /**{year, url} */
    this.currentYear = {};
    /** "opinion"/"order" */
    this.sourceType = "";
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: false, // Less likely for site to block
      devtools: false,
    });
    this.page = await this.browser.newPage();

    // Listen for browser console messages and error messages (for debugging)
    this.page.on("console", (msg) => {
      console.log("  BROWSER:", msg.text());
    });

    // Set user agent to avoid bot detection
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    );

    // Set viewport
    await this.page.setViewport({ width: 1280, height: 720 });
  }

  // * Retrieve list of years from main page for all available opinions or orders *
  async getAvailableYears(url) {
    console.log(
      `\nFetching available years for ${this.sourceType} from: ${url}`,
    );
    try {
      await this.page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      /** Extract year links and return as obj{year, url} */
      const yearLinks = await this.page.evaluate(() => {
        console.log("Running in browser context.");
        const links = Array.from(document.querySelectorAll("a"));
        console.log(
          `Found ${links.length} total links in /final-${this.sourceType}.aspx`,
        );

        // Look for links that are just 4-digit years
        const yearData = [];
        links.forEach((link) => {
          const linkText = link.textContent.trim();
          const href = link.href;

          // Check if text is a 4-digit year and within range of possible years
          if (
            /^\d{4}$/.test(linkText) &&
            parseInt(linkText) >= 1979 &&
            parseInt(linkText) <= 2026
          ) {
            yearData.push({
              year: linkText,
              url: href,
            });
          }
        });
        console.log(`Of those, found ${yearData.length} year links`);
        return yearData.sort((a, b) => parseInt(b.year) - parseInt(a.year)); // Sort descending
      });
      return yearLinks;
    } catch (error) {
      console.error(`Error getting years from ${url}:`, error.message);
      return [];
    }
  }

  async scrapeRange(startYear = 1999, endYear = 1999) {
    console.log("Starting to scrape both opinions and orders...");

    // Process each URL type sequentially to avoid conflicts - don't use forEach!
    for (const url of this.pageUrls) {
      this.sourceType = url.includes("Opinions") ? "opinions" : "orders";
      console.log(`\n === Processing ${this.sourceType.toUpperCase()} ===`);

      //try {
      const yearLinks = await this.getAvailableYears(url);

      if (yearLinks.length === 0) {
        console.log(`  No years found for ${this.sourceType}, skipping...`);
        continue;
      }

      // Filter years if specified
      const yearsToScrape = yearLinks.filter((yearData) => {
        const year = parseInt(yearData.year);
        if (startYear && year < startYear) return false;
        if (endYear && year > endYear) return false;
        return true;
      });

      console.log(
        ` Preparing ${yearsToScrape.length} years for ${this.sourceType}`,
      );

      // Process years sequentially
      for (const yearData of yearsToScrape) {
        // Add a delay between requests to be polite
        this.currentYear = yearData;
        await new Promise((resolve) => setTimeout(resolve, 800));
        await this.scrapeYear();
        await this.matchLines();
        await this.processMatches();
      }
    }
  }

  //* For given year, return bodyHtml (#main) */
  async scrapeYear() {
    const getYear = this.currentYear.year;
    console.log(`   ... Scraping ${this.sourceType} for year ${getYear}...`);

    try {
      await this.page.goto(this.currentYear.url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
    } catch (error) {
      console.error(
        `Error scraping year ${getYear} for ${this.sourceType}:`,
        error.message,
      );
      return [];
    }

    // Wait for content to load
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(`   ... Retrieving ${this.sourceType} for year ${getYear}...`);
    /** BEGIN EVALUATE BLOCK, CANNOT TAKE ANYTHING IN OR OUT EXCEPT AS SERIALIZED DATA ****************************************************/
    const yearOpinionData = await this.page.evaluate(() => {
      // Get list of links and lines
      const mainBody = document.body.querySelector("#main");
      const linkList = Array.from(mainBody.querySelectorAll("a"));
      const linkData = [];
      linkList.forEach((link) => {
        if (link.href && link.textContent) {
          linkData.push({ url: link.href, text: link.textContent.trim() });
        }
      });
      const lineList = mainBody.innerText.split("\n");
      return { linkData: linkData, lineList: lineList };
    });
    /** end of evaluate
     * can add serialized data before parens and after comma to be sent to this.page.evaluate (must be JSON parsable) */
    console.log(`   ... Extracted ${this.sourceType} from website ...`);
    this.rawData = yearOpinionData;
  }

  async matchLines() {
    /** Convert scrapped line & url data into into array of lines with cases matched with month & url
     * [{month, text, lubaNo, url, warnings}...] */

    console.log("   ... Matching retrieved cases with links and month...");
    let currentMonth = "";
    const lubaNoPattern = /(\d{2})-(\d{3})/; // YY-###
    const matchList = [];
    this.rawData.lineList.forEach((line, index) => {
      if (!line || line.length < 2) {
        // skip missing or single character lines
        return;
      }
      // Check if line is a month header and if so change current month
      const currentMonthFind = monthData.find(
        (m) => m.name.toUpperCase().trim() === line.toUpperCase().trim(),
      )?.num;
      if (currentMonthFind) {
        currentMonth = currentMonthFind;
        return;
      }

      const lubaNoMatch = line.match(lubaNoPattern); // every case will at least have a LUBA No., even if not reported
      if (!(lubaNoMatch && currentMonth)) {
        console.log(`    Skipping line #${index}: ${line}`);
        return;
      }
      let url = "";
      const lineWarnings = [];
      const lubaNoSimple = lubaNoMatch[0];
      let lubaNoTextFull = lubaNoSimple;
      this.rawData.linkData.forEach((link) => {
        if (link.text.includes(lubaNoSimple)) {
          if (url == "") {
            url = link.url;
            lubaNoTextFull = link.text;
          } else {
            lineWarnings.push(
              `  LUBA # "${lubaNoSimple} matches hyperlink for "${url}" + "${link.href}"`,
            );
          }
        }
      });

      if (url == "") {
        lineWarnings.push(
          `LUBA # "${lubaNoSimple} did not match any hyperlink text`,
        );
      }

      matchList.push({
        month: currentMonth,
        text: line.trim(),
        lubaNo: lubaNoTextFull,
        url: url,
        warnings: lineWarnings,
      });
    });
    this.matchList = matchList;
  }

  async processMatches() {
    console.log("   ... Processing matches...");
    // Patterns:
    const reporterPattern = /(\d+\s+Or\s+LUBA\s+\d+)\s*\(\d{4}\)/;
    const casePattern = /.*v\..*(?=,)/;
    const results = [];
    this.matchList.forEach(
      (/** {month, text, lubaNo, url, warnings}*/ lubaCase) => {
        let reporter = "";
        let caseName = lubaCase.text.replace(lubaCase.lubaNo, "").trim();
        const reporterMatch = caseName.match(reporterPattern);
        if (reporterMatch) {
          reporter = reporterMatch[1].trim();
        } else if (caseName.match("(Unpublished)")) {
          reporter = "(Unpublished)";
        }
        caseName = caseName.replace(reporter, "").trim();
        if (!reporter.match(/Or\sLUBA/)) {
          // if no actual reporter, include LUBA No(s) and date
          const pluralNos = lubaCase.lubaNo?.match(/\d{2}-\d{3}./)
            ? "Nos"
            : "No";
          const monthAbbr = monthData.find(
            (m) => m.num === lubaCase.month,
          )?.abbr;
          reporter =
            `LUBA ${pluralNos} ${lubaCase.lubaNo} (${monthAbbr} ?, ${this.currentYear.year}) ${reporter}`.trim();
        }

        caseName = caseName.replace(
          RegExp(`\\(${this.currentYear.year}\\)`),
          "",
        );
        const caseMatch = caseName.match(casePattern);
        if (caseMatch) {
          caseName = caseMatch[0].trim();
        }
        results.push({
          case: caseName,
          year: this.currentYear.year,
          month: lubaCase.month,
          reporter: reporter,
          luba_no: lubaCase.lubaNo,
          url: lubaCase.url,
          source_type: this.sourceType,
          warnings: this.matchList.warnings,
        });
      },
    );
    this.allOpinions.push(...results);
    console.log(`   ... Finished parsing ${results.length} ${this.sourceType}`);
  }

  async saveToFile(filename) {
    // add date & extension to output files
    const tNow = new Date();
    const tDate = tNow.toISOString().split("T")[0];
    const tTime = `${tNow.getHours().toString().padStart(2, "0")}${tNow.getMinutes().toString().padStart(2, "0")}`;
    outputFile = `${outputFile}_${tDate}_${tTime}.json`;

    console.log(
      `\n=== Export of ${this.allOpinions.length} entries to ${outputFile} ===\n`,
    );
    // Sort by year and month
    this.allOpinions.sort((a, b) => {
      if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year); // Descending by year
      return parseInt(a.month) - parseInt(b.month); // Ascending by month
    });

    const jsonOutput = JSON.stringify(this.allOpinions, null, 2);
    fs.writeFileSync(outputFile, jsonOutput);

    console.log(`Successfully saved to ${outputFile}`);

    // Create & save summary
    const summary = {
      total_entries: this.allOpinions.length,
      by_source: {},
      by_year: {},
      years_covered: [...new Set(this.allOpinions.map((op) => op.year))].sort(),
      sample_entries: this.allOpinions.slice(0, 5),
    };

    // Count by source type
    this.allOpinions.forEach((entry) => {
      const sourceType = entry.source_type || "unknown";
      summary.by_source[sourceType] = (summary.by_source[sourceType] || 0) + 1;
      summary.by_year[entry.year] = (summary.by_year[entry.year] || 0) + 1;
    });

    fs.writeFileSync(
      filename.replace(".json", "_summary.json"),
      JSON.stringify(summary, null, 2),
    );
    console.log(
      `Summary saved to ${filename.replace(".json", "_summary.json")}`,
    );
    console.log(`Breakdown: ${JSON.stringify(summary.by_source)}`);
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error("Error closing browser:", error.message);
      }
    }
  }
}

async function main() {
  const scraper = new LUBAScraper();

  try {
    await scraper.init();

    // Scrape all years, or specify a range:
    if (yearFirst && yearLast && yearFirst <= yearLast) {
      await scraper.scrapeRange(yearFirst, yearLast); //
    } else {
      await scraper.scrapeRange();
    }

    await scraper.saveToFile(outputFile);
  } catch (error) {
    console.error("Scraping failed:", error);
  } finally {
    await scraper.close();
  }
}

// Run the scraper
if (require.main === module) {
  main().catch(console.error);
}
