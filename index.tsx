// @ts-nocheck

const excelFileInput = document.getElementById('excel-file-input');
const vaultFileInput = document.getElementById('vault-file-input');
const dashboardGrid = document.getElementById('dashboard-grid');
const initialMessage = document.getElementById('initial-message');
const initialUploadArea = document.getElementById('initial-upload-area');
const messageBox = document.getElementById('message-box');

// Main Controls
const mainControlsContainer = document.getElementById('main-controls-container');
const searchInput = document.getElementById('search-input');
const exportExcelBtn = document.getElementById('export-excel-btn');
const exportVaultBtn = document.getElementById('export-vault-btn');
const lockDashboardBtn = document.getElementById('lock-dashboard-btn');
const lockIcon = document.getElementById('lock-icon');
const unlockIcon = document.getElementById('unlock-icon');
const resetAppBtn = document.getElementById('reset-app-btn');

// Mapping Modal
const mappingModal = document.getElementById('mapping-modal');
const mappingForm = document.getElementById('mapping-form');
const cancelMappingBtn = document.getElementById('cancel-mapping-btn');
const autoMapBtn = document.getElementById('auto-map-btn');
const mappingFieldsContainer = document.getElementById('mapping-fields-container');
const duplicateWarning = document.getElementById('duplicate-warning');

// New Card Modal
const newCardModal = document.getElementById('new-card-modal');
const newCardForm = document.getElementById('new-card-form');
const newCardFieldsContainer = document.getElementById('new-card-fields-container');
const cancelNewCardBtn = document.getElementById('cancel-new-card-btn');

// Reset Confirmation Modal
const resetConfirmationModal = document.getElementById('reset-confirmation-modal');
const cancelResetBtn = document.getElementById('cancel-reset-btn');
const confirmResetBtn = document.getElementById('confirm-reset-btn');

// Filters
const categoryFilter = document.getElementById('category-filter');
const statusFilter = document.getElementById('status-filter');
const categoryFilterGroup = document.getElementById('category-filter-group');
const statusFilterGroup = document.getElementById('status-filter-group');

// State
let currentJsonData = [];
let currentMapping = {};
let isLocked = false;
let pendingJsonData = null;
let pendingHeaders = [];
let pendingPreviewData = {};

const cardRoles = {
    'none': 'Ignore',
    'title': 'Title (Large text)',
    'category': 'Category (Smaller text)',
    'status': 'Status (Label)',
    'description': 'Description (Body text)',
    'username': 'Username',
    'password': 'Password',
    'url': 'URL (Link)',
    'email': 'Email',
    'comment': 'Comment'
};

function saveDashboardState() {
    if (currentJsonData.length > 0 && Object.keys(currentMapping).length > 0) {
        localStorage.setItem('dashboardData', JSON.stringify(currentJsonData));
        localStorage.setItem('dashboardMapping', JSON.stringify(currentMapping));
    }
}

function loadDashboardState() {
    const savedData = localStorage.getItem('dashboardData');
    const savedMapping = localStorage.getItem('dashboardMapping');

    if (savedData && savedMapping) {
        try {
            currentJsonData = JSON.parse(savedData);
            // Add internal IDs for deletion if they don't exist
            currentJsonData.forEach((row, index) => {
                if (!row.internal_id) {
                    row.internal_id = `row-${Date.now()}-${index}`;
                }
            });

            currentMapping = JSON.parse(savedMapping);

            if (currentJsonData.length > 0 && Object.keys(currentMapping).length > 0) {
                initialUploadArea.classList.add('hidden');
                initialMessage.style.display = 'none';
                mainControlsContainer.classList.remove('hidden');
                
                setupFilters();
                applyAndRenderFilters();
                showMessage('Dashboard restored from previous session.', 'info');
            }
        } catch (error) {
            console.error("Could not load state from localStorage:", error);
            localStorage.removeItem('dashboardData');
            localStorage.removeItem('dashboardMapping');
        }
    }
}

function resetApp() {
    localStorage.removeItem('dashboardData');
    localStorage.removeItem('dashboardMapping');
    currentJsonData = [];
    currentMapping = {};
    isLocked = false;
    
    dashboardGrid.innerHTML = '';
    initialUploadArea.classList.remove('hidden');
    mainControlsContainer.classList.add('hidden');
    initialMessage.style.display = 'block';
    resetConfirmationModal.classList.add('hidden');
    showMessage('Application has been reset.', 'info');
}

