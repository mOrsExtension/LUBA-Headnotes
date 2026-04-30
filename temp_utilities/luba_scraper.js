/** Purpose: Scrapes case info and links to opinion/order (not actual PDFs) from
 * LUBA's Final Opinions and Published Orders pages by year if needed; saves them to file
 * Parses file & extracts reporter from file
 * requirements: Node & NPM.js (http://node.js)
 * Puppeteer (> npm puppeteer)
 **/

/* CONFIG */
const yearFirst = 1979;
const yearLast = 2021;
let outputFile = "luba_opinions_orders"; // + date & .json
let rawDataFile = "luba_raw_data"; // .json  -- created if it doesn't exist, otherwise, data is read & used or added to
// *************

/* INITIALIZE */
const puppeteer = require("puppeteer");
const fs = require("fs").promises;

/* GLOBALS */
let globalIndex = 1;
const sourceTypes = ["opinions", "orders"];
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

/** returns missing data based on scraping it from LUBA year URLS after getting list of URLS:
 * init(), navigate(url), getURLsBySourceAndYear(), getYearsLinks(), scrapeSourceYears()
 */
class lubaScraper {
  constructor(missingData) {
    this.browser = null;
    this.page = null;
    this.missingYears = missingData;
    this.pageUrls = {
      opinions: "https://www.oregon.gov/luba/Pages/Final-Opinions.aspx",
      orders: "https://www.oregon.gov/luba/Pages/Published-Orders.aspx",
    };
    /** full list of opinions & orders {sourceType : [{url, year}...]} */ this.fullYearLinks =
      {};
    /** final scraped raw data as {sourceType : year : [{linkList, lineList} ...]} */ this.scrapedData =
      {};
  }

