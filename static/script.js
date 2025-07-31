document.addEventListener('DOMContentLoaded', function() {

    // Apply formatting from the stored formatting data
    const formattingScripts = document.querySelectorAll('.formatting-data');
    formattingScripts.forEach(function(script) {
        try {
            const formattingText = script.textContent.trim();
            const targetId = script.getAttribute('data-target');
            const targetElement = document.getElementById(targetId);

            // Skip if no formatting data or target element
            if (!targetElement || !formattingText || formattingText === '[]' || formattingText === '') {
                return;
            }

            // Parse the SQLite text representation of the JSON array
            let formatting;
            try {
                formatting = JSON.parse(formattingText);
            } catch (jsonError) {
                // If JSON.parse fails, decode HTML entities and try again
                try {
                    const decodedText = decodeHtmlEntities(formattingText);
                    formatting = JSON.parse(decodedText);
                } catch (secondError) {
                    console.log('Could not parse formatting after HTML decode:', formattingText);
                    return;
                }
            }

            if (formatting && Array.isArray(formatting) && formatting.length > 0) {
                let text = targetElement.textContent;

                // Apply formatting (currently just handles italic)
                formatting.forEach(function(format) {
                    if (format.type === 'italic' && format.text) {
                        const regex = new RegExp(escapeRegExp(format.text), 'g');
                        text = text.replace(regex, '<em>' + format.text + '</em>');
                    }
                    if (format.type === 'bold' && format.text) {
                        const regex = new RegExp(escapeRegExp(format.text), 'g');
                        text = text.replace(regex, '<strong>' + format.text + '</strong>');
                    }
                });

                targetElement.innerHTML = text;
            }
        } catch (e) {
            console.log('Could not process formatting data:', e);
        }
    });

    // Handle SQL example buttons
    const sqlExamples = document.querySelectorAll('.sql-example');
    const sqlTextarea = document.querySelector('textarea[name="sql"]');

    sqlExamples.forEach(function(button) {
        button.addEventListener('click', function() {
            if (sqlTextarea) {
                sqlTextarea.value = this.getAttribute('data-sql');
            }
        });
    });
});

// Helper function - decode HTML entities
function decodeHtmlEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

// Helper function - escape special regex characters
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}