// Event Listeners
excelFileInput.addEventListener('change', handleFile);
vaultFileInput.addEventListener('change', handleVaultFile);
searchInput.addEventListener('input', applyAndRenderFilters);
exportExcelBtn.addEventListener('click', exportToExcel);
exportVaultBtn.addEventListener('click', exportToVault);
lockDashboardBtn.addEventListener('click', toggleLock);
categoryFilter.addEventListener('change', applyAndRenderFilters);
statusFilter.addEventListener('change', applyAndRenderFilters);
resetAppBtn.addEventListener('click', () => resetConfirmationModal.classList.remove('hidden'));
cancelResetBtn.addEventListener('click', () => resetConfirmationModal.classList.add('hidden'));
confirmResetBtn.addEventListener('click', resetApp);

function isUrl(str) {
    if (typeof str !== 'string' || str.trim() === '') return false;
    const pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
        '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
        '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
        '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
    return !!pattern.test(str);
}

function isEmail(str) {
    if (typeof str !== 'string' || str.trim() === '') return false;
    const pattern = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return pattern.test(str);
}

function isLikelyPassword(str) {
    if (typeof str !== 'string' || str.trim() === '') return false;
    // Simple check: length between 6 and 30, has letters and numbers.
    return str.length >= 6 && str.length <= 30 && /\d/.test(str) && /[a-zA-Z]/.test(str);
}


function hasHeaders(aoa) {
    if (!aoa || aoa.length < 1) return false;
    const firstRow = aoa[0];
    if (firstRow.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) {
        return false;
    }
    const stringsInFirstRow = firstRow.filter(cell => typeof cell === 'string' && cell.trim() !== '').length;
    if (stringsInFirstRow / firstRow.length < 0.8) { 
        return false;
    }
    const uniqueFirstRow = new Set(firstRow.map(c => String(c).trim()));
    if (uniqueFirstRow.size < firstRow.length * 0.8) {
        return false;
    }
    if (aoa.length > 1) {
        const secondRow = aoa[1];
        const firstRowTypes = firstRow.map(p => (typeof p));
        const secondRowTypes = secondRow.map(p => (typeof p));
        if (JSON.stringify(firstRowTypes) !== JSON.stringify(secondRowTypes) && secondRowTypes.includes("number")) {
            return true;
        }
    }
    return true;
}

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    showMessage('Reading file...', 'info');

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            
            if (aoa.length === 0) {
                showMessage('Could not find any data in the file.', 'warning');
                return;
            }

            let headers;
            let jsonData;
            let previewData = {};

            if (hasHeaders(aoa)) {
                headers = aoa[0].map(h => String(h).trim());
                jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
            } else {
                const maxCols = aoa.reduce((max, row) => Math.max(max, row.length), 0);
                headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
                jsonData = aoa.map(row => {
                    const obj = {};
                    headers.forEach((h, i) => {
                        obj[h] = row[i] || "";
                    });
                    return obj;
                });
            }

            // Generate preview data
            headers.forEach((h, i) => {
                // Find the first non-empty value in this column for preview
                for(const row of jsonData) {
                    if (row[h] && String(row[h]).trim() !== "") {
                        previewData[h] = String(row[h]);
                        break;
                    }
                }
            });

            if (headers.length === 0) {
                showMessage('Could not identify any columns in the file.', 'warning');
                return;
            }
            
            pendingJsonData = jsonData;
            pendingHeaders = headers;
            pendingPreviewData = previewData;
            showMappingUI(headers, previewData);

        } catch (error) {
            console.error("Error processing file:", error);
            showMessage('Could not read the file.', 'error');
        }
    };
    reader.onerror = () => showMessage('An error occurred while reading the file.', 'error');
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

function updateMappingStatus(rowElement, selectedValue) {
    const statusCell = rowElement.querySelector('.mapping-status');
    const labelInput = rowElement.querySelector('.custom-label-input');
    
    if (selectedValue === 'none') {
        statusCell.textContent = 'Ignored';
        statusCell.className = 'mapping-status status-ignored';
        labelInput.classList.add('hidden');
    } else {
        statusCell.textContent = 'Mapped';
        statusCell.className = 'mapping-status status-mapped';
        labelInput.classList.remove('hidden');
        if(!labelInput.value) {
           labelInput.value = cardRoles[selectedValue].split('(')[0].trim();
        }
    }
}