  /** set up browser window */
  async init() {
    this.browser = await puppeteer.launch({
      headless: false, // Less likely for site to block
      devtools: false,
    });
    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.103 Safari/537.36",
    ); // Set user agent to avoid bot detection
    await this.page.setViewport({ width: 1280, height: 720 }); // Set viewport
    this.page.on("console", (msg) => {
      console.log(`     BROWSER: ${msg.text()}`);
    }); // Listen for browser console & error messages  (for debugging)
  }

  /** navigate browser to URL */
  async navigate(url) {
    try {
      await this.page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
    } catch {
      console.log(`Failed to navigate to ${url}`);
    }
  }

  /** pushes array of {url, year} ...] into fullYearLinks for all possible URLs by source */
  async getURLsBySourceAndYear() {
    console.log("Looking for opinions and orders...");

    // Process each URL type sequentially to avoid conflicts - don't use forEach with await!
    for (const aType of sourceTypes) {
      // opinions then orders
      this.sourceType = aType;
      const url = this.pageUrls[aType];
      console.log(
        `\n   === SCRAPING ${this.sourceType.toUpperCase()} LIST ===`,
      );
      this.fullYearLinks[aType] = await this.getYearsLinks(url);
    }
  }

  /** Retrieve list of all [{year, url}...] from main page for opinions or orders */
  async getYearsLinks(mainUrl) {
    console.log(
      `Fetching available years for ${this.sourceType} from: ${mainUrl}`,
    );
    await this.navigate(mainUrl);

    try {
      /** Extract year links and return array of [{[year]:url} ...] */
      const yearLinks = await this.page.evaluate(() => {
        const links = Array.from(document.querySelectorAll("a"));
        console.log(`Found ${links.length} total links`);
        // Filter to only links that are just 4-digit years
        const yearPageData = [];
        links.forEach((link) => {
          const linkText = link.textContent.trim();
          const href = link.href;

          // Check if text is a 4-digit year and within range of possible years
          if (
            /^\d{4}$/.test(linkText) &&
            parseInt(linkText) >= 1979 &&
            parseInt(linkText) <= 2026
          ) {
            yearPageData.push({
              text: linkText,
              url: href,
            });
          }
        });
        return yearPageData.sort((a, b) => parseInt(b.year) - parseInt(a.year)); // Sort descending by year
      });
      return yearLinks;
    } catch (error) {
      console.error(`Error getting years from ${mainUrl}:`, error.message);
      return [];
    }
  }

  /** Cycles through each missing years, matches with found URL and scrapes it from LUBA website */
  async scrapeSourceYears() {
    // Process years sequentially - don't use forEach (fails with await)
    for (const aType of sourceTypes) {
      this.sourceType = aType;
      console.log(
        `\n  === SCRAPING ${aType.toUpperCase()} INDIVIDUAL YEARS ===`,
      );
      for (let aYear of this.missingYears) {
        this.year = aYear;
        // Add a delay between requests to be polite
        await new Promise((resolve) => setTimeout(resolve, 850));
        const url = this.fullYearLinks[aType].find((l) => l.text == aYear)?.url;
        if (!this.scrapedData[aType]) {
          this.scrapedData[aType] = {}; // need to make sure it exists to write to, but don't want to overwrite existing data either
        }
        if (url) {
          await this.#scrapeSpecificYear(url);
        } else {
          console.log(
            ` !! No matching URL found, so no scraping for ${aYear} for ${aType} !!`,
          );
        }
      }
    }
  }

  /** For given year, return {bodyHtml (#main) */
  async #scrapeSpecificYear(url) {
    const getYear = this.year;
    console.log(
      `   Navigating to webpage for ${this.sourceType} for ${getYear} from: ${url}...`,
    );
    // Wait for content to load
    await this.navigate(url);
    console.log(`   ... Scraping ${this.sourceType} data for ${getYear}...`);
    /** BEGIN EVALUATE BLOCK, CANNOT TAKE ANYTHING IN OR OUT EXCEPT AS SERIALIZED DATA ****************************************************/
    const yearOpinionData = await this.page.evaluate(() => {
      // Get list of links and lines
      const mainBody = document.body.querySelector("#main");
      if (!mainBody) {
        return { linkList: [], lineList: [] }; // usually because the page didn't load
      }
      const linkWholeList = Array.from(mainBody.querySelectorAll("a"));
      const linkList = [];
      linkWholeList.forEach((link) => {
        if (link.href && link.textContent) {
          linkList.push({ url: link.href, text: link.textContent.trim() });
        }
      });
      let textLineList = mainBody.innerText.split("\n"); // get text from page, split by line
      textLineList = textLineList.filter((l) => l.length > 1); // exclude blank lines (only preprocessing done in browser context)
      return { linkList: linkList, lineList: textLineList };
    });
    /** end of evaluate
     * can add serialized data before parens and after comma to be sent to this.page.evaluate (must be JSON parsable) */
    console.log(
      `   ... Exported ${yearOpinionData.linkList.length} links & ${yearOpinionData.lineList.length} ${this.sourceType} entries for ${getYear} ...`,
    );
    this.scrapedData[this.sourceType][`year${getYear}`] = {
      ...yearOpinionData,
    };
  }
  /** close down browser window when scrapping is done */
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

/** takes in data to parse (url & text lists, matches them & spits out opinion data into .allOpinions) */
class lubaDataParser {
  constructor(dataToParse) {
    this.dataToParse = dataToParse;
    this.allOpinions = [];
    for (const aType of sourceTypes) {
      this.sourceType = aType;
      console.log(`\n === PARSING ${aType.toUpperCase()} ===`);
      for (let year = yearLast; year >= yearFirst; year--) {
        //cycle through data by years, descending; all years in range, scraped or not
        console.log(`   Parsing ${aType} data for ${year} ...`);
        this.currentYear = year;
        this.matchList = [];
        this.#matchLines();
        this.#processMatches();
      }
    }
  }

  async #matchLines() {
    /** Convert scrapped line & url data into into array of lines with cases matched with month & url
     * [{month, text, lubaNo, url, warnings}...] */

