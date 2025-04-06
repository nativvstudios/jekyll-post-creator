// Script inside the webview
(function() {
    const vscode = acquireVsCodeApi();
    const titleInput = document.getElementById('title');
    const categoriesInput = document.getElementById('categories');
    const tagsInput = document.getElementById('tags');
    const layoutSelect = document.getElementById('layout');
    const createBtn = document.getElementById('createBtn');
    const addOptionBtn = document.getElementById('addOptionBtn');
    const customFieldsContainer = document.getElementById('customFieldsContainer');

    let customFieldIndex = 0;

    function addCustomField() {
        const fieldId = customFieldIndex++;
        const div = document.createElement('div');
        div.className = 'custom-field';
        div.dataset.id = fieldId;

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.placeholder = 'Option Key (e.g., comments)';
        keyInput.dataset.type = 'key';
        keyInput.className = '';
        keyInput.oninput = () => keyInput.classList.remove('error');
        keyInput.onfocus = () => keyInput.classList.remove('error');

        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.placeholder = 'Option Value (e.g., true, 123, "text")';
        valueInput.dataset.type = 'value';

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '-';
        removeBtn.title = 'Remove Option';
        removeBtn.type = 'button';
        removeBtn.onclick = () => div.remove();

        div.appendChild(keyInput);
        div.appendChild(valueInput);
        div.appendChild(removeBtn);
        customFieldsContainer.appendChild(div);
        keyInput.focus();
    }

    addOptionBtn.addEventListener('click', addCustomField);

    createBtn.addEventListener('click', () => {
        // Reset previous errors
        titleInput.classList.remove('error');
        document.querySelectorAll('#customFieldsContainer .custom-field input[data-type="key"]').forEach(el => {
            el.classList.remove('error');
        });

        const title = titleInput.value.trim();
        if (!title) {
            vscode.postMessage({ command: 'error', text: 'Title is required.' });
            titleInput.classList.add('error');
            return;
        }

        // Collect custom fields
        const additionalOptions = {};
        const customFields = customFieldsContainer.querySelectorAll('.custom-field');
        let hasError = false;
        customFields.forEach(field => {
            const keyInput = field.querySelector('input[data-type="key"]');
            const valueInput = field.querySelector('input[data-type="value"]');
            const key = keyInput.value.trim();
            const value = valueInput.value.trim();

            if (key) {
                try {
                    if (value === 'true') { additionalOptions[key] = true; }
                    else if (value === 'false') { additionalOptions[key] = false; }
                    else if (value === 'null') { additionalOptions[key] = null; }
                    else if (value !== '' && !isNaN(Number(value)) && isFinite(Number(value))) { additionalOptions[key] = Number(value); }
                    else if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
                        additionalOptions[key] = JSON.parse(value);
                    }
                    else { additionalOptions[key] = value; }
                } catch (e) {
                    additionalOptions[key] = value; // Treat as string if parse fails
                }
            } else if (value) {
                // Use string concatenation for the message to avoid nested template literal issues here
                vscode.postMessage({ command: 'error', text: 'Custom field key cannot be empty if value "' + value + '" is provided.' });
                keyInput.classList.add('error');
                hasError = true;
            }
        });

        if (hasError) return;

        vscode.postMessage({
            command: 'createPost',
            data: {
                title: title,
                categories: categoriesInput.value,
                tags: tagsInput.value,
                layout: layoutSelect.value,
                additionalOptions: additionalOptions
            }
        });
    });

}()); // End of IIFE wrapper for script 