function showMappingUI(headers, previewData) {
    mappingFieldsContainer.innerHTML = '';
    headers.forEach(header => {
        const row = document.createElement('div');
        row.className = 'grid grid-cols-3 gap-4 items-center px-4 py-2 border-b border-gray-700/50';

        const fileFieldCell = document.createElement('div');
        const headerLabel = document.createElement('span');
        headerLabel.textContent = header;
        headerLabel.className = 'text-sm font-medium text-gray-300 truncate';
        headerLabel.title = header;
        fileFieldCell.appendChild(headerLabel);
        
        if (previewData[header]) {
            const preview = document.createElement('p');
            preview.className = 'preview-text';
            preview.textContent = `e.g., ${previewData[header]}`;
            fileFieldCell.appendChild(preview);
        }

        const appFieldCell = document.createElement('div');
        appFieldCell.className = 'flex flex-col gap-1';

        const select = document.createElement('select');
        select.className = 'w-full bg-gray-700 border border-gray-600 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 text-sm';
        select.dataset.header = header;
        for(const key in cardRoles) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = cardRoles[key];
            select.appendChild(option);
        }
        
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'custom-label-input hidden';
        labelInput.placeholder = 'Enter card label...';
        
        appFieldCell.appendChild(select);
        appFieldCell.appendChild(labelInput);
        
        select.addEventListener('change', () => {
            updateMappingStatus(row, select.value);
            checkDuplicateMappings();
        });

        const status = document.createElement('span');
        status.className = 'mapping-status';

        row.appendChild(fileFieldCell);
        row.appendChild(appFieldCell);
        row.appendChild(status);
        mappingFieldsContainer.appendChild(row);
        
        updateMappingStatus(row, select.value);
    });
    hideMessage();
    mappingModal.classList.remove('hidden');
    autoMapFields();
}

autoMapBtn.addEventListener('click', autoMapFields);
function autoMapFields() {
    const rows = mappingFieldsContainer.querySelectorAll('.grid');
    rows.forEach(row => {
        const select = row.querySelector('select');
        const labelInput = row.querySelector('.custom-label-input');
        const header = select.dataset.header.toLowerCase().trim();
        const previewText = pendingPreviewData[select.dataset.header] || '';
        let assignedRole = 'none';

        if (['title', 'name', 'header', 'subject', 'site', 'website'].some(term => header.includes(term))) {
            assignedRole = 'title';
        } else if (['url', 'link', 'href', 'website'].some(term => header.includes(term)) || isUrl(previewText)) {
            assignedRole = 'url';
        } else if (['user', 'username', 'login'].some(term => header.includes(term))) {
            assignedRole = 'username';
        } else if (['password', 'pwd', 'pass'].some(term => header.includes(term)) || isLikelyPassword(previewText)) {
            assignedRole = 'password';
        } else if (['category', 'group', 'type'].some(term => header.includes(term))) {
            assignedRole = 'category';
        } else if (['status', 'state'].some(term => header.includes(term))) {
            assignedRole = 'status';
        } else if (['description', 'desc', 'notes', 'note', 'details'].some(term => header.includes(term))) {
            assignedRole = 'description';
        } else if (['email', 'e-mail'].some(term => header.includes(term)) || isEmail(previewText)) {
            assignedRole = 'email';
        } else if (['comment', 'remark'].some(term => header.includes(term))) {
            assignedRole = 'comment';
        }
        
        select.value = assignedRole;
        if (assignedRole !== 'none') {
            labelInput.value = cardRoles[assignedRole].split('(')[0].trim();
        } else {
            labelInput.value = '';
        }
        updateMappingStatus(row, assignedRole);
    });
    checkDuplicateMappings();
}

mappingForm.addEventListener('change', checkDuplicateMappings);
function checkDuplicateMappings() {
    const selects = mappingFieldsContainer.querySelectorAll('select');
    const usedRoles = new Set();
    let hasDuplicates = false;
    selects.forEach(select => {
        const role = select.value;
        if (role !== 'none') {
            if (usedRoles.has(role)) hasDuplicates = true;
            usedRoles.add(role);
        }
    });
    duplicateWarning.classList.toggle('hidden', !hasDuplicates);
}

