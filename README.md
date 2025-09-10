# LUBA Headnotes: Project Overview

Oregon's Land Use Board of Appeals Headnotes, converted into a database and then made pretty and accessible with help from [Datasette](https://datasette.io/)
  * For demo purposes only, not suitable for legal research
  * Available AS IS; MIT License
  * Not sponsored by or affiliated with the Land Use Board of Appeals

## Available online
Hosted publicly at `https [colon, slash, slash] luba [hyphen] headnotes [dot] fly [dot] dev`
  * Limited demo hosted by [fly.io](https://fly.io)
  * May take down or move later, especially if it gets too much traffic & data costs

## Files and Folders
### /static
* Javascript ran by the website (client side)
  * add_formatting.js - adds italics & bold to opinion summaries
  * add_links.js - Add hyperlinks creating new SQL queries
  * sql_examples - Adds example SQL files
* CSS (website styles)

### /templates
 * webpage front end to make display of datasette data cleaner
   * database.html, query.html, & table.html (various datasette views)
   * base.html - common info for all pages above
   * headnote_display.html - renders either query results or displays headnotes
   * headnote_list.html - just a clickable list with all the headnotes

### /temp_utilities
 * Various scripts written to scrape and combine LUBA data into luba.db
 * More data about files in folder and in file documentation

### luba.db
 * Finished product generated from converting JSON to SQL with SQlite
 * Datasette uses template & static to display/search database
 * Source data comes from:
   * [LUBA Headnotes](https://www.oregon.gov/luba/pages/headnotes.aspx) (giant PDF)
   * [LUBA Opinions](https://www.oregon.gov/luba/Pages/Final-Opinions.aspx) (just the html & links, not the actual opinions)
   * [LUBA Orders](https://www.oregon.gov/luba/Pages/Published-Orders.aspx) (ditto)

# Local Installation
To run locally (even if you're not very technical):

## What You'll Need
- A Computer running Windows (Mac or Linux probably work, but I don't want to try)
- About 10-20 minutes
- Administrator access (ability to install software - may need to use personal computer)
---

## Step 1: Install Python
1. Go to https://www.python.org/downloads/
2. Click the yellow "Download Python" button
3. Follow the installation steps
4. **IMPORTANT**: Check the box "Add Python to PATH" at the bottom
5. When done, restart your computer

---

## Step 2: Test Python Installation
1. Open Command Prompt (Press `Windows Key + R` ; type `cmd` and Enter)
2. Type: `python --version`
3. You should see something like "Python 3.x.x"

**If this doesn't work, restart your computer and try again.**

---

## Step 3: Download the Project Files from GitHub

1. Go to the GitHub page - https://github.com/mOrsExtension/LUBA-Headnotes/
2. Click the green "Code" button
3. Click "Download ZIP"
4. Extract the ZIP file to your Desktop, Downloads or other folder

---

## Step 4: Install Datasette

1. Open Command Prompt (`WIN + R`, `cmd`)
2. Type `pip install datasette` and press Enter:
3. Wait for it to finish installing (might take a few minutes).

---

## Step 5: Navigate to Your Project Folder

1. In the command prompt/terminal window, go to where your project files are

Assuming they're on your Desktop in a folder called "luba-headnotes":
```cmd
cd Desktop\luba-headnotes
```
Otherwise navigate to directory, e.g:
`cd 'C:\my folder\luba-headnotes'`

2. Verify you're in the right place by typing`dir`
   - You should see `luba.db`, `templates`, and `static` listed
   - `temp_utlities` folder can be deleted, unless you want to try to create luba.db from scratch

---

## Step 6: Start the Database

Type this command and press Enter:

```bash
datasette serve luba.db --template-dir templates --static static:static
```

You should see something like:
```
INFO:     Uvicorn running on http://127.0.0.1:8001
...
```

---

## Step 7: Open the Database in Your Browser

1. Open your web browser
2. Go to: `http://localhost:8001`
3. You should see the LUBA Headnotes Database looking like the online version (or with more recent changes).

## Stopping the Database

When you're done:
1. Go back to your command window
2. Press `Ctrl+C`
3. The database will stop running

---

## Starting It Again Later

1. Open Command Prompt (`WIN + R`, `cmd`)
2. Repeat steps 5 to 7.

# Issues:
Email `mors.extension@gmail.com`
