const puppeteer = require("puppeteer");
const fs = require("fs");

const main = async () => {
  const searchList = await convertToSearches("notes_opinions_sample.json");
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
    saveResults(keyName);
  }
  scrapedFile.closeBrowser();
};

class GoogScholarScraper {
  constructor() {
    this.browser = null;
    this.page = {};
    this.searchUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=4,38&q=`;
    this.keyMap = new Map();
    this.currentResult = {};
  }

  async initBrowser() {
    this.browser = await puppeteer.launch({
      headless: false, // Less likely for site to block
      devtools: false,
    });
  }

  /** Creates a new browser page in this.page[xxx] */
  async initPage(pageName) {
    this.page[pageName] = await this.browser.newPage();

    // Listen for browser console messages (for debugging)
    this.page[pageName].on("console", (msg) => {
      console.log(`Browser/${pageName} : ${msg.text()}`);
    });

    // Set user agent to avoid bot detection
    await this.page[pageName].setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    );

    // Set viewport
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

  /** tells whether key already exists in map & replaces with mapped value */
  keyCheck(keyName) {
    if (this.keyMap.has(keyName)) {
      this.currentResult = this.keyMap.get(keyName);
      return false;
    }
    return true;
  }

  async startScraping(searchItem) {
    this.currentSearch = searchItem;

    for (let index = 0; index < 6; index++) {
      let urlAttempt = this.#buildUrls(index);
      if (urlAttempt) {
        await this.#getCaseList(urlAttempt);

        // Only proceed if we found cases to test
        if (this.currentCaseList && this.currentCaseList.length > 0) {
          // but not too many
          if (this.currentCaseList.length < 6) {
            let caseResults = await this.#testAllLinks();
            if (caseResults && Object.keys(caseResults).length > 0) {
              console.log(`Test results: ${JSON.stringify(caseResults)}`);
              if (evaluateResults(caseResults)) {
                // Found good results, can break early
                break;
              }
            }
          } else {
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
    let message2 = "No subsequent appellate history found.";
    this.currentResult.msg = [...(this.currentResult.msg || []), message2];
  }

  #buildUrls(attempt) {
    console.log(`  Attempt # ${attempt}:`);
    let yearString = "";
    let searchQuery = "";
    if (this.currentSearch.year) {
      let minYear = parseInt(this.currentSearch.year);
      yearString = `&as_ylo=${minYear}&as_yhi=${minYear + 2}`;
    }
    let urlComplete = false;
    if (attempt < 3) {
      searchQuery += `"from the Land Use Board of Appeals" `;
    }
    const round = attempt % 3;
    switch (round) {
      case 0: // by LUBA no
        if (this.currentSearch.lubaNo) {
          let lubaAlt = this.currentSearch.lubaNo.replace(/-/, "");
          searchQuery += `("${this.currentSearch.lubaNo}" OR "${lubaAlt}")`;
          urlComplete = true;
        }
        break;
      case 1: // by
        if (this.currentSearch.reporter) {
          searchQuery += `"${this.currentSearch.reporter}"`;
          urlComplete = true;
        }
        break;
      case 2: // by parties
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

  async #loadUrl(url, pageName) {
    if (!pageName) {
      console.log("Error: Tab name not specified");
      return false;
    }

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

    await new Promise((resolve) => setTimeout(resolve, 750)); // wait a second so we're not spamming requests

    console.log(`  Navigating to: https://...${url.slice(url.length - 50)}`);
    try {
      await this.page[pageName].goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Wait a bit for page to fully load
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return true;
    } catch (error) {
      console.error(
        `Error navigating to ${url.slice(0, 25)}... : ${error.message}`,
      );
      return false;
    }
  }

  async #getCaseList(searchUrl) {
    if ((await this.#loadUrl(searchUrl["main"])) == false) {
      this.currentCaseList = [];
      return;
    }

    // Extract cases links
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

  async #testAllLinks() {
    let testResults = [];
    for (let index = 0; index < this.currentCaseList.length; index++) {
      const link = this.currentCaseList[index];
      if (!this.page[`tab-${index}`]) {
        await this.initPage(`tab-${index}`);
      }
      let linkScore = await this.#navigateAndTest(
        link,
        this.page[`tab-${index}`],
      );
      if (linkScore > 30) {
        testResults[`metadata-${index}`] = await this.getMetaData();
      }
    }
    if (Object.keys(testResults).length > 0) {
      return testResults;
    }
    return null;
  }

  async #navigateAndTest(caseUrl, pageName) {
    let url = caseUrl;
    if (caseUrl.match(/^\//)) {
      url = "https://scholar.google.com" + caseUrl;
    }
    if ((await this.#loadUrl(url, pageName)) == false) {
      return 0;
    }
    let score = 0;
    let passList = [];

    // Build test list with proper error handling
    const testList = [];

    // Always test for LUBA appeal
    testList.push({
      name: "lubaAppeal",
      exp: "from\\sthe\\sLand\\sUse\\sBoard\\sof\\sAppeals",
      score: 25,
    });

    // Test for reporter if available
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

    // Test for LUBA number if available
    if (this.currentSearch.lubaNo) {
      try {
        const lubaAlt = this.currentSearch.lubaNo.replace(/-/, "");
        const lubaPattern = `${this.currentSearch.lubaNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${lubaAlt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
        testList.push({ name: "LubaNo", exp: lubaPattern, score: 25 });
      } catch (e) {
        console.log(`Error creating LUBA number regex: ${e.message}`);
      }
    }

    // Test for case name parties if available
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

    const testResults = await this.page.evaluate((testList) => {
      console.log(JSON.stringify(testList));
      // Try multiple selectors for the document content
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

  async getMetaData() {
    return "tbd";
  }
}

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
