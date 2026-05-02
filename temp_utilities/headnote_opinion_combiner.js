const fs = require("node:fs").promises;
// attempts to match headnote JSON with opinionFiles (opinions & orders) based on reporter, then years + reporter page, finally years + case_name

// *** CONFIG ***
const headnotesFile = "./temp_utilities/LUBA_headnotes_2026-04-22--16-41.json";
const opinionsFile = "./luba_opinions_orders_2026-04-30_1147.json";
const outputFileName = "luba_headnotes_matched"; // will save as json
// *************

class LUBADataJoiner {
  constructor(headnotesFile, opinionsFile) {
    this.headnotesFile = headnotesFile;
    this.opinionsFile = opinionsFile;
    /**  headnotes : {index, headnote, topic, summary, case_name, reporter (or LUBA No), year ... warnings} */ this.headnotes =
      [];
    /** opinions : {index, case_name, year, month, reporter (or LUBA No) , luba_no, url, source_type, warnings} */ this.opinions =
      [];
    this.results = {
      headnotes: [],
      unmatched_headnotes: [],
      unmatched_opinions: [],
    };
    this.validationErrors = {
      headnotes: [],
      opinions: [],
    };
  }

  async loadData() {
    console.log("Loading data files ...");

    try {
      this.headnotes = JSON.parse(
        await fs.readFile(this.headnotesFile, "utf8"),
      );
      console.log(`  Loaded ${this.headnotes.length} headnotes`);
    } catch (error) {
      console.error(`Error loading headnotes: ${error.message}`);
      return false;
    }

    try {
      this.opinions = JSON.parse(await fs.readFile(this.opinionsFile, "utf8"));
      console.log(`  Loaded ${this.opinions.length} opinions`);
    } catch (error) {
      console.error(`Error loading opinions: ${error.message}`);
      return false;
    }

    return true;
  }

  /**  Extract LUBA volume and page from reporter field (either (Vol Or LUBA page) or Luba No (yy-102) and month */
  #parseReporter(reporter) {
    if (!reporter) return null;

