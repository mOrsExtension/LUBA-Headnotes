# About these files

## luba_docx_parser.py
Takes the LUBA headnotes pdf (https://www.oregon.gov/luba/Pages/Headnotes.aspx), after being exported into Word file and parses it into headnotes JSON file

## luba_scraper.js
Crawls LUBA final opinions https://www.oregon.gov/luba/Pages/Final-Opinions.aspx and orders and turns data into opinions JSON file

## jsonFilter.js
Quick utility to take a json file and filter out data as qualified (used to get rid of opinions JSON that couldn't be helpful)

## headnotes_opinion_combiner.js
Takes the headnotes JSON and combines it with the opinions JSON; result is what gets converted into luba.db file in main folder

## HeadnotesList.csv
Just a list of headnotes by name and number

## HeadnoteCsvToHTML.js
Takes the lists of headnotes and turns it into html to paste into the datasette frontend
