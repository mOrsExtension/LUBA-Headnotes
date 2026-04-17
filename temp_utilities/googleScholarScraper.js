const puppeteer = require("puppeteer");
const fs = require("fs");

/**
 * Commented out by Claude 4/16/2026 so that I can pick this project back up again at some point:
 * googleScholarScraper.js
 *
 * Purpose: Given a JSON list of LUBA (Land Use Board of Appeals) opinions,
 * search Google Scholar to find whether each case was subsequently appealed
 * to a higher Oregon court. Results are scored by how well a Scholar case
 * page matches the LUBA case metadata (LUBA number, reporter citation,
 * party names).
 *
 * High-level flow:
 *   1. convertToSearches()  — reads notes_opinions_sample.json into search objects
 *   2. main()               — iterates search objects, calls startScraping() on each
 *   3. startScraping()      — tries up to 6 URL variants (3 query types × 2 breadths)
 *   4. #getCaseList()       — loads a Scholar search page, returns result links
 *   5. #testAllLinks()      — opens each link and scores it against the source case
 *   6. getMetaData()        — *** STUB *** extracts metadata from a confirmed match
 *   7. evaluateResults()    — *** UNDEFINED *** decides if scored results are good enough
 *   8. saveResults()        — *** UNDEFINED *** persists results to disk / keyMap
 *
 * Known bugs (marked with BUG comments inline):
 *   - #getCaseList passes wrong arg to #loadUrl (searchUrl["main"] vs. searchUrl)
 *   - #getCaseList and #navigateAndTest call this.page.evaluate instead of this.page[name].evaluate
 *   - #testAllLinks initializes testResults as [] but uses it as {}
 *   - #testAllLinks passes the page *object* to #navigateAndTest instead of the page *name*
 *   - startScraping always appends "No subsequent appellate history found" even on success
 */

/* **** CONFIG ***** */
const fileName = "notes_opinions_sample.json";