    console.log(`   ... Matching ${this.sourceType} with links and months ...`);
    let currentMonth = "";
    const lubaNoPattern = /(\d{2})-(\d{3})/; // YY-###
    const matchList = [];
    if (!this.dataToParse) {
      console.log("!!No data!!");
      return matchList;
    }
    if (
      !this.dataToParse[this.sourceType] ||
      this.dataToParse[this.sourceType] == {}
    ) {
      console.log(`  !! No data for ${this.sourceType} !!`);
      return matchList;
    }
    if (
      !this.dataToParse[this.sourceType][`year${this.currentYear}`] ||
      this.dataToParse[this.sourceType][`year${this.currentYear}`] == {} ||
      !this.dataToParse[this.sourceType][`year${this.currentYear}`]["lineList"]
    ) {
      console.log(
        `   !! No data for '${this.sourceType}' in 'year${this.currentYear}' !! `,
      );
      return matchList;
    }

    this.dataToParse[this.sourceType][`year${this.currentYear}`][
      "lineList"
    ].forEach((line, index) => {
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

      const lubaNoMatch = line.match(lubaNoPattern); // every case should at least have a LUBA No., even if not reported
      if (!(lubaNoMatch && currentMonth)) {
        console.log(`    Skipped line ${index + 1}: '${line}'`);
        return;
      }
      const urlTrim = /** string */ (u) => {
        return u.slice(32).trim(); // removes "https://www.oregon.gov/luba/Docs" (32 char) from url
      };

      let url = "";
      const lineWarnings = [];
      const lubaNoSimple = lubaNoMatch[0];
      const lubaNoTest = `${lubaNoMatch[1]}-?${lubaNoMatch[2]}`;
      const monthTest = RegExp(`\\/${currentMonth}-`);
      let lubaNoTextFull = lubaNoSimple;

      //matching links
      this.dataToParse[this.sourceType][`year${this.currentYear}`][
        "linkList"
      ].forEach((link) => {
        if (link.text?.includes(lubaNoSimple)) {
          if (url == "") {
            url = urlTrim(link.url);
            lubaNoTextFull = link.text;
          } else {
            // dealing with two LUBA Nos with cases decided in same year
            if (link.url.match(monthTest)) {
              if (url.match(monthTest)) {
                // if both are in same month, throw warning
                lineWarnings.push(
                  `LUBA No ${lubaNoSimple} in url: ${url} shares month with: ${urlTrim(link.url)}`,
                );
              } else {
                // if only the latter has a month that matches, swap
                url = urlTrim(link.url);
                lubaNoTextFull = link.text;
              }
            }
          }
        }
      });

      // testing data integrity
      if (url == "") {
        lineWarnings.push(
          `LUBA No ${lubaNoSimple} did not match any hyperlink text.`,
        );
      } else {
        //test month in URL vs CurrentMonth
        if (!url.match(monthTest)) {
          const anyMonth = url.match(/\/(\d{2})-/);
          lineWarnings.push(
            `Heading month: ${currentMonth} doesn't match: ${anyMonth ? anyMonth[1] : "undefined"} in ${url}`,
          );
        }

        //test LUBA No vs URL
        if (!url.match(RegExp(lubaNoTest))) {
          lineWarnings.push(`LUBA No ${lubaNoSimple} missing from url: ${url}`);
        }
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

  async #processMatches() {
    console.log("   ... Processing matches...");
    // Patterns:
    const reporterPattern = /(\d+\s+Or\s+LUBA\s+\d+)\s*\(\d{4}\)/;
    const casePattern = /.*v\..*(?=,)/;
    const results = [];
    this.matchList.forEach(
      (/** {month, text, lubaNo, url, warnings}*/ lubaCase) => {
        let lubaNo = lubaCase.lubaNo;
        let reporter = "";
        let caseName = lubaCase.text.replace(lubaNo, "").trim();
        if (caseName == "") {
          // 2006 in particular, entire line is link text
          lubaNo = lubaNo?.match(/(.*?)\s/)[1] || lubaNo;
          caseName = lubaCase.text.replace(lubaNo, "").trim();
        }
        const reporterMatch = caseName.match(reporterPattern);
        if (reporterMatch) {
          reporter = reporterMatch[1].trim();
        } else if (caseName.match("(Unpublished)")) {
          reporter = "(Unpublished)";
        }
        if (caseName.match(/^\s?et\sseq/)) {
          ((lubaNo = lubaNo), "et seq");
          caseName = caseName.replace("et seq", "").trim();
        }
        caseName = caseName.replace(reporter, "").trim();
        if (!reporter.match(/Or\sLUBA/)) {
          // if no actual reporter, include LUBA No(s) and date
          const pluralNos = lubaNo?.match(/\d{2}-\d{3}./) ? "Nos" : "No";
          const monthAbbr = monthData.find(
            (m) => m.num === lubaCase.month,
          )?.abbr;
          reporter =
            `LUBA ${pluralNos} ${lubaNo} (${monthAbbr} ?, ${this.currentYear}) ${reporter}`.trim();
        }

        caseName = caseName.replace(RegExp(`\\(${this.currentYear}\\)`), "");
        caseName = caseName.replace("\s*et\s+seq\s*", "").trim();
        const caseMatch = caseName.match(casePattern);
        if (caseMatch) {
          caseName = caseMatch[0].trim();
        }
        results.push({
          index: globalIndex,
          name: caseName,
          year: this.currentYear,
          month: lubaCase.month,
          reporter: reporter,
          luba_no: lubaNo,
          url: lubaCase.url,
          source_type: this.sourceType,
          warnings: lubaCase.warnings,
        });
        globalIndex++;
      },
    );
    this.allOpinions.push(...results);
    console.log(
      `   ... Finished parsing ${results.length} ${this.sourceType} for ${this.currentYear}.\n`,
    );
  }
}

class dataManager {
  constructor(rawDataFileName, finalOutputFileName) {
    this.rawDataFileName = rawDataFileName;
    this.finalOutputFileName = finalOutputFileName;
    this.rawData = {};
    /** {sourceType:year: [url] & [text] } */ this.dataToParse = {};
  }

  /** Opens and returns rawData json file, returns [] if doesn't exist or error if unparsable */
  async importRawDataAsJSON() {
    const path = this.rawDataFileName;
    try {
      const data = await fs.readFile(path, "utf-8");
      if (!data.trim() || data.trim().length < 3) {
        console.log("File is empty:", path);
        return {};
      }

      this.rawData = JSON.parse(data);
      console.log("Retrieved JSON from:", path);
    } catch (err) {
      if (err.code === "ENOENT") {
        console.error("File not found at:", path);
        return;
      } else {
        throw err;
      }
    }
  }

  /**  returns list of "years" with missing data & adds found data to dataToParse */
  async checkFileData() {
    let missingData = [];
    let existingData = {};
    for (let year = yearFirst; year <= yearLast; year++) {
      const yearObj = `year${year}`;
      if (
        !this.rawData ||
        this.rawData == {} ||
        !this.rawData.opinions ||
        !this.rawData.orders ||
        !this.rawData.opinions[yearObj] // only checking opinions, because not all years have orders
      ) {
        console.log(`Missing data for ${year} in rawData file`);
        missingData.push(year);
      } else {
        if (!existingData.opinions) {
          existingData.opinions = {};
          existingData.orders = {};
        }
        existingData.opinions[yearObj] = {
          ...this.rawData.opinions[yearObj],
        };
        existingData.orders[yearObj] = {
          ...this.rawData.orders[yearObj],
        };
      }
    }
    this.missingData = missingData;
    this.dataToParse = { ...existingData };
  }

  async scrapeMissingData() {
    if (this.missingData.length == 0) {
      console.log("No data to scrape (missing data is empty)");
      return;
    }
    const scraper = new lubaScraper(this.missingData);
    let scrapedData = {};
    //try {
    await scraper.init();
    await scraper.getURLsBySourceAndYear();
    await scraper.scrapeSourceYears();
    scrapedData = scraper.scrapedData;

    scraper.close();

    if (scrapedData && scrapedData.opinions) {
      if (!this.dataToParse.opinions) {
        this.dataToParse.opinions = {};
        this.dataToParse.orders = {};
      }
      if (!this.rawData.opinions) {
        this.rawData.opinions = {};
        this.rawData.orders = {};
      }
      // add newly scraped data to rawData (gets saved) & dataToParse (gets analyzed)
      Object.assign(this.dataToParse.opinions, scrapedData.opinions);
      Object.assign(this.dataToParse.orders, scrapedData.orders);
      Object.assign(this.rawData.opinions, scrapedData.opinions);
      Object.assign(this.rawData.orders, scrapedData.orders);
    } else {
      console.log("!! No scraped data returned; exiting");
      return;
    }

    // before saving raw data, want to sort each opinions and orders by year (should include years not being processed)
    console.log("===SORTING DATA===");
    if (this.rawData.opinions) {
      const yearSort = Array.from(Object.keys(this.rawData.opinions))
        .sort()
        .reverse(); // creates list of existing years in reverse order
      const objOpinionBuilder = (_obj, key) => ({
        ..._obj,
        [key]: this.rawData.opinions[key],
      }); // reducer call back to put object data back in order
      const objOrderBuilder = (_obj, key) => ({
        ..._obj,
        [key]: this.rawData.orders[key],
      });
      this.rawData.opinions = yearSort.reduce(objOpinionBuilder, {});
      this.rawData.orders = yearSort.reduce(objOrderBuilder, {});
    }
    await this.#saveToFile(this.rawData, this.rawDataFileName);
  }

  async processData() {
    const parser = new lubaDataParser(this.dataToParse);
    parser;
    const filePostFix = this.#getDateAndTime();
    this.allOpinions = await parser.allOpinions;
    this.#saveToFile(this.allOpinions, `${outputFile}_${filePostFix}.json`);
  }

  // get date & time
  #getDateAndTime() {
    const tNow = new Date();
    const tDate = tNow.toISOString().split("T")[0];
    const tTime = `${tNow.getHours().toString().padStart(2, "0")}${tNow.getMinutes().toString().padStart(2, "0")}`;
    return `${tDate}_${tTime}`;
  }

  /**  Sort list of objects by keys, (asc/desc?)
   * E.g. sorter(rawData, "year", "ascending", "month", "descending")
   * NOT YET RUNNING */
  #sorter(toSort, ...sortBys) {
    sortsLength = int(sortBys.length / 2);

    this.allOpinions.sort((a, b) => {
      if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year); // Descending by year
      return parseInt(a.month) - parseInt(b.month); // Ascending by month
    });
  }

  async #saveToFile(objectData, filename) {
    console.log(
      `\n=== Saving ${Object.keys(objectData).length} entries to ${filename} ===\n`,
    );
    const jsonOutput = JSON.stringify(objectData, null, 2);
    await fs.writeFile(filename, jsonOutput); // , "utf-8");
  }

  /**  Create & save summary
   * NOT FINISHED YET */
  async #generateSummary() {
    // Count by source type
    this.allOpinions.forEach((entry) => {
      const summary = {
        total_entries: this.allOpinions.length,
        by_source: {},
        by_year: {},
        years_covered: [
          ...new Set(this.allOpinions.map((op) => op.year)),
        ].sort(),
        sample_entries: this.allOpinions.slice(0, 5),
      };

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
}

async function main() {
  //  try {
  /** validate year range  */
  if (
    !(
      yearFirst &&
      yearLast &&
      yearFirst <= yearLast &&
      yearFirst >= 1979 &&
      yearLast <= 2030
    )
  ) {
    console.log(
      "Double check year range (between 1979 & 2030) at start of program",
    );
    return; // exit
  }
  let mgr = new dataManager(`${rawDataFile}.json`, outputFile);
  console.log("\nSTEP: 1 **Import & Review Existing Data **");
  await mgr.importRawDataAsJSON();
  await mgr.checkFileData();

  console.log("\nSTEP: 2 ** Download missing data (if any) **");
  if (mgr.missingData) {
    await mgr.scrapeMissingData();
  } else {
    console.log("  ...No data needs downloaded");
  }
  console.log("\nSTEP: 3 ** Process data **");
  await mgr.processData();
}

// Run the scraper
if (require.main === module) {
  main().catch(console.error);
}

/* Warnings Check SQL:
  SELECT source_type, year, luba_no, warnings FROM opinions WHERE NOT warnings = "[]" ORDER BY source_type, year, month
*/