mappingForm.addEventListener('submit', function(event) {
    event.preventDefault();
    const newMapping = {};
    const selects = mappingFieldsContainer.querySelectorAll('select');
    selects.forEach(select => {
        const role = select.value;
        const header = select.dataset.header;
        const labelInput = select.nextElementSibling;
        if (role !== 'none') {
            newMapping[role] = {
                header: header,
                label: labelInput.value || cardRoles[role].split('(')[0].trim()
            };
        }
    });

    if (Object.keys(newMapping).length === 0) {
        alert('You must map at least one field to import.');
        return;
    }
    
    // Add internal IDs for deletion tracking
    pendingJsonData.forEach((row, index) => row.internal_id = `row-${Date.now()}-${index}`);
    currentJsonData = pendingJsonData;
    currentMapping = newMapping;

    initialUploadArea.classList.add('hidden');
    initialMessage.style.display = 'none';
    mainControlsContainer.classList.remove('hidden');
    showMessage(`${currentJsonData.length} cards were imported.`, 'info');
    
    mappingModal.classList.add('hidden');
    applyAndRenderFilters();
    setupFilters();
    saveDashboardState();

    pendingJsonData = null;
    pendingHeaders = [];
    pendingPreviewData = {};
});

cancelMappingBtn.addEventListener('click', () => {
    mappingModal.classList.add('hidden');
    if (currentJsonData.length === 0) {
        initialMessage.style.display = 'block';
    }
    pendingJsonData = null;
    pendingHeaders = [];
    pendingPreviewData = {};
    excelFileInput.value = '';
});

function setupFilters() {
    const setup = (key, element, group) => {
        if (currentMapping[key]) {
            const header = currentMapping[key].header;
            const values = new Set(currentJsonData.map(row => row[header]).filter(Boolean));
            if (values.size > 0) {
                const existingValue = element.value;
                element.innerHTML = `<option value="all">All ${currentMapping[key].label}s</option>`;
                Array.from(values).sort().forEach(val => {
                    const option = document.createElement('option');
                    option.value = val;
                    option.textContent = val;
                    element.appendChild(option);
                });
                element.value = existingValue;
                group.classList.remove('hidden');
                return;
            }
        }
        group.classList.add('hidden');
    };
    setup('category', categoryFilter, categoryFilterGroup);
    setup('status', statusFilter, statusFilterGroup);
}

function applyAndRenderFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;
    const selectedStatus = statusFilter.value;

    const filteredData = currentJsonData.filter(row => {
        const categoryHeader = currentMapping.category ? currentMapping.category.header : null;
        const statusHeader = currentMapping.status ? currentMapping.status.header : null;
        const categoryMatch = selectedCategory === 'all' || !categoryHeader || row[categoryHeader] == selectedCategory;
        const statusMatch = selectedStatus === 'all' || !statusHeader || row[statusHeader] == selectedStatus;
        const searchMatch = searchTerm === '' || Object.keys(row).some(key => key !== 'internal_id' && String(row[key]).toLowerCase().includes(searchTerm));
        return categoryMatch && statusMatch && searchMatch;
    });
    renderCards(filteredData);
}

