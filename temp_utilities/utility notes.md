# About these files

## build_db_compare.py

Work in progress (4/16/26): Trying to figure out a way to test old data against newly updated (4/15/26) data from LUBA - creates "compare_output.csv"

## fixHeadnotes-WordVBA.vba

(Depreciated - needed to clean up early version of Word Headnote Data in wordVBA - hopefully won't need again)

## googleScholarScraper.js

Work in progress (4/16/26): plan is to try to automate search for subsequent history at Oregon Court of Appeals and include links

## headnotes_opinion_combiner.js

Takes the headnotes JSON and combines it with the opinions JSON; result gets converted into luba.db file in main folder

## headnotesCsvToHtml.js

Turns csv document full of headnotes into html that can be used for HN selection in Datasette web app front end (uses HeadnotesList.csv)

## HeadnotesList.csv

Just a list of headnotes by name and number

## jsonFilter.js

Quick utility to take a json file and filter out data as qualified (used to get rid of opinions JSON that couldn't be helpful)

## luba_docx_parser.py

Takes the giant LUBA headnotes pdf <https://www.oregon.gov/luba/Pages/Headnotes.aspx>, having first been exported into Word file, and parses it into headnotes JSON file used to create DB

## luba_scraper.js

Crawls LUBA final opinions <https://www.oregon.gov/luba/Pages/Final-Opinions.aspx> and orders and turns data into opinions JSON file

## split_word_doc_by_headnote.py

Takes Word document filled with headnotes and splits it into new document for each unique headnote

## zip_headnote_splits_to_word.py

Takes collection of Word documents and zips them up into a single combined wordDoc in natural order (opposite of split_word_doc_by_headnote)
