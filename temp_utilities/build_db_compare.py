import sqlite3, json, time, csv

lubaDB = "../../luba.db"
sarahJson = "./LUBA_headnotes_2026-03-19--10-03.json"
output = "compare_output.csv"

def print_it(myText):
    print (str(time.time()) + " " + myText)

with open(sarahJson, 'r' , encoding='utf-8') as f:
  new_data = json.load(f)

conn = sqlite3.connect(lubaDB)
#print_it(", ".join(conn.execute("PRAGMA integrity_check;").fetchall()))
print(conn.execute("SELECT summary FROM published_headnotes_old LIMIT 1").fetchone())

conn.execute("DROP TABLE IF EXISTS compareTable")
conn.execute("DROP VIEW IF EXISTS myDATA")
conn.execute("DROP VIEW IF EXISTS compare")
conn.execute(
  """CREATE VIEW myDATA AS
    SELECT h.headnote_number AS myHeadnote, t.topic as myTopic, h.summary as mySummary, o.case_name as myCaseName, o.reporter as myCitation, w.message as warning
    FROM published_headnotes_old AS h
    LEFT JOIN opinions AS o
    ON h.opinion_id = o.id
    LEFT JOIN headnote_topics as t
    ON h.headnote_number = t.number
    LEFT JOIN warnings as w
    ON h.warning_id = w.id
    """
    )

print_it("importing table...")


conn.execute(
  """CREATE TEMP TABLE newDATA
  (headnote, topic, summary, case_name, citation, year, index_key)""")
conn.executemany(
  """INSERT INTO newDATA VALUES
  (:headnote, :topic, :summary, :case_name, :citation, :year, :index_key)""",
  [{**r, 'index_key': r.get('index')} for r in new_data]
)

print_it("building new table...")

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

with open(output, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    writer.writerows(rows)

print_it("finished!")

conn.close()  #changes not committed