function renderCards(data) {
    dashboardGrid.innerHTML = '';
    dashboardGrid.classList.toggle('is-locked', isLocked);
    
    // Add the "New Database" card
    const newDbCard = document.createElement('div');
    newDbCard.id = 'new-database-card';
    newDbCard.className = 'new-database-card border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:border-gray-500 cursor-pointer transition-colors';
    newDbCard.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>New Card`;
    dashboardGrid.appendChild(newDbCard);

    if (isLocked) {
        newDbCard.classList.add('opacity-50', 'cursor-not-allowed');
    }

    if (data.length === 0 && currentJsonData.length > 0) {
        const noResults = document.createElement('div');
        noResults.className = 'col-span-full text-center text-gray-500 py-16';
        noResults.textContent = 'No cards match your current filters.';
        dashboardGrid.appendChild(noResults);
    } else if (currentJsonData.length === 0) {
         initialMessage.style.display = 'block';
    } else {
         initialMessage.style.display = 'none';
    }


    data.forEach(row => {
        const card = document.createElement('div');
        card.className = 'card bg-gray-800 border border-gray-700 rounded-lg p-5 flex flex-col shadow-md space-y-3 relative group';
        const m = currentMapping; // shortcut
        
        const createFieldHTML = (role) => {
            if (!m[role]) return '';
            const { header, label } = m[role];
            const value = row[header];
            if (!value) return '';

            if (role === 'url') {
                const stringValue = String(value);
                const safeUrl = stringValue.startsWith('http') ? stringValue : `https://${stringValue}`;
                return `<div><span class="font-semibold text-gray-400">${label}:</span> <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline break-all ml-1">${value}</a></div>`;
            }
             if (role === 'password') {
                return `<div><span class="font-semibold text-gray-400">${label}:</span> <span class="text-gray-300 ml-1">••••••••</span></div>`;
            }
            return `<div><span class="font-semibold text-gray-400">${label}:</span> <span class="text-gray-300 ml-1 break-all">${value}</span></div>`;
        };
        const title = m.title ? row[m.title.header] : 'No Title';
        const status = m.status ? row[m.status.header] : null;
        const category = m.category ? row[m.category.header] : null;
        const description = m.description ? row[m.description.header] : null;
        const comment = m.comment ? row[m.comment.header] : null;

        const urlValue = m.url ? row[m.url.header] : null;
        let faviconHTML = '';
        if (urlValue) {
            const stringValue = String(urlValue);
            const safeUrl = stringValue.startsWith('http') ? stringValue : `https://${stringValue}`;
            try {
                const domain = new URL(safeUrl).hostname;
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                faviconHTML = `<img src="${faviconUrl}" alt="favicon" class="favicon-img" onerror="this.style.display='none'">`;
            } catch (e) { /* ignore invalid urls */ }
        }
        
        const deleteButtonHTML = isLocked ? '' : `
            <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button data-id="${row.internal_id}" class="delete-card-btn p-1.5 rounded-full bg-gray-700/50 hover:bg-red-500/50 text-gray-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                 </button>
            </div>
        `;

        card.innerHTML = `
            ${deleteButtonHTML}
            <div class="flex justify-between items-start">
                <h3 class="text-xl font-bold text-white pr-8 break-all">${faviconHTML}${title}</h3>
                ${status ? `<span class="text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusColor(status.toString())} flex-shrink-0">${status}</span>` : ''}
            </div>
            ${category ? `<p class="text-sm text-blue-400 -mt-2">${category}</p>` : ''}
            ${createFieldHTML('url')}
            ${createFieldHTML('username')}
            ${createFieldHTML('email')}
            ${createFieldHTML('password')}
            ${description ? `<p class="text-gray-400 text-sm pt-2">${description}</p>` : ''}
            ${comment ? `<div class="text-sm pt-2"><span class="font-semibold text-gray-400">${m.comment.label}:</span><p class="text-gray-300 whitespace-pre-wrap">${comment}</p></div>` : ''}
        `;
        dashboardGrid.appendChild(card);
    });
}

dashboardGrid.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.delete-card-btn');
    const newCardBtn = e.target.closest('#new-database-card');
    
    if (deleteBtn && !isLocked) {
        const cardId = deleteBtn.dataset.id;
        if (confirm('Are you sure you want to delete this card?')) {
            currentJsonData = currentJsonData.filter(row => row.internal_id !== cardId);
            applyAndRenderFilters();
            saveDashboardState();
        }
    } else if (newCardBtn && !isLocked) {
        showNewCardModal();
    }
});

function getStatusColor(status) {
    const s = String(status).toLowerCase();
    if (['completed', 'done', 'finished'].includes(s)) return 'bg-green-900 text-green-300';
    if (['in progress', 'ongoing', 'active'].includes(s)) return 'bg-yellow-900 text-yellow-300';
    if (['problem', 'error', 'failed', 'stuck'].includes(s)) return 'bg-red-900 text-red-300';
    if (['planned', 'todo', 'next'].includes(s)) return 'bg-blue-900 text-blue-300';
    return 'bg-gray-700 text-gray-300';
}