    // Match pattern: "VV Or LUBA PPP"
    const reporterMatch = reporter.match(/(\d{1,2})\s+Or\s+LUBA\s+(\d{1,4})/i);
    if (reporterMatch) {
      return {
        page: parseInt(reporterMatch[2]),
        volume: parseInt(reporterMatch[1]),
      };
    }
    // Match pattern for cases without reporter (usually > 2020): "YYYY-### (MMM ?, YYYY)"
    const lubaNoPattern = /(\d{2,4}-\d{3}).*\s*\((\D{3,4})\s.{1,2},\s(\d{4})\)/;
    const lubaNoMatch = reporter.match(lubaNoPattern);
    if (lubaNoMatch) {
      //console.log(`LUBA${lubaNoMatch[1]}_${lubaNoMatch[2]}-${lubaNoMatch[3]}`);
      return {
        // not actually a volume & page, but data will be used for matching
        page: lubaNoMatch[1], // Luba No YYYY-###
        volume: `${lubaNoMatch[2]}-${lubaNoMatch[3]}`, // Case Month & Year
      };
    }
    return null;
  }

  /** strip case name to common factors to simplify matching/validation */
  #normalize(aCaseName) {
    /** removing punctuation in case names */
    let cleanCase = aCaseName.replace(/[,.’"'~?/\\&%^$#@!*\(\)\[\])]/g, "");
    cleanCase = cleanCase.replace(/(\s+|-)/g, " ");
    cleanCase = cleanCase.toLowerCase();
    /** removing terminology that often gets dropped in one version or another */
    cleanCase = cleanCase.replace(
      /(inc\b|llc|lp\b|\bof\b|\bet\sal\b|et\sseq|etc|city\sof|county|\bin\sre|estate|homeowners|assoc.*?\b|\bassn\b|coalitions?|hoa|assoc|compan.*?\b|\bco\b|corp.*?\b|\bcorp\b|dist.*?\b|oregon|depart.*?|dept|divisions?|\bdiv\b|condominiums?|condos?|conservation|\bcons\b|neigh.*?\b|politan\b|league|service|comm.*?\b|\borg.*?\b|\bthe\b|\band\b|management|mgmt|\bltd\b|limited|dev.*?\b)/gi,
      "",
    );
    cleanCase = cleanCase.replace(/\s+/g, " ");
    return cleanCase.trim();
  }

  /** validates whether case names match based on first 5 words, returns string err if no */
  #chkCaseMatch(headName, opinionName) {
    const headClean = this.#normalize(headName);
    const opinionClean = this.#normalize(opinionName);

    if (headClean !== opinionClean) {
      const headTrim = headClean.split(" ").slice(0, 4).join(" ");
      const opinionTrim = opinionClean.split(" ").slice(0, 4).join(" ");

      if (headTrim !== opinionTrim) {
        return `Names differ between headnote '${headClean}' & case: ${opinionClean}`;
      }
    }
    return;
  }

  /** puts opinion into array, adds existing and flags warnings for duplicates */
  #handleDuplicate(existing, anOpinion, key, errorMsg) {
    const value = [anOpinion];
    let error = "";
    if (existing) {
      value.push(...existing.key);
      const opinionList = value
        .map((aKey) => {
          return `\n  > ${aKey.case_name}, ${aKey.reporter} (${aKey.year})`;
        })
        .join("");
      error = `${errorMsg} key '${key}' contains ${value.length} entries: ${opinionList}`;
    }
    return { value: value, error: error };
  }

  #logOpinionError(err) {
    console.log(err);
    this.validationErrors.opinions.push(err);
  }

  /**  Create lookup maps for efficient joining */
  createLookupMaps() {
    console.log("Creating lookup maps for opinions/orders...");

    this.opinionMaps = {
      byPageAndVolume: new Map(), // page number + volume (most reliable)
      byPageAndYear: new Map(), // page number + year (good enough, pre 2020 reported cases)
      byYearAndCaseName: new Map(), // case name (for backup / validation only?)
    };

    this.opinions.forEach((anOpinion) => {
      const opinionReporter = this.#parseReporter(anOpinion.reporter);
      const keys = {};
      /** Creating map by page number + volume (primary matching strategy)  */
      if (opinionReporter) {
        keys.pageVol = `${opinionReporter.page}_${opinionReporter.volume}`; // making an array to handle duplicates
        const { value: pkVal, error: pkError } = this.#handleDuplicate(
          this.opinionMaps.byPageAndVolume.get(keys.pageVol),
          anOpinion,
          keys.pageVol,
          "Reporter",
        );
        this.opinionMaps.byPageAndVolume.set(keys.pageVol, {
          key: pkVal,
          error: pkError,
        });

        /** Creating map by page number and year (backup) */
        keys.pageYear = `${opinionReporter.page}_${anOpinion.year}`;
        const { value: pyVal, error: pvError } = this.#handleDuplicate(
          this.opinionMaps.byPageAndYear.get(keys.pageYear),
          anOpinion,
          keys.pageYear,
          "Page + year",
        );
        this.opinionMaps.byPageAndYear.set(keys.pageYear, {
          key: pyVal,
          error: pvError,
        });
      } else {
        this.#logOpinionError(
          `No page_vol or page_Year key created for ${anOpinion.case_name} (${anOpinion.year})`,
        );
      }

      /** Creating map by case name (for validation warnings?) */
      if (anOpinion.case_name) {
        const normalizedName = this.#normalize(anOpinion.case_name);
        const year =
          opinionReporter && opinionReporter.volume.length > 4
            ? opinionReporter.volume
            : anOpinion.year;
        keys.yearCase = `${year}_${normalizedName}`;
        const { value: ycVal, error } = this.#handleDuplicate(
          this.opinionMaps.byYearAndCaseName.get(keys.yearCase),
          anOpinion,
          keys.yearCase,
          "Year + case",
        );
        this.opinionMaps.byYearAndCaseName.set(keys.yearCase, {
          key: ycVal,
          error: error,
        });
      } else {
        this.#logOpinionError(
          `No year_case key created for ${year} ${anOpinion.reporter} (${anOpinion.year})`,
        );
      }
    });

    console.log(
      `  Created opinion page/volume maps: ${this.opinionMaps.byPageAndVolume.size} unique keys`,
    );
    console.log(
      `  Created opinion page/year maps: ${this.opinionMaps.byPageAndYear.size} unique keys`,
    );
    console.log(
      `  Created opinion year/case name maps for: ${this.opinionMaps.byYearAndCaseName.size} unique keys`,
    );
  }

  #addOpinionWarningsToHeadnotes(matchKeyList) {
    const warnings = [];
    matchKeyList.forEach((aMatch, index) => {
      if (aMatch.warnings.length) {
        aMatch.warnings.forEach((aWarning) => {
          if ((index = 0)) {
            warnings.push(`Warning in matched case: ${aWarning}`);
          } else {
            warnings.push(`Warning in alternate matched case: ${aWarning}`);
          }
        });
      }
    });
    return warnings;
  }

  /** Try to match a headnote to an opinion */
  #findMatchingOpinion(headnote) {
    // Only match headnotes that have valid LUBA reporters (or LUBA Nos > 2020)
    const headnoteReporter = this.#parseReporter(headnote.reporter);
    let /** {matchMethod, match, warnings} */ aMatch;
    if (headnoteReporter) {
      aMatch = this.#matchByPageVol(
        `${headnoteReporter.page}_${headnoteReporter.volume}`,
        headnote,
      );
      if (!aMatch) {
        aMatch = this.#matchByPageYear(
          `${headnoteReporter.page}_${headnoteReporter.volume}`,
          headnote,
        );
      }
    }
    if (!aMatch) {
      const hnCaseName = this.#normalize(headnote.case_name);
      const year =
        headnoteReporter && headnoteReporter.volume.length > 3
          ? headnoteReporter.volume
          : headnote.year;
      aMatch = this.#matchByYearCaseName(`${year}_${hnCaseName}`, headnote);
    }
    return aMatch;
  }
  /**  Primary strategy: Match by page number + volume:
   * returns {matchMethod, match (opinion index), and warnings} */
  #matchByPageVol(pvKey, headnote) {
    const match = this.opinionMaps.byPageAndVolume.get(pvKey);
    if (!match) {
      return;
    }
    const result = {};
    result.warnings = [];
    if (match.error) {
      result.warnings.push(match.error); // this is a single string
      this.validationErrors.headnotes.push({
        ...headnote,
        type: "duplicate opinions",
        details: match.error,
      });
    }

    result.matchMethod = "page_vol";
    const matchedOpinion = match.key[0]; // taking the first in list, no matter how many. Maybe add tiebreakers here (somehow)??
    result.match = matchedOpinion.index;

    // Data validations
    // 1. Add warnings in opinion(s) to HN:
    const opinionWarnings = this.#addOpinionWarningsToHeadnotes(match.key);
    if (opinionWarnings.length) {
      result.warnings.push(...opinionWarnings);
    }

    // 2. Check for year discrepancies
    const opinionYear = matchedOpinion.year;
    if (opinionYear && opinionYear !== headnote.year) {
      const mismatch = `Year mismatch--headnote: '${headnote.year}' vs opinion: '${opinionYear}'`;
      result.warnings.push(mismatch);
      this.validationErrors.headnotes.push({
        ...headnote,
        type: "year mismatch",
        details: mismatch,
      });
    }

    // 3. Check case name similarity for validation
    if (headnote.case_name && matchedOpinion.case_name) {
      const mismatch = this.#chkCaseMatch(
        headnote.case_name,
        matchedOpinion.case_name,
      );
      if (mismatch) {
        result.warnings.push(mismatch);
        this.validationErrors.headnotes.push({
          ...headnote,
          type: "name mismatch",
          details: mismatch,
        });
      }
    }

    return result;
  }

  /**  Secondary strategy: Match by page number + year:
   * returns {matchMethod, match (opinion index), and warnings} */
  #matchByPageYear(pyKey, headnote) {
    const match = this.opinionMaps.byPageAndYear.get(pyKey);
    if (!match) {
      return;
    }
    const result = {};
    result.warning = [];
    if (match.error) {
      result.warnings.push(match.error);
      this.validationErrors.headnotes.push({
        ...headnote,
        type: "year mismatch",
        details: mismatch,
      });
    }
    result.matchMethod = "page_year";
    const matchedOpinion = match.key[0]; // taking the first in list, no matter how many. Maybe add tiebreakers here (somehow)??
    result.match = matchedOpinion.index;

    //Data validation
    // 1. Add warnings in matching opinion(s) to HN:
    const opinionWarnings = this.#addOpinionWarningsToHeadnotes(match.key);
    if (opinionWarnings.length) {
      result.warnings.push(...opinionWarnings);
    }
    // 2. Clearly volumes don't match, or we wouldn't be here
    {
      const mismatch = `Volume mismatch--headnote: ${headnote.volume} vs opinion: ${matchedOpinion.volume}`;
      result.warnings.push(mismatch);
      this.validationErrors.headnotes.push({
        ...headnote,
        type: "volume mismatch",
        details: mismatch,
      });
    }
    // 3. Check case name similarity for validation
    if (headnote.case_name && matchedOpinion.case_name) {
      const mismatch = this.#chkCaseMatch(
        headnote.case_name,
        matchedOpinion.case_name,
      );
      if (mismatch) {
        result.warnings.push(mismatch);
        this.validationErrors.headnotes.push({
          ...headnote,
          type: "name mismatch",
          details: mismatch,
        });
      }
    }
  }

  /** Last option. cases with same case name & year */
  #matchByYearCaseName(ycKey, headnote) {
    const result = {};
    result.warnings = [
      `No matches by reporter page/vol or page/year: ${headnote.reporter} (${headnote.year})`,
    ];
    const match = this.opinionMaps.byYearAndCaseName.get(ycKey);
    if (!match) {
      const noCase = `And no cases named '${headnote.case_name}' in ${headnote.year}; unmatched!`;
      result.warnings.push(noCase);
      this.validationErrors.headnotes.push({ ...headnote });
      return {
        match: null,
        matchMethod: "unmatched",
        warnings: result.warnings,
      };
    }
    if (match.error) {
      // will be a string
      result.warnings.push(match.error);
      this.validationErrors.headnotes.push({
        ...headnote,
        type: "duplicate opinions",
        details: match.error,
      });
    }
    const matchedOpinion = match.key[0];
    result.matchMethod = "year_case";
    result.match = matchedOpinion.index;

    // validate data
    // 1. Add warnings in opinion(s) to HN:
    const opinionWarnings = this.#addOpinionWarningsToHeadnotes(match.key);
    if (opinionWarnings.length) {
      result.warnings.push(...opinionWarnings);
    }
    // 2. Explain result of unique year/case match
    if (match.key.length == 1) {
      result.warnings.push(
        `Unique case name match in ${matchedOpinion.year}: ${matchedOpinion.case_name}, ${matchedOpinion.reporter}`,
      );
    }
    return result;
  }

  // Perform the join operation
  performJoin() {
    console.log("Performing join operations...");

    const usedOpinionIds = new Set();

    this.headnotes.forEach((headnote) => {
      const { match, matchMethod, warnings } =
        this.#findMatchingOpinion(headnote);

      const finalRecord = {
        // Headnote data
        ...headnote,
        opinion_ID: match,
        opinion_matched_by: matchMethod,
      };
      finalRecord.warnings = [...headnote.warnings, ...warnings]; // replace warnings to include recent additions

      this.results.headnotes.push(finalRecord);

      if (match) {
        usedOpinionIds.add(match);
      } else {
        // Unmatched headnote
        this.results.unmatched_headnotes.push({
          headnote_id: headnote.index || index,
          case_name: headnote.case_name,
          reporter: headnote.reporter,
          year: headnote.year,
          warnings: warnings,
        });
      }
    });

    // Find unmatched opinions (Exclude LUBA's < 2020 unpublished in reporter)
    this.opinions.forEach((opinion) => {
      if (
        !usedOpinionIds.has(opinion.index) &&
        opinion.reporter !== "Unpublished"
      ) {
        this.results.unmatched_opinions.push({
          case_name: opinion.case_name,
          year: opinion.year,
          reporter: opinion.reporter,
          luba_no: opinion.luba_no,
          reason: "No matching headnote found",
        });
      }
    });
    console.log("\nJoin Results:");
    console.log(`  Matched: ${this.results.headnotes.length}`);
    console.log(
      `  Unmatched headnotes: ${this.results.unmatched_headnotes.length}`,
    );
    console.log(
      `  Unmatched published opinions: ${this.results.unmatched_opinions.length}`,
    );
  }

  // get date & time
  #getDateAndTime() {
    const tNow = new Date();
    const tDate = tNow.toISOString().split("T")[0];
    const tTime = `${tNow.getHours().toString().padStart(2, "0")}${tNow.getMinutes().toString().padStart(2, "0")}`;
    return `${tDate}_${tTime}`;
  }

  // Save Headnotes:
  async saveToFile(saveAs) {
    const fileName = `${saveAs}_${this.#getDateAndTime()}`;
    console.log(`\nSaving headnotes joined to opinions to ${fileName}...`);

    const jsonOutput = JSON.stringify(this.results.headnotes, null, 2);
    await fs.writeFile(`${fileName}.json`, jsonOutput, "utf-8");

    console.log(`Successfully saved data to ${fileName}.json...`);
    console.log("Creating validation reports...");

    // Summary report
    const summary = {
      total_headnotes: this.headnotes.length,
      total_opinions: this.opinions.length,
      matches: this.headnotes.length - this.results.unmatched_headnotes.length,
      unmatched_headnotes: this.results.unmatched_headnotes.length,
      unmatched_opinions: this.results.unmatched_opinions.length,
    };

    await Promise.all([
      fs.writeFile(
        `${fileName}_summary.json`,
        JSON.stringify(summary, null, 2),
        () => {
          console.log("summarized");
        },
      ),
      fs.writeFile(
        `${fileName}_headnotes_err.json`,
        JSON.stringify(this.validationErrors.headnotes, null, 2),
      ),
      fs.writeFile(
        `${fileName}_opinions_err.json`,
        JSON.stringify(this.validationErrors.opinions, null, 2),
      ),
      fs.writeFile(
        `${fileName}_unmatched_headnotes.json`,
        JSON.stringify(this.results.unmatched_headnotes, null, 2),
      ),
      fs.writeFile(
        `${fileName}_unmatched_opinions.json`,
        JSON.stringify(this.results.unmatched_opinions, null, 2),
      ),
    ]);

    console.log(`  Reports generated`);
  }
}

// Main Body
async function main() {
  const joiner = new LUBADataJoiner(headnotesFile, opinionsFile);
  if (!(await joiner.loadData())) {
    console.error("Failed to load data files");
    return;
  }
  joiner.createLookupMaps();
  joiner.performJoin();
  await joiner.saveToFile(`${outputFileName}`);
  console.log("\n *** Finished!");
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = LUBADataJoiner;