class GoogScholarScraper {
  constructor() {
    this.browser = null;
    this.page = {}; // keyed by tab name, e.g. "main", "tab-0", "tab-1"
    this.searchUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=4,38&q=`;
    this.keyMap = new Map(); // cache: "reporter_lubaNo" → result object; avoids re-scraping duplicates
    this.currentResult = {}; // accumulates result data for the search currently in progress
  }

  // ─── Browser lifecycle ────────────────────────────────────────────────────

  async initBrowser() {
    this.browser = await puppeteer.launch({
      headless: false, // visible window — less likely to be blocked by Scholar's bot detection
      devtools: false,
    });
  }

  /** Opens a new named browser tab and stores it in this.page[pageName]. */
  async initPage(pageName) {
    this.page[pageName] = await this.browser.newPage();

    // Mirror browser console messages to Node stdout for debugging
    this.page[pageName].on("console", (msg) => {
      console.log(`Browser/${pageName} : ${msg.text()}`);
    });

    // Spoof a real Chrome user-agent to reduce bot-detection risk
    await this.page[pageName].setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    );

    await this.page[pageName].setViewport({ width: 1280, height: 720 });
  }

  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error("Error closing browser:", error.message);
      }
    }
  }

  // ─── Deduplication ────────────────────────────────────────────────────────

  /**
   * Checks whether this key was already scraped.
   * If found, restores the cached result into this.currentResult and returns false
   * (telling the caller to skip scraping). Returns true if the key is new.
   *
   * NOTE: The map is only ever *read* here, never written. Saving new results
   * back to keyMap is supposed to happen in saveResults(), which is not yet defined.
   */
  keyCheck(keyName) {
    if (this.keyMap.has(keyName)) {
      this.currentResult = this.keyMap.get(keyName);
      return false;
    }
    return true;
  }

  // ─── Main scraping logic ──────────────────────────────────────────────────

  /**
   * Tries up to 6 search URL variants for a single case and picks the best match.
   *
   * The 6 attempts are: 3 query types × 2 breadths:
   *   Attempts 0-2: narrow — includes "from the Land Use Board of Appeals" phrase
   *     0: search by LUBA number
   *     1: search by reporter citation
   *     2: search by case name (parties)
   *   Attempts 3-5: broad — same 3 queries WITHOUT the LUBA phrase (fallback)
   *
   * Stops early when evaluateResults() (TODO) says the match is good enough.
   * If a search returns ≥6 results it is treated as ambiguous and recorded as a warning.
   *
   * BUG: the "No subsequent appellate history found" message on line ~101 is appended
   * unconditionally after the loop, even when a match was found and we broke early.
   * A found-flag or early return is needed.
   */
  async startScraping(searchItem) {
    this.currentSearch = searchItem;
    this.currentResult = {}; // reset for each new case

    for (let index = 0; index < 6; index++) {
      let urlAttempt = this.#buildUrls(index);
      if (urlAttempt) {
        await this.#getCaseList(urlAttempt);

        if (this.currentCaseList && this.currentCaseList.length > 0) {
          if (this.currentCaseList.length < 6) {
            // Manageable number of results — test each link
            let caseResults = await this.#testAllLinks();
            if (caseResults && Object.keys(caseResults).length > 0) {
              console.log(`Test results: ${JSON.stringify(caseResults)}`);
              if (evaluateResults(caseResults)) {
                // TODO: evaluateResults is not defined — see stubs section below
                break;
              }
            }
          } else {
            // Too many results to reliably score; flag for manual review
            this.currentResult.url = urlAttempt;
            let message =
              "Potential subsequent appellate history found - multiple potential cases";
            let warning =
              "Subsequent appellate history of questionable quality; see link in metadata";
            this.currentResult.warn = [
              ...(this.currentResult.warn || []),
              warning,
            ];
            this.currentResult.msg = [
              ...(this.currentResult.msg || []),
              message,
            ];
            this.currentResult.found = index;
            break;
          }
        }
      }
    }

    // BUG: this runs even when a match was found above. Add a `let found = false`
    // flag, set it inside the success branch, and guard this line with `if (!found)`.
    let message2 = "No subsequent appellate history found.";
    this.currentResult.msg = [...(this.currentResult.msg || []), message2];
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Builds a Google Scholar search URL for a given attempt index (0–5).
   *
   * Attempt < 3: prepends the LUBA court phrase for a narrow search.
   * Attempt >= 3: omits the phrase for a broader fallback search.
   * Within each group, the query term cycles through: LUBA No → reporter → case name.
   * Returns null if the required field for that slot is missing on the search object.
   *
   * NOTE: The `yearString` filter uses a 2-year window (minYear to minYear+2),
   * which assumes the appeal was decided within 2 years of the LUBA decision.
   */
  #buildUrls(attempt) {
    console.log(`  Attempt # ${attempt}:`);
    let yearString = "";
    let searchQuery = "";

    if (this.currentSearch.year) {
      let minYear = parseInt(this.currentSearch.year);
      // Narrow the Scholar date range to the 2 years following the LUBA decision
      yearString = `&as_ylo=${minYear}&as_yhi=${minYear + 2}`;
    }

    let urlComplete = false;

    // Attempts 0–2: include the LUBA court phrase for higher precision
    if (attempt < 3) {
      searchQuery += `"from the Land Use Board of Appeals" `;
    }

    // Cycle through 3 query strategies
    const round = attempt % 3;
    switch (round) {
      case 0: // Strategy: search by LUBA docket number (e.g. "LUBA 95-123" OR "LUBA95123")
        if (this.currentSearch.lubaNo) {
          let lubaAlt = this.currentSearch.lubaNo.replace(/-/, "");
          searchQuery += `("${this.currentSearch.lubaNo}" OR "${lubaAlt}")`;
          urlComplete = true;
        }
        break;
      case 1: // Strategy: search by reporter citation (e.g. "35 Or LUBA 100")
        if (this.currentSearch.reporter) {
          searchQuery += `"${this.currentSearch.reporter}"`;
          urlComplete = true;
        }
        break;
      case 2: // Strategy: search by case name / party names
        if (this.currentSearch.caseName) {
          searchQuery += `"${this.currentSearch.caseName}"`;
          urlComplete = true;
        }
        break;
      default:
        break;
    }

    return urlComplete
      ? this.searchUrl + encodeURIComponent(searchQuery) + yearString
      : null;
  }

