import sqlite3, json, time, csv, re
from difflib import SequenceMatcher

# CONFIG ********
lubaDB = "../../luba.db"
newJson = "./LUBA_headnotes_2026-03-19--10-03.json"
createOutput = "compare_output.csv"
# ********

def print_it(myText):
    print (str(time.time()) + " " + myText)

def clean(old):
    rSpaces = r"(\s|\t|\n|\r|[\s\xa0])+"
    return re.sub(rSpaces, ' ', old).strip()

def calcRatio(old, new):
    return SequenceMatcher(None, old, new).ratio

with open(newJson, 'r' , encoding='utf-8') as f:
  new_data = json.load(f)

conn = sqlite3.connect(lubaDB)
print(conn.execute("SELECT summary FROM published_headnotes_old LIMIT 1").fetchone())

# cleans up old data created by earlier iterations of this program
conn.execute("DROP TABLE IF EXISTS compareTable")
conn.execute("DROP VIEW IF EXISTS myDATA")
conn.execute("DROP VIEW IF EXISTS compare")

# creates new view of old data (included HN, Topic, summary, case name, reporter and "warnings" (array))

conn.execute(
  """CREATE VIEW myDATA AS
    SELECT h.headnote_number AS myHeadnote,
      trim(t.topic) as myTopic,
      trim(replace(replaceh.summary as mySummary,
      o.case_name as myCaseName,
      o.reporter as myCitation,
      w.message as warning
    FROM published_headnotes_old AS h
    LEFT JOIN opinions AS o
    ON h.opinion_id = o.id
    LEFT JOIN headnote_topics as t
    ON h.headnote_number = t.number
    LEFT JOIN warnings as w
    ON h.warning_id = w.id
    """
    )

print_it("importing new data into table...")

conn.execute(
  """CREATE TEMP TABLE newDATA
  (headnote, topic, summary, case_name, citation, year, index_key)""")
conn.executemany(
    """INSERT INTO newDATA VALUES
    (:headnote, :topic, :summary, :case_name, :citation, :year, :index_key)""",
    [{
        **r,
        'index_key': r.get('index'),
        'topic': clean(r.get('topic')),
        'summary': clean(r.get('summary')),
        'case_name': clean(r.get('case_name')),
        'citation': clean(r.get('citation'))
    } for r in new_data]
)

print_it("comparing old and new data ...")

conn.execute("""CREATE TABLE compareTable AS
    SELECT n.index_key, n.headnote, n.citation, n.topic, m.myTopic,
           n.summary, m.mySummary, n.case_name, m.myCaseName,
           m.warning
    FROM newDATA AS n
    LEFT JOIN myDATA AS m
    ON (n.headnote = m.myHeadnote AND n.citation = m.myCitation)
    WHERE n.headnote IS NOT NULL AND n.citation IS NOT NULL
    AND NOT (n.topic = m.myTopic AND n.summary = m.mySummary
             AND n.case_name = m.myCaseName AND m.warning IS NULL OR m.warning = '[]')""")

#maybe these could have been left out in the last step, but these are matching so will always duplicate headnote & citation
conn.execute("""ALTER TABLE compareTable
             DROP COLUMN myHeadnote;
             DROP COLUMN myCitation """)

# getting records where single case has same headnote more than once
summaryCompare = conn.execute("""CREATE VIEW dup_HN AS
             SELECT index_key, mySummary, summary, headnote, citation
             FROM compareTable a
             JOIN (SELECT headnote, citation,
             COUNT(*) > 1) b
             ON (a.headnote = b.headnote
             AND a.citation = b.citation)
             ORDER BY headnote, citation
              """)

delRow = []
for row in summaryCompare:
    index_key, mySummary, summary, headnote, citation = row
    score = calcRatio(mySummary, summary)
    if score < .7:
        print_it("removing suspected duplicates for " & headnote & " " & citation)
    else:
        delRow.append(index_key)

conn.executemany(
    "DELETE FROM compareTable WHERE index_key = ?", delRow
)

conn.execute("DROP VIEW IF EXISTS myDATA")
conn.execute("DROP VIEW IF EXISTS compare")
print_it("table built, running comparisons...")

rows = conn.execute("SELECT headnote, citation, topic, myTopic, summary, mySummary, case_name, myCaseName, warning FROM compareTable").fetchall()

updates = []
for row in rows:
    headnote, citation, topic, myTopic, summary, mySummary, case_name, myCaseName, warning = row
    warnings = json.loads(warning) if warning else []

    if topic != myTopic:
        warnings.append(f"Topic mismatch: new='{topic}' old='{myTopic}'")
    if summary != mySummary:
        warnings.append("Summary mismatch")
    if case_name != myCaseName:
        warnings.append(f"Case name mismatch: new='{case_name}' old='{myCaseName}'")

    updates.append((json.dumps(warnings), headnote, citation))


print_it("comparisons done, adding index...")

conn.execute("CREATE INDEX idx_compare ON compareTable (headnote, citation)")

print_it("updating table data...")

conn.executemany(
    "UPDATE compareTable SET warning = ? WHERE headnote = ? AND citation = ?",
    updates
)

print(conn.execute("SELECT summary FROM compareTable LIMIT 1").fetchone())

print_it("writing to csv")

rows = conn.execute("SELECT * FROM compareTable").fetchall()
headers = [d[0] for d in conn.execute("SELECT * FROM compareTable").description]

with open(createOutput, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    writer.writerows(rows)

print_it("finished!")

conn.close()  #changes not committed