function showNewCardModal() {
    if (isLocked) return;
    newCardForm.reset();
    newCardFieldsContainer.innerHTML = '';
    
    const rolesInOrder = ['title', 'url', 'username', 'password', 'email', 'category', 'status', 'description', 'comment'];
    
    rolesInOrder.forEach(role => {
        const mapping = currentMapping[role] || { label: cardRoles[role].split('(')[0].trim(), header: role };
        
        const fieldDiv = document.createElement('div');
        fieldDiv.innerHTML = `
            <label for="new-card-${role}" class="block text-sm font-medium text-gray-300 mb-1">${mapping.label}</label>
            <input type="text" id="new-card-${role}" name="${role}" data-header="${mapping.header}" class="w-full bg-gray-700 border border-gray-600 text-white rounded-md p-2 focus:ring-blue-500 focus:border-blue-500">
        `;
        newCardFieldsContainer.appendChild(fieldDiv);
    });
    newCardModal.classList.remove('hidden');
}

newCardForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newCardData = { internal_id: `row-${Date.now()}-new` };
    let hasData = false;
    const inputs = newCardFieldsContainer.querySelectorAll('input');

    inputs.forEach(input => {
        if (input.value) {
            const role = input.name;
            // Ensure mapping exists, create if not
            if (!currentMapping[role]) {
                currentMapping[role] = { header: input.dataset.header, label: input.previousElementSibling.textContent };
            }
            newCardData[currentMapping[role].header] = input.value;
            hasData = true;
        }
    });

    if (hasData) {
        currentJsonData.push(newCardData);
        applyAndRenderFilters();
        setupFilters();
        saveDashboardState();
    }
    newCardModal.classList.add('hidden');
});
cancelNewCardBtn.addEventListener('click', () => newCardModal.classList.add('hidden'));

function exportToExcel() {
    const dataToExport = currentJsonData.map(row => {
        const { internal_id, ...rest } = row;
        return rest;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard Data");
    XLSX.writeFile(wb, "dashboard_export.xlsx");
}

function exportToVault() {
    const dataToExport = currentJsonData.map(row => {
        const { internal_id, ...rest } = row;
        return rest;
    });
    const vaultData = {
        mapping: currentMapping,
        data: dataToExport
    };
    const blob = new Blob([JSON.stringify(vaultData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dashboard.vault';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleVaultFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const vaultData = JSON.parse(e.target.result);
            if (vaultData.mapping && vaultData.data) {
                currentMapping = vaultData.mapping;
                currentJsonData = vaultData.data;
                currentJsonData.forEach((row, index) => row.internal_id = `row-${Date.now()}-${index}`);
                initialUploadArea.classList.add('hidden');
                initialMessage.style.display = 'none';
                mainControlsContainer.classList.remove('hidden');
                applyAndRenderFilters();
                setupFilters();
                saveDashboardState();
                showMessage('Vault imported!', 'info');
            } else {
                showMessage('Invalid .vault file.', 'error');
            }
        } catch (err) {
            showMessage('Could not read .vault file.', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function toggleLock() {
    isLocked = !isLocked;
    lockIcon.classList.toggle('hidden', isLocked);
    unlockIcon.classList.toggle('hidden', !isLocked);
    lockDashboardBtn.title = isLocked ? 'Unlock editing' : 'Lock editing';
    [document.getElementById('import-excel-btn'), document.getElementById('import-vault-btn'), resetAppBtn].forEach(btn => {
        btn.disabled = isLocked;
        btn.classList.toggle('opacity-50', isLocked);
        btn.classList.toggle('cursor-not-allowed', isLocked);
    });
    applyAndRenderFilters(); // Re-render to apply lock state to cards
}

function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = 'text-center mb-8 p-4 rounded-lg transition-opacity duration-300 opacity-100';
    let colorClass = 'bg-blue-900 text-blue-200';
    if (type === 'warning') colorClass = 'bg-yellow-900 text-yellow-200';
    else if (type === 'error') colorClass = 'bg-red-900 text-red-200';
    messageBox.classList.remove('hidden', 'opacity-0');
    messageBox.classList.add(...colorClass.split(' '));
    setTimeout(() => {
        messageBox.classList.add('opacity-0');
        setTimeout(() => messageBox.classList.add('hidden'), 300);
    }, 4000);
}


function hideMessage() {
    messageBox.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', loadDashboardState);