  /**
   * Navigates a named browser tab to `url` with a short delay to avoid rate-limiting.
   * Only allows scholar.google.com URLs as a safety guard.
   * Returns true on success, false on error or blocked URL.
   */
  async #loadUrl(url, pageName) {
    if (!pageName) {
      console.log("Error: Tab name not specified");
      return false;
    }

    // Safety check: only navigate to Scholar URLs
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes("scholar.google.com")) {
        console.log(`  Skipping non-Scholar URL: ${urlObj.hostname}`);
        return false;
      }
    } catch (e) {
      console.log(`Invalid URL format: ${url.slice(0, 50)}...`);
      return false;
    }

    // Polite delay between requests to reduce the chance of being blocked
    await new Promise((resolve) => setTimeout(resolve, 750));

    console.log(`  Navigating to: https://...${url.slice(url.length - 50)}`);
    try {
      await this.page[pageName].goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return true;
    } catch (error) {
      console.error(
        `Error navigating to ${url.slice(0, 25)}... : ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Loads a Scholar search results page and extracts the href values of all case links.
   * Populates this.currentCaseList with the found href values (may be relative paths).
   *
   * BUG 1: `this.#loadUrl(searchUrl["main"])` — searchUrl is a plain string, not an
   *   object, so searchUrl["main"] is undefined. Should be `this.#loadUrl(searchUrl, "main")`.
   *
   * BUG 2: `this.page.evaluate(...)` — `this.page` is a plain object (tab map), not a
   *   Puppeteer Page. Should be `this.page["main"].evaluate(...)`.
   */
  async #getCaseList(searchUrl) {
    // BUG: should be this.#loadUrl(searchUrl, "main")
    if ((await this.#loadUrl(searchUrl["main"])) == false) {
      this.currentCaseList = [];
      return;
    }

    // Scrape all case-link href values from the Scholar results page.
    // Scholar renders case titles as <h3 class="gs_rt"><a href="...">Case Name</a></h3>
    // BUG: should be this.page["main"].evaluate(...)
    const caseSearch = await this.page.evaluate(() => {
      let caseList = [];
      const caseLinks = document.querySelectorAll("h3.gs_rt a");
      console.log(`  Found ${caseLinks.length} total links`);
      caseLinks.forEach((link) => {
        const href = link.getAttribute("href");
        if (href) {
          caseList.push(href);
        }
      });
      return caseList;
    });

    this.currentCaseList = caseSearch || [];
  }

  /**
   * Opens each link in this.currentCaseList in its own tab, scores it, and
   * collects metadata for any link that scores above 30.
   *
   * BUG 1: `let testResults = []` — immediately used as a keyed object
   *   (testResults[`metadata-${index}`] = ...). Should be `let testResults = {}`.
   *
   * BUG 2: `this.#navigateAndTest(link, this.page[\`tab-${index}\`])` passes the
   *   Puppeteer Page *object* as the second argument, but #navigateAndTest expects
   *   a string page *name* to look up in this.page[]. Should pass `\`tab-${index}\``.
   *
   * TODO: getMetaData() is a stub — see below.
   */
  async #testAllLinks() {
    // BUG: should be `let testResults = {}`
    let testResults = [];
    for (let index = 0; index < this.currentCaseList.length; index++) {
      const link = this.currentCaseList[index];
      if (!this.page[`tab-${index}`]) {
        await this.initPage(`tab-${index}`);
      }
      // BUG: should pass the name string `\`tab-${index}\`` not the page object
      let linkScore = await this.#navigateAndTest(
        link,
        this.page[`tab-${index}`],
      );
      if (linkScore > 30) {
        // Score threshold — a case needs at least 30 points to be considered a match
        testResults[`metadata-${index}`] = await this.getMetaData();
      }
    }
    if (Object.keys(testResults).length > 0) {
      return testResults;
    }
    return null;
  }

  /**
   * Navigates to a single Scholar case page and scores it against the source case.
   *
   * Scoring rubric (points are additive):
   *   +25  "from the Land Use Board of Appeals" phrase found in document
   *   +20  reporter citation found
   *   +25  LUBA docket number found (tries both hyphenated and un-hyphenated forms)
   *   +15  petitioner name found
   *   +15  respondent name found
   *   Max: 100 points; threshold for a "hit" is >30 (checked in #testAllLinks)
   *
   * Only the first ~1500 characters of the document text are searched, which
   * covers the case header but may miss citations buried deeper in the opinion.
   *
   * BUG: `this.page.evaluate(...)` on line ~301 should be `this.page[pageName].evaluate(...)`.
   * (The `pageName` argument is already passed in but not used for evaluate.)
   */
  async #navigateAndTest(caseUrl, pageName) {
    // Scholar result href attributes are often relative paths; resolve them to absolute URLs
    let url = caseUrl;
    if (caseUrl.match(/^\//)) {
      url = "https://scholar.google.com" + caseUrl;
    }
    if ((await this.#loadUrl(url, pageName)) == false) {
      return 0;
    }

    // Build the list of regex tests to run against the case page text
    const testList = [];

    // Test 1: Does the opinion mention a LUBA appeal? (+25)
    testList.push({
      name: "lubaAppeal",
      exp: "from\\sthe\\sLand\\sUse\\sBoard\\sof\\sAppeals",
      score: 25,
    });

    // Test 2: Does the reporter citation appear? (+20)
    if (this.currentSearch.reporter) {
      try {
        testList.push({
          name: "Reporter",
          exp: this.currentSearch.reporter.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          ),
          score: 20,
        });
      } catch (e) {
        console.log(`Error creating reporter regex: ${e.message}`);
      }
    }

    // Test 3: Does the LUBA docket number appear? (+25)
    if (this.currentSearch.lubaNo) {
      try {
        const lubaAlt = this.currentSearch.lubaNo.replace(/-/, "");
        const lubaPattern = `${this.currentSearch.lubaNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${lubaAlt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
        testList.push({ name: "LubaNo", exp: lubaPattern, score: 25 });
      } catch (e) {
        console.log(`Error creating LUBA number regex: ${e.message}`);
      }
    }

    // Tests 4 & 5: Do the petitioner and respondent names appear? (+15 each)
    // Splits caseName on " v. " or " v " to extract each party
    if (this.currentSearch.caseName) {
      try {
        const petitionerMatch =
          this.currentSearch.caseName.match(/[\s\S]+?(?=\sv\.?\s)/);
        if (petitionerMatch) {
          testList.push({
            name: "Petitioner",
            exp: petitionerMatch[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            score: 15,
          });
        }

        const respondentMatch =
          this.currentSearch.caseName.match(/(?<=\sv\.?\s)[\s\S]*/);
        if (respondentMatch) {
          testList.push({
            name: "Respondent",
            exp: respondentMatch[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            score: 15,
          });
        }
      } catch (e) {
        console.log(`Error creating case name regex: ${e.message}`);
      }
    }

    // Run all regex tests inside the browser against the rendered page text.
    // Scholar opinion text lives in #gs_opinion_wrapper; falls back to .gs_r or body.
    // BUG: should be this.page[pageName].evaluate(...)
    const testResults = await this.page.evaluate((testList) => {
      console.log(JSON.stringify(testList));
      let contentElement =
        document.querySelector("#gs_opinion_wrapper") ||
        document.querySelector(".gs_r") ||
        document.querySelector("body");

      if (!contentElement) {
        console.log("No content element found");
        return { passList: [], score: 0, docStart: "No content found" };
      }

      let docFullText =
        contentElement.textContent || contentElement.innerText || "";
      // Only examine the first 1500 chars (covers case header / citation block)
      let docStart = docFullText.trim().replace(/\n/, "  ").slice(0, 1500);

      let score = 0;
      let passList = [];

      testList.forEach((test) => {
        try {
          if (docStart.match(RegExp(test.exp, "i"))) {
            score += test.score;
            passList.push(test.name);
          }
        } catch (e) {
          console.log(`Error testing ${test.name}: ${e.message}`);
        }
      });

      return {
        passList,
        score,
        docStart: `${docStart.slice(0, 100)} ... ${docStart.slice(1400)}`,
      };
    }, testList);

    console.log(
      `  URL scored ${testResults.score}: ${JSON.stringify(testResults.passList)}`,
    );
    console.log(`  Document preview: ${testResults.docStart}...`);
    return testResults.score;
  }

  // ─── STUBS (not yet implemented) ─────────────────────────────────────────

  /**
   * TODO: Extract structured metadata from a confirmed Scholar case page.
   * Should probably return an object containing at minimum:
   *   - url:        the Scholar case URL
   *   - title:      opinion title / case name as shown on Scholar
   *   - court:      court name
   *   - date:       decision date
   *   - citation:   Oregon Reports or OCA citation if shown
   *   - snippet:    brief text excerpt
   *
   * Suggested Scholar selectors to explore:
   *   #gs_opinion_wrapper  — full opinion text (for full-text cases)
   *   .gs_r .gs_ri         — title, court, date in search result cards
   */
  async getMetaData() {
    return "tbd";
  }
}

// ─── UNDEFINED FUNCTIONS (must be written before the script will run) ────────

/**
 * TODO: Decide whether a set of scored case results is "good enough" to stop
 * trying further URL variants. Called from startScraping().
 *
 * @param {object} caseResults  — object keyed "metadata-0", "metadata-1", ...
 *                                each value is whatever getMetaData() returns
 * @returns {boolean} true if scraping should stop (a confident match was found)
 *
 * Suggested logic: return true if any result has a score above some threshold,
 * or if a result contains a valid Oregon appellate court citation.
 */
function evaluateResults(caseResults) {
  // TODO: implement
  throw new Error("evaluateResults() is not yet implemented");
}

/**
 * TODO: Persist the result for `keyName` to disk and store it in scrapedFile.keyMap.
 * Called from main() after each case is processed.
 *
 * @param {string} keyName  — "reporter_lubaNo" composite key
 *
 * Needs access to the GoogScholarScraper instance (currently not passed in —
 * that's a separate bug; main() calls saveResults(keyName) without the scraper).
 * Consider making this a method on GoogScholarScraper, or passing the scraper
 * and an output file path as arguments.
 *
 * Suggested behavior:
 *   1. Store scrapedFile.currentResult in scrapedFile.keyMap under keyName
 *   2. Append / write results to an output JSON file
 */
function saveResults(keyName) {
  // TODO: implement
  throw new Error("saveResults() is not yet implemented");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Reads the input JSON, creates a scraper, and iterates all LUBA cases.
 *
 * NOTE: saveResults(keyName) is called without the scraper instance, so it
 * currently has no way to access this.currentResult. This call signature
 * needs to be fixed when saveResults() is implemented.
 */
const main = async () => {
  const searchList = await convertToSearches(fileName);
  const scrapedFile = new GoogScholarScraper();
  await scrapedFile.initBrowser();
  await scrapedFile.initPage("main");
  for (const search of searchList) {
    const keyName = `${search.reporter}_${search.lubaNo}`;
    if (scrapedFile.keyCheck(keyName)) {
      console.log(
        `\nScraping: ${search.caseName} ${search.reporter} (${search.year}); LUBA No. ${search.lubaNo}.`,
      );
      await scrapedFile.startScraping(search);
    }
    // BUG: saveResults needs access to scrapedFile.currentResult but doesn't receive it
    saveResults(keyName);
  }
  scrapedFile.closeBrowser();
};

/**
 * Reads the input JSON file and maps each entry into a normalized search object.
 * Only includes entries that have both a luba_no and a reporter (minimum viable search).
 *
 * Expected input shape per entry:
 *   { luba_no, year, case_name, reporter }
 */
const convertToSearches = async (file) => {
  let searchList = [];
  const jsonList = JSON.parse(fs.readFileSync(file, "utf8"));
  jsonList.forEach((entry) => {
    if (entry.luba_no && entry.reporter) {
      searchList.push({
        lubaNo: entry.luba_no,
        year: entry.year,
        caseName: entry.case_name,
        reporter: entry.reporter,
      });
    }
  });
  return searchList;
};

main();
