document.addEventListener('DOMContentLoaded', () => {
    // Define your SQL examples in one place
    const sqlExamples = [
        {
            label: "Affordable Housing Cases",
            sql: "SELECT * FROM headnotes WHERE summary LIKE '%affordable housing%' ORDER BY year DESC"
        },
        {
            label: "Recent Cases (2019+)",
            sql: "SELECT case_name, year, summary FROM headnotes WHERE year >= 2019 ORDER BY year DESC"
        },
        {
            label: "Headnotes Citing ORS 197.829",
            sql: "SELECT * FROM headnotes WHERE ors_cites LIKE '%197.829%'"
        },
        {
            label: "Headnote 36",
            sql: "SELECT * FROM headnotes where section='36' ORDER BY headnote ASC, year DESC"
        },
        {
            label: "Corvallis Cases Since 2015",
            sql: "SELECT * FROM headnotes WHERE case_name LIKE '%City of Corvallis%' AND year >= 2015"
        },
        {
            label: "Environmental Notes",
            sql: "SELECT * FROM headnotes WHERE summary LIKE '%environment%' OR summary LIKE '%pollution%' ORDER BY year DESC"
        },
        {
            label: "Warnings!",
            sql: "SELECT * FROM headnotes WHERE warnings !='[]' ORDER BY warnings ASC"
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
