# LUBA Headnotes
 
Hosted publicly at https://luba-headnotes.fly.dev/

To run locally:
This guide will help you run the LUBA Headnotes database on your own computer, even if you're not very technical.

## What You'll Need
- A Windows, Mac, or Linux computer
- About 10-20 minutes
- Administrator access (ability to install software - may need to use personal computer)
---

## Step 1: Install Python

### Windows/Mac
1. Go to https://www.python.org/downloads/
2. Click the yellow "Download Python" button
3. Follow the installation steps
4. **IMPORTANT**: Windows - Check the box "Add Python to PATH" at the bottom
5. Windows - When done, restart your computer

### Linux (Ubuntu/Debian)
```bash
sudo apt update
sudo apt install python3 python3-pip
```

---

## Step 2: Test Python Installation

### Windows
1. Open Command Prompt (Press Windows key + R ; type `cmd` and Enter)
2. Type: `python --version`
3. You should see something like "Python 3.x.x"

### Mac/Linux
1. Open Terminal
2. Type: `python3 --version`
3. You should see something like "Python 3.x.x"

**If this doesn't work, restart your computer and try again.**

---

## Step 3: Download the Project Files from GitHub

1. Go to the GitHub page - https://github.com/mOrsExtension/LUBA-Headnotes/
2. Click the green "Code" button
3. Click "Download ZIP"
4. Extract the ZIP file to your Desktop (or other folder)

---

## Step 4: Install Datasette

1. Open Command Prompt (Windows) or Terminal (Mac/Linux)
2. Type this command and press Enter:

**Windows:**
```cmd
pip install datasette
```

**Mac/Linux:**
```bash
pip3 install datasette
```

Wait for it to finish installing (might take a few minutes).

---

## Step 5: Navigate to Your Project Folder

1. In the command prompt/terminal window, go to where your project files are
2. If they're on your Desktop in a folder called "luba-headnotes":

**Windows:**
```cmd
cd Desktop\luba-headnotes
```

**Mac:**
```bash
cd ~/Desktop/luba-headnotes
```

**Linux:**
```bash
cd ~/Desktop/luba-headnotes
```
Otherwise navigate to directory, e.g:
`cd 'C:\my folder\luba-headnotes'`

3. Verify you're in the right place by typing:
   - `dir` (Windows) or `ls` (Mac/Linux)
   - You should see `luba.db`, `templates`, and `static` listed

---

## Step 6: Start the Database

Type this command and press Enter:

```bash
datasette serve luba.db --template-dir templates --static static:static
```

You should see something like:
```
INFO:     Uvicorn running on http://127.0.0.1:8001
```

---

## Step 7: Open the Database in Your Browser

1. Open your web browser
2. Go to: `http://localhost:8001`
3. You should see the LUBA Headnotes Database looking like the online version (or with more recent changes).

## Stopping the Database

When you're done:
1. Go back to your command window
2. Press `Ctrl+C` (Windows/Linux) or `Cmd+C` (Mac)
3. The database will stop running

---

## Starting It Again Later

1. Open Command Prompt or Terminal
2. Repeat steps 5 to 7.

# Issues:
Email `mors.extension@gmail.com`
