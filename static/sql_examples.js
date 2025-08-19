document.addEventListener('DOMContentLoaded', () => {
    // Define your SQL examples in one place
    const sqlExamples = [
        {
            label: "Affordable Housing",
            sql:
`SELECT * FROM headnotes
WHERE summary LIKE '%affordable housing%'
ORDER BY year DESC`
        },
        {
            label: "Recent Case List",
            sql: `
SELECT DISTINCT case_name, year, pub_month AS month FROM headnotes
WHERE year >= 2018
ORDER BY year DESC, pub_month DESC`
        },
        {
            label: "Cites to ORS 197.829",
            sql:
`SELECT * FROM headnotes
WHERE ors_cites LIKE '%197.829%'`
        },
        {
            label: "Headnote 36",
            sql:
`SELECT * FROM headnotes
WHERE headnote LIKE '36%'
ORDER BY headnote ASC, year DESC`
        },
        {
            label: "Headnote Count",
            sql: `
SELECT topic, COUNT(*) as headnote_count FROM headnotes
GROUP BY topic
ORDER BY headnote_count DESC`
        },
        {
            label: "Corvallis since 2015",
            sql: `
SELECT * FROM headnotes
WHERE case_name LIKE '%City of Corvallis%' AND year >= 2015`
        },
        {
            label: "Environmental",
            sql:
`SELECT * FROM headnotes
WHERE summary LIKE '%environment%' OR summary LIKE '%pollut%' OR summary LIKE "%contamina%"
ORDER BY year DESC`
        },
        {
            label: "Headnotes with Warnings",
            sql:
`SELECT * FROM headnotes
WHERE warnings !='[]'
ORDER BY warnings ASC`
        },
        {
            label: "Most Cited OAR List",
            sql:
`SELECT cite.value AS value, COUNT(cite.value) AS cite_count FROM headnotes,
JSON_EACH(headnotes.oar_cites) AS cite
GROUP BY cite.value
ORDER BY cite_count DESC, value ASC`
            /* `SELECT cite.value AS oar_cited, COUNT(*) AS cite_count FROM headnotes,
JSON_EACH(headnotes.oar_cites) AS cite
WHERE headnotes.oar_cites != '[]' AND headnotes.oar_cites != ''
GROUP BY cite.value
ORDER BY cite_count DESC, individual_oar ASC;`
 */        },
        {
            label: "Citing Or S.Ct.",
            sql:
`SELECT DISTINCT headnotes.* FROM headnotes
JOIN JSON_EACH(headnotes.case_cites) AS cite
WHERE cite.value LIKE '%Or%'
  AND cite.value NOT LIKE '%App%'
ORDER BY headnotes.year DESC`
        }
    ];

    // Find the container where SQL examples should go
    const sqlExamplesContainer = document.querySelector('.sql-examples .example-queries');

    if (sqlExamplesContainer) {
        sqlExamplesContainer.innerHTML = '';
        // Create buttons for each example
        sqlExamples.forEach(example => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sql-example';
            button.setAttribute('data-sql', example.sql);
            button.textContent = example.label;
            sqlExamplesContainer.appendChild(button);
        });
    }

    // Create Handlers for SQL example button clicks
    document.addEventListener('click', event => {
        if (event.target.classList.contains('sql-example')) {
            const sqlTextarea = document.querySelector('.sql-text-box');
            if (sqlTextarea) {
                sqlTextarea.value = event.target.getAttribute('data-sql').trim();
            }
        }
    });
});
