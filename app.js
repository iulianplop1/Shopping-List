// Supabase Configuration
const SUPABASE_URL = 'https://monztwavozrgqksehmmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vbnp0d2F2b3pyZ3Frc2VobW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MTMxOTUsImV4cCI6MjA3ODE4OTE5NX0.T_niVGPdZvlqzMg5XratajbfkcCNTfWuFCWlgu3zHc8';

// Gemini API Configuration
const GEMINI_API_KEY = 'AIzaSyDRkO31dq3n5R5KUFVbLgEXQF9yXrx455c';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Rate limiting and retry configuration
let lastApiCallTime = 0;
const MIN_API_CALL_INTERVAL = 1000; // Minimum 1 second between API calls
let apiCallQueue = [];
let isProcessingQueue = false;

// Helper function to call Gemini API with retry logic and rate limiting
async function callGeminiAPI(prompt, retries = 3, baseDelay = 2000) {
    // Rate limiting: ensure minimum time between calls
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCallTime;
    if (timeSinceLastCall < MIN_API_CALL_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_API_CALL_INTERVAL - timeSinceLastCall));
    }
    
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            lastApiCallTime = Date.now();
            
            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorData = {};
                
                // Try to parse error as JSON, but handle cases where it's not
                try {
                    const parsed = JSON.parse(errorText);
                    errorData = parsed.error || parsed || {};
                } catch (e) {
                    // Not JSON, use error text as-is
                }
                
                // Check for rate limit or overload errors
                const errorMsg = errorText.toLowerCase();
                const errorDataMsg = (errorData.message || '').toLowerCase();
                const isRateLimitError = response.status === 429 || 
                    response.status === 503 ||
                    errorMsg.includes('overloaded') ||
                    errorMsg.includes('quota') ||
                    errorMsg.includes('rate limit') ||
                    errorMsg.includes('resource exhausted') ||
                    errorDataMsg.includes('overloaded') ||
                    errorDataMsg.includes('quota') ||
                    errorDataMsg.includes('resource exhausted');
                
                if (isRateLimitError && attempt < retries - 1) {
                    // Exponential backoff: wait longer with each retry
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.log(`Rate limit/overload detected, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // Retry
                }
                
                throw new Error(`Gemini API error: ${errorText}`);
            }

            const data = await response.json();
            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!responseText) {
                throw new Error('No response from Gemini API');
            }

            return responseText;
            
        } catch (error) {
            // If this is the last attempt, throw the error
            if (attempt === retries - 1) {
                // Check if it's a rate limit error and provide user-friendly message
                const errorMsg = error.message || String(error);
                if (errorMsg.toLowerCase().includes('overloaded') || 
                    errorMsg.toLowerCase().includes('quota') ||
                    errorMsg.toLowerCase().includes('rate limit')) {
                    throw new Error('Model is currently overloaded. Please wait a moment and try again.');
                }
                throw error;
            }
            // Otherwise, wait and retry
            const delay = baseDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// State
let currentUser = null;
let items = [];
let goals = [];
let financialProfile = null;
let currentEditingItem = null;
let listBudgets = [];
// Helper function to get showTrackedPrices preference
function getShowTrackedPrices() {
    const stored = localStorage.getItem('showTrackedPrices');
    return stored !== 'false'; // Default to true if not set or if explicitly 'true'
}

let showTrackedPrices = getShowTrackedPrices(); // Initialize from localStorage

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await initializeApp();
    await loadData();
});

// Initialize app
async function initializeApp() {
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        updateAuthUI();
    } else {
        // Don't automatically create anonymous user - let user choose to login/signup first
        // Only create anonymous session after a delay if user hasn't interacted
        setTimeout(async () => {
            // Only create anonymous session if user still hasn't logged in
            if (!currentUser) {
                const { data: { session: currentSession } } = await supabase.auth.getSession();
                if (!currentSession) {
                    const { data, error } = await supabase.auth.signInAnonymously();
                    if (!error && data) {
                        currentUser = data.user;
                        updateAuthUI();
                        await loadData();
                    }
                }
            }
        }, 2000); // Wait 2 seconds before creating anonymous session
    }
    
    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            currentUser = session.user;
            updateAuthUI();
            loadData(); // Reload data when user changes
        } else {
            currentUser = null;
            updateAuthUI();
        }
    });
}

// Update authentication UI
function updateAuthUI() {
    const userEmailEl = document.getElementById('userEmail');
    const showLoginBtn = document.getElementById('showLoginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginForm = document.getElementById('loginForm');
    
    // Check if elements exist (might not be loaded yet)
    if (!userEmailEl || !showLoginBtn || !logoutBtn || !loginForm) {
        return;
    }
    
    if (currentUser) {
        if (currentUser.email) {
            userEmailEl.textContent = `Logged in as: ${currentUser.email}`;
            logoutBtn.style.display = 'inline-block';
            showLoginBtn.style.display = 'none';
        } else {
            userEmailEl.textContent = 'Using anonymous session (data not synced across devices)';
            logoutBtn.style.display = 'inline-block';
            showLoginBtn.style.display = 'none';
        }
        loginForm.style.display = 'none';
    } else {
        userEmailEl.textContent = '';
        logoutBtn.style.display = 'none';
        showLoginBtn.style.display = 'inline-block';
        loginForm.style.display = 'none';
    }
}

// Authentication functions
async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    if (!email || !password) {
        alert('Please enter both email and password');
        return;
    }
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    
    if (error) {
        alert('Login failed: ' + error.message);
    } else {
        currentUser = data.user;
        updateAuthUI();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        showStatus('Logged in successfully!', 'success');
        await loadData();
    }
}

async function signup() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    if (!email || !password) {
        alert('Please enter both email and password');
        return;
    }
    
    if (password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }
    
    const { data, error } = await supabase.auth.signUp({
        email,
        password
    });
    
    if (error) {
        alert('Sign up failed: ' + error.message);
    } else {
        alert('Account created! Please check your email to verify your account.');
        currentUser = data.user;
        updateAuthUI();
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        showStatus('Account created! Check your email to verify.', 'success');
    }
}

async function logout() {
    if (!confirm('Are you sure you want to logout? You can still use the app anonymously, but your data won\'t sync across devices.')) {
        return;
    }
    
    const { error } = await supabase.auth.signOut();
    if (error) {
        alert('Logout failed: ' + error.message);
    } else {
        currentUser = null;
        updateAuthUI();
        // Don't automatically create anonymous session - let user choose
        // They can continue using the app or login/signup
        showStatus('Logged out successfully', 'success');
        // Clear data since we're logged out
        items = [];
        goals = [];
        financialProfile = null;
        renderWishlist();
        renderLists();
        renderGoals();
    }
}

// Function to continue as anonymous (called when user wants to skip login)
async function continueAsAnonymous() {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
        console.error('Error creating anonymous session:', error);
        alert('Error creating anonymous session. Some features may not work.');
    } else {
        currentUser = data.user;
        updateAuthUI();
        await loadData();
        showStatus('Using anonymous session', 'info');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });

    // Financial profile
    document.getElementById('saveProfile').addEventListener('click', saveFinancialProfile);

    // Item management
    document.getElementById('scrapeItemBtn').addEventListener('click', scrapeProduct);
    document.getElementById('addManualItemBtn').addEventListener('click', showManualItemForm);
    document.getElementById('saveItemBtn').addEventListener('click', saveItem);
    document.getElementById('cancelItemBtn').addEventListener('click', cancelItemForm);

    // Goals
    document.getElementById('addGoalBtn').addEventListener('click', showGoalModal);
    document.getElementById('saveGoalBtn').addEventListener('click', saveGoal);

    // Filters and sorting
    document.getElementById('sortBy').addEventListener('change', renderWishlist);
    document.getElementById('viewList').addEventListener('change', renderWishlist);
    document.getElementById('filterList').addEventListener('change', renderWishlist);
    document.getElementById('filterCategory').addEventListener('change', renderWishlist);
    document.getElementById('filterGoal').addEventListener('change', renderWishlist);
    document.getElementById('filterPriority').addEventListener('change', renderWishlist);
    document.getElementById('searchItems').addEventListener('input', renderWishlist);
    
    // Price checking
    document.getElementById('checkPricesBtn').addEventListener('click', () => checkPricesDaily(true));
    
    // Toggle tracked prices display
    const togglePricesBtn = document.getElementById('togglePricesBtn');
    const togglePricesIcon = document.getElementById('togglePricesIcon');
    const togglePricesText = document.getElementById('togglePricesText');
    
    if (togglePricesBtn && togglePricesIcon && togglePricesText) {
        // Update toggle button state
        function updateToggleButtonState() {
            if (showTrackedPrices) {
                togglePricesIcon.textContent = '👁️';
                togglePricesText.textContent = 'Hide Prices';
                togglePricesBtn.title = 'Hide tracked prices';
            } else {
                togglePricesIcon.textContent = '🚫';
                togglePricesText.textContent = 'Show Prices';
                togglePricesBtn.title = 'Show tracked prices';
            }
        }
        
        togglePricesBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showTrackedPrices = !showTrackedPrices;
            localStorage.setItem('showTrackedPrices', showTrackedPrices.toString());
            console.log('Toggle prices clicked, new state:', showTrackedPrices);
            updateToggleButtonState();
            renderWishlist(); // Re-render to apply the change
        });
        
        // Initialize toggle button state
        updateToggleButtonState();
    } else {
        console.warn('Toggle prices button elements not found');
    }

    // What-if and savings
    document.getElementById('calculateWhatIf').addEventListener('click', calculateWhatIf);
    document.getElementById('calculateSavings').addEventListener('click', calculateSavings);
    
    // Authentication - check if elements exist before adding listeners
    const showLoginBtn = document.getElementById('showLoginBtn');
    const cancelAuthBtn = document.getElementById('cancelAuthBtn');
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const loginForm = document.getElementById('loginForm');
            if (loginForm) {
                loginForm.style.display = 'block';
            }
        });
    }
    
    if (cancelAuthBtn) {
        cancelAuthBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const loginForm = document.getElementById('loginForm');
            if (loginForm) {
                loginForm.style.display = 'none';
            }
        });
    }
    
    const continueAnonymousBtn = document.getElementById('continueAnonymousBtn');
    if (continueAnonymousBtn) {
        continueAnonymousBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const loginForm = document.getElementById('loginForm');
            if (loginForm) {
                loginForm.style.display = 'none';
            }
            continueAsAnonymous();
        });
    }
    
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            login();
        });
    }
    
    if (signupBtn) {
        signupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            signup();
        });
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            logout();
        });
    }

    // Modal close
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    // Close modal on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModals();
            }
        });
    });
}

// Tab switching
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    document.getElementById(tabName + 'Tab').classList.add('active');
}

// Price checking interval (check every hour while app is open)
let priceCheckInterval = null;

// Load all data
async function loadData() {
    await loadFinancialProfile();
    await loadGoals();
    await loadItems();
    await loadListBudgets();
    updateGoalSelects();
    updateCategoryFilter();
    updateListSelectors();
    renderLists();
    renderBudgets();
    renderWishlist();
    
    // Check prices daily for items with purchase links (on initial load)
    checkPricesDaily();
    
    // Set up periodic price checking (every hour while app is open)
    if (priceCheckInterval) {
        clearInterval(priceCheckInterval);
    }
    // Check prices every hour (3600000 ms) while app is open
    priceCheckInterval = setInterval(() => {
        if (currentUser) {
            checkPricesDaily(false); // Automatic check, not forced
        }
    }, 3600000); // 1 hour = 3600000 milliseconds
}

// Update list selectors with available lists
function updateListSelectors() {
    const existingLists = [...new Set(items.map(item => item.list_name).filter(l => l))];
    const premadeLists = ['Grocery', 'Christmas List', 'Temu List'];
    const allLists = [...new Set([...premadeLists, ...existingLists])].sort();
    
    // Update datalist options for detailList
    const listOptions = document.getElementById('listOptions');
    if (listOptions) {
        listOptions.innerHTML = '';
        allLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list;
            listOptions.appendChild(option);
        });
    }
    
    // Update datalist options for viewList
    const viewListOptions = document.getElementById('viewListOptions');
    if (viewListOptions) {
        viewListOptions.innerHTML = '';
        allLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list;
            viewListOptions.appendChild(option);
        });
    }
    
    // Update datalist options for filterList
    const filterListOptions = document.getElementById('filterListOptions');
    if (filterListOptions) {
        filterListOptions.innerHTML = '';
        allLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list;
            filterListOptions.appendChild(option);
        });
    }
}

// Lists Management
function renderLists() {
    const listsListEl = document.getElementById('listsList');
    if (!listsListEl) return;
    
    listsListEl.innerHTML = '';
    
    const existingLists = [...new Set(items.map(item => item.list_name).filter(l => l))];
    
    if (existingLists.length === 0) {
        listsListEl.innerHTML = '<p style="color: var(--text-secondary); padding: 16px; text-align: center;">No lists yet. Create lists by adding items to them.</p>';
        return;
    }
    
    existingLists.sort().forEach(listName => {
        const listItems = items.filter(item => item.list_name === listName);
        const totalPrice = listItems.reduce((sum, item) => sum + (item.price || 0), 0);
        const totalHours = calculateHoursToAfford(totalPrice);
        
        // Get budget for this list
        const budget = listBudgets.find(b => b.list_name === listName);
        const budgetAmount = budget ? budget.budget_amount : null;
        const budgetProgress = budgetAmount ? (totalPrice / budgetAmount) * 100 : null;
        const isOverBudget = budgetAmount && totalPrice > budgetAmount;
        
        const listBadge = document.createElement('div');
        listBadge.className = 'goal-badge';
        listBadge.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
        
        const mainRow = document.createElement('div');
        mainRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;';
        mainRow.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; cursor: pointer; min-width: 200px;" class="list-name-container">
                <span>📋 ${escapeHtml(listName)}</span>
                <span class="goal-stats">${listItems.length} items • €${totalPrice.toFixed(2)} • ${totalHours.toFixed(1)}h</span>
                ${budgetAmount ? `<span style="color: ${isOverBudget ? 'var(--error)' : 'var(--text-secondary)'}; font-size: 0.9rem;">/ €${budgetAmount.toFixed(2)}</span>` : ''}
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary export-list-btn" style="padding: 4px 12px; font-size: 0.85rem;" data-list="${escapeHtml(listName)}" title="Export list">📥 Export</button>
                <button class="btn btn-danger delete-list-btn" style="padding: 4px 12px; font-size: 0.85rem;" data-list="${escapeHtml(listName)}">Delete</button>
            </div>
        `;
        
        listBadge.appendChild(mainRow);
        
        // Budget progress bar
        if (budgetAmount) {
            const progressBar = document.createElement('div');
            progressBar.style.cssText = 'width: 100%; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;';
            const progressFill = document.createElement('div');
            progressFill.style.cssText = `width: ${Math.min(budgetProgress, 100)}%; height: 100%; background: ${isOverBudget ? 'var(--danger-color)' : 'var(--primary-color)'}; transition: width 0.3s ease;`;
            progressBar.appendChild(progressFill);
            listBadge.appendChild(progressBar);
            
            if (isOverBudget) {
                const overBudgetMsg = document.createElement('div');
                overBudgetMsg.style.cssText = 'color: var(--danger-color); font-size: 0.85rem; margin-top: 4px;';
                overBudgetMsg.textContent = `⚠️ Over budget by €${(totalPrice - budgetAmount).toFixed(2)}`;
                listBadge.appendChild(overBudgetMsg);
            }
        }
        
        const nameContainer = mainRow.querySelector('.list-name-container');
        nameContainer.addEventListener('click', () => {
            document.getElementById('viewList').value = listName;
            renderWishlist();
        });
        
        // Export button
        const exportBtn = mainRow.querySelector('.export-list-btn');
        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            exportList(listName, listItems);
        });
        
        // Delete button
        const deleteBtn = mainRow.querySelector('.delete-list-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteList(listName);
        });
        
        listsListEl.appendChild(listBadge);
    });
}

// Export list function
function exportList(listName, listItems) {
    if (!listItems || listItems.length === 0) {
        alert('This list has no items to export.');
        return;
    }
    
    // Ask user for format
    const format = confirm('Export as CSV?\n\nOK = CSV\nCancel = JSON');
    
    if (format) {
        // Export as CSV
        const headers = ['Title', 'Price (€)', 'Current Price (€)', 'Category', 'Priority', 'Tags', 'Purchase Link', 'Image URL', 'Specifications'];
        const rows = listItems.map(item => {
            const specs = Array.isArray(item.specifications) ? item.specifications.join('; ') : (item.specifications || '');
            const tags = Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '');
            return [
                `"${(item.title || '').replace(/"/g, '""')}"`,
                item.price || 0,
                item.current_price || '',
                item.category || '',
                item.priority || '',
                `"${tags.replace(/"/g, '""')}"`,
                item.purchase_link || '',
                item.image_url || '',
                `"${specs.replace(/"/g, '""')}"`
            ];
        });
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${listName.replace(/[^a-z0-9]/gi, '_')}_export.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        // Export as JSON
        const exportData = {
            listName: listName,
            exportDate: new Date().toISOString(),
            itemCount: listItems.length,
            totalPrice: listItems.reduce((sum, item) => sum + (item.price || 0), 0),
            items: listItems.map(item => ({
                title: item.title,
                price: item.price,
                current_price: item.current_price,
                category: item.category,
                priority: item.priority,
                tags: item.tags,
                purchase_link: item.purchase_link,
                image_url: item.image_url,
                specifications: item.specifications,
                created_at: item.created_at
            }))
        };
        
        const jsonContent = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${listName.replace(/[^a-z0-9]/gi, '_')}_export.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    showStatus(`List "${listName}" exported successfully!`, 'success');
}

async function deleteList(listName) {
    if (!listName) return;
    
    const listItems = items.filter(item => item.list_name === listName);
    const itemCount = listItems.length;
    
    if (itemCount === 0) {
        renderLists();
        renderBudgets();
        updateListSelectors();
        renderWishlist();
        return;
    }
    
    // First ask what they want to do
    const choice = confirm(
        `Delete list "${listName}"?\n\n` +
        `This list has ${itemCount} item(s).\n\n` +
        `OK - Remove list name from items (keep items)\n` +
        `Cancel - Choose another option`
    );
    
    if (choice) {
        // Remove list name from items (keep items)
        const { error } = await supabase
            .from('items')
            .update({ list_name: null })
            .eq('user_id', currentUser.id)
            .eq('list_name', listName);
        
        if (error) {
            console.error('Error removing list:', error);
            alert('Error removing list');
        } else {
            // Update local items
            items.forEach(item => {
                if (item.list_name === listName) {
                    item.list_name = null;
                }
            });
            
            renderLists();
            renderBudgets();
            updateListSelectors();
            renderWishlist();
            showStatus(`List "${listName}" removed from items`, 'success');
        }
    } else {
        // Ask if they want to delete all items
        const deleteItems = confirm(
            `Delete all ${itemCount} item(s) in "${listName}"?\n\n` +
            `This will permanently delete all items in this list.\n\n` +
            `This cannot be undone!`
        );
        
        if (deleteItems) {
            const itemIds = listItems.map(item => item.id);
            const { error } = await supabase
                .from('items')
                .delete()
                .in('id', itemIds);
            
            if (error) {
                console.error('Error deleting items:', error);
                alert('Error deleting items');
            } else {
                // Remove from local items
                items = items.filter(item => item.list_name !== listName);
                
                renderLists();
                renderBudgets();
                updateListSelectors();
                renderWishlist();
                showStatus(`List "${listName}" and all its items deleted`, 'success');
            }
        }
    }
}

function renderBudgets() {
    const budgetsListEl = document.getElementById('budgetsList');
    if (!budgetsListEl) return;
    
    budgetsListEl.innerHTML = '';
    
    // Get all lists that have items
    const existingLists = [...new Set(items.map(item => item.list_name).filter(l => l))];
    
    if (existingLists.length === 0 && listBudgets.length === 0) {
        budgetsListEl.innerHTML = '<p style="color: var(--text-secondary); padding: 16px; text-align: center;">No budgets set. Add a budget to a list to track spending.</p>';
        return;
    }
    
    // Show budgets for lists that have items or have budgets set
    const listsToShow = [...new Set([...existingLists, ...listBudgets.map(b => b.list_name)])].sort();
    
    listsToShow.forEach(listName => {
        const budget = listBudgets.find(b => b.list_name === listName);
        const listItems = items.filter(item => item.list_name === listName);
        const totalPrice = listItems.reduce((sum, item) => sum + (item.price || 0), 0);
        
        const budgetCard = document.createElement('div');
        budgetCard.className = 'goal-badge';
        budgetCard.style.cssText = 'display: flex; flex-direction: column; gap: 12px; padding: 16px;';
        
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
        headerRow.innerHTML = `
            <div>
                <strong>📋 ${escapeHtml(listName)}</strong>
                ${listItems.length > 0 ? `<div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${listItems.length} items • €${totalPrice.toFixed(2)}</div>` : ''}
            </div>
        `;
        budgetCard.appendChild(headerRow);
        
        const inputRow = document.createElement('div');
        inputRow.style.cssText = 'display: flex; gap: 8px; align-items: center;';
        
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.min = '0';
        input.placeholder = 'Set budget (€)';
        input.value = budget ? budget.budget_amount.toFixed(2) : '';
        input.style.cssText = 'flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border);';
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn btn-primary';
        saveBtn.textContent = budget ? 'Update' : 'Set';
        saveBtn.style.cssText = 'padding: 8px 16px; font-size: 0.9rem;';
        saveBtn.addEventListener('click', () => {
            const amount = parseFloat(input.value);
            if (isNaN(amount) || amount <= 0) {
                alert('Please enter a valid budget amount');
                return;
            }
            saveBudget(listName, amount);
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger';
        deleteBtn.textContent = 'Remove';
        deleteBtn.style.cssText = 'padding: 8px 16px; font-size: 0.9rem;';
        deleteBtn.style.display = budget ? 'block' : 'none';
        deleteBtn.addEventListener('click', () => {
            deleteBudget(listName);
        });
        
        inputRow.appendChild(input);
        inputRow.appendChild(saveBtn);
        if (budget) {
            inputRow.appendChild(deleteBtn);
        }
        
        budgetCard.appendChild(inputRow);
        
        // Show progress if budget exists
        if (budget) {
            const budgetAmount = budget.budget_amount;
            const progress = (totalPrice / budgetAmount) * 100;
            const isOverBudget = totalPrice > budgetAmount;
            
            const progressBar = document.createElement('div');
            progressBar.style.cssText = 'width: 100%; height: 12px; background: var(--border); border-radius: 6px; overflow: hidden; margin-top: 8px;';
            const progressFill = document.createElement('div');
            progressFill.style.cssText = `width: ${Math.min(progress, 100)}%; height: 100%; background: ${isOverBudget ? 'var(--danger-color)' : 'var(--primary-color)'}; transition: width 0.3s ease;`;
            progressBar.appendChild(progressFill);
            budgetCard.appendChild(progressBar);
            
            const progressText = document.createElement('div');
            progressText.style.cssText = `font-size: 0.85rem; margin-top: 4px; color: ${isOverBudget ? 'var(--danger-color)' : 'var(--text-secondary)'};`;
            if (isOverBudget) {
                progressText.textContent = `⚠️ Over budget by €${(totalPrice - budgetAmount).toFixed(2)} (${progress.toFixed(1)}%)`;
            } else {
                progressText.textContent = `€${totalPrice.toFixed(2)} / €${budgetAmount.toFixed(2)} (${progress.toFixed(1)}%)`;
            }
            budgetCard.appendChild(progressText);
        }
        
        budgetsListEl.appendChild(budgetCard);
    });
}

async function saveBudget(listName, amount) {
    if (!currentUser || !listName || !amount) return;
    
    const budgetData = {
        user_id: currentUser.id,
        list_name: listName,
        budget_amount: parseFloat(amount.toFixed(2))
    };
    
    const existingBudget = listBudgets.find(b => b.list_name === listName);
    
    let error;
    if (existingBudget) {
        // Update existing budget
        const { error: updateError } = await supabase
            .from('list_budgets')
            .update({ budget_amount: budgetData.budget_amount })
            .eq('user_id', currentUser.id)
            .eq('list_name', listName);
        error = updateError;
    } else {
        // Insert new budget
        const { error: insertError } = await supabase
            .from('list_budgets')
            .insert([budgetData]);
        error = insertError;
    }
    
    if (error) {
        console.error('Error saving budget:', error);
        alert('Error saving budget');
    } else {
        await loadListBudgets();
        renderBudgets();
        renderLists();
        showStatus(`Budget for "${listName}" saved`, 'success');
    }
}

async function deleteBudget(listName) {
    if (!currentUser || !listName) return;
    
    if (!confirm(`Remove budget for "${listName}"?`)) return;
    
    const { error } = await supabase
        .from('list_budgets')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('list_name', listName);
    
    if (error) {
        console.error('Error deleting budget:', error);
        alert('Error deleting budget');
    } else {
        await loadListBudgets();
        renderBudgets();
        renderLists();
        showStatus(`Budget for "${listName}" removed`, 'success');
    }
}

// Financial Profile
async function loadFinancialProfile() {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('financial_profiles')
        .select('*')
        .eq('user_id', currentUser.id)
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 error

    if (data && !error) {
        financialProfile = data;
        document.getElementById('incomeType').value = data.income_type;
        document.getElementById('incomeAmount').value = data.income_amount;
        document.getElementById('monthlyExpenses').value = data.monthly_expenses;
        document.getElementById('daysPerMonth').value = data.days_per_month || 20;
        updateProfileSummary();
    }
}

async function saveFinancialProfile() {
    if (!currentUser) return;

    const incomeType = document.getElementById('incomeType').value;
    const incomeAmount = parseFloat(document.getElementById('incomeAmount').value);
    const monthlyExpenses = parseFloat(document.getElementById('monthlyExpenses').value);
    const daysPerMonth = parseInt(document.getElementById('daysPerMonth').value) || 20;

    if (!incomeAmount || !monthlyExpenses) {
        alert('Please fill in all required fields');
        return;
    }

    if (daysPerMonth < 1 || daysPerMonth > 31) {
        alert('Days per month must be between 1 and 31');
        return;
    }

    const profileData = {
        user_id: currentUser.id,
        income_type: incomeType,
        income_amount: incomeAmount,
        monthly_expenses: monthlyExpenses
    };

    // Only include days_per_month if the field exists (for backward compatibility)
    // Try to add it, but if it fails, we'll handle it gracefully
    try {
        profileData.days_per_month = daysPerMonth;
    } catch (e) {
        // Field might not exist in database yet
    }

    // First try to update existing profile
    const { data: existingData } = await supabase
        .from('financial_profiles')
        .select('id')
        .eq('user_id', currentUser.id)
        .maybeSingle();

    let error;
    if (existingData) {
        // Update existing profile
        const { data, err } = await supabase
            .from('financial_profiles')
            .update(profileData)
            .eq('user_id', currentUser.id)
            .select()
            .single();
        error = err;
        if (data) {
            financialProfile = data;
        }
    } else {
        // Insert new profile
        const { data, err } = await supabase
            .from('financial_profiles')
            .insert(profileData)
            .select()
            .single();
        error = err;
        if (data) {
            financialProfile = data;
        }
    }

    if (error) {
        console.error('Error saving profile:', error);
        // Try without days_per_month if it fails
        if (error.message && error.message.includes('days_per_month')) {
            delete profileData.days_per_month;
            const { data, err: retryError } = await supabase
                .from('financial_profiles')
                .upsert(profileData, { onConflict: 'user_id' })
                .select()
                .single();
            if (retryError) {
                alert('Error saving profile. Please run the migration SQL to add the days_per_month field.');
                console.error('Retry error:', retryError);
            } else {
                financialProfile = { ...data, days_per_month: daysPerMonth };
                updateProfileSummary();
                showStatus('Profile saved (days_per_month field not available yet)', 'success');
            }
        } else {
            alert('Error saving profile: ' + (error.message || 'Unknown error'));
        }
    } else {
        updateProfileSummary();
        showStatus('Profile saved successfully!', 'success');
    }
}

function updateProfileSummary() {
    if (!financialProfile) return;

    const summaryEl = document.getElementById('profileSummary');
    summaryEl.classList.remove('hidden');

    const hourlyRate = calculateHourlyRate();
    const disposableIncome = calculateDisposableIncome();

    summaryEl.innerHTML = `
        <h3>Your Financial Summary</h3>
        <p><strong>Hourly Rate:</strong> €${hourlyRate.toFixed(2)}/hour</p>
        <p><strong>Monthly Disposable Income:</strong> €${disposableIncome.toFixed(2)}</p>
    `;
}

function calculateHourlyRate() {
    if (!financialProfile) return 0;

    const { income_type, income_amount, days_per_month } = financialProfile;
    const daysPerMonth = days_per_month || 20;
    const hoursPerDay = 8; // Assuming 8 hours per day
    const hoursPerMonth = daysPerMonth * hoursPerDay;
    
    if (income_type === 'hourly') return income_amount;
    if (income_type === 'monthly') return income_amount / hoursPerMonth;
    if (income_type === 'yearly') return income_amount / (hoursPerMonth * 12);
    
    return 0;
}

function calculateDisposableIncome() {
    if (!financialProfile) return 0;

    const { income_type, income_amount, monthly_expenses, days_per_month } = financialProfile;
    const daysPerMonth = days_per_month || 20;
    const hoursPerDay = 8; // Assuming 8 hours per day
    const hoursPerMonth = daysPerMonth * hoursPerDay;
    
    let monthlyIncome;
    if (income_type === 'hourly') {
        monthlyIncome = income_amount * hoursPerMonth;
    } else if (income_type === 'monthly') {
        monthlyIncome = income_amount;
    } else if (income_type === 'yearly') {
        monthlyIncome = income_amount / 12;
    } else {
        return 0;
    }
    
    return monthlyIncome - monthly_expenses;
}

function calculateHoursToAfford(price) {
    const hourlyRate = calculateHourlyRate();
    if (hourlyRate === 0) return 0;
    return price / hourlyRate;
}

// Goals Management
async function loadGoals() {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading goals:', error);
    } else {
        goals = data || [];
        renderGoals();
    }
}

function renderGoals() {
    const goalsListEl = document.getElementById('goalsList');
    goalsListEl.innerHTML = '';

    goals.forEach(goal => {
        const goalItems = items.filter(item => item.goal_id === goal.id);
        const totalPrice = goalItems.reduce((sum, item) => sum + (item.price || 0), 0);
        const totalHours = calculateHoursToAfford(totalPrice);

        const goalBadge = document.createElement('div');
        goalBadge.className = 'goal-badge';
        goalBadge.innerHTML = `
            <span>${goal.name}</span>
            <span class="goal-stats">€${totalPrice.toFixed(2)} • ${totalHours.toFixed(1)}h</span>
        `;
        goalBadge.addEventListener('click', () => {
            document.getElementById('filterGoal').value = goal.id;
            renderWishlist();
        });
        goalsListEl.appendChild(goalBadge);
    });
}

function showGoalModal() {
    const modal = document.getElementById('goalModal');
    modal.classList.remove('hidden');
    modal.classList.add('show');
    document.getElementById('goalName').value = '';
    document.getElementById('goalDescription').value = '';
}

async function saveGoal() {
    if (!currentUser) return;

    const name = document.getElementById('goalName').value.trim();
    if (!name) {
        alert('Please enter a goal name');
        return;
    }

    const description = document.getElementById('goalDescription').value.trim();

    const { data, error } = await supabase
        .from('goals')
        .insert({
            user_id: currentUser.id,
            name,
            description
        })
        .select()
        .single();

    if (error) {
        console.error('Error saving goal:', error);
        alert('Error creating goal');
    } else {
        goals.push(data);
        renderGoals();
        updateGoalSelects();
        closeModals();
        showStatus('Goal created successfully!', 'success');
    }
}

function updateGoalSelects() {
    const selects = ['detailGoal', 'filterGoal'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        const currentValue = select.value;
        select.innerHTML = selectId === 'filterGoal' 
            ? '<option value="">All Goals</option>'
            : '<option value="">No Goal</option>';
        
        goals.forEach(goal => {
            const option = document.createElement('option');
            option.value = goal.id;
            option.textContent = goal.name;
            select.appendChild(option);
        });
        
        if (currentValue) {
            select.value = currentValue;
        }
    });
}

// Item Management
async function scrapeProduct() {
    const url = document.getElementById('productUrl').value.trim();
    if (!url) {
        alert('Please enter a product URL');
        return;
    }

    const statusEl = document.getElementById('scrapingStatus');
    statusEl.className = 'status-message info';
    statusEl.textContent = 'Scraping product information...';

    try {
        // Try multiple CORS proxies as fallback
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            `https://corsproxy.io/?${encodeURIComponent(url)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
        ];

        let html = null;
        let htmlError = null;

        statusEl.textContent = 'Fetching webpage...';
        
        // Try each proxy until one works
        for (const proxyUrl of proxies) {
            try {
                const htmlResponse = await fetch(proxyUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                
                if (htmlResponse.ok) {
                    html = await htmlResponse.text();
                    if (html && html.length > 100) {
                        break; // Success, exit loop
                    }
                }
            } catch (err) {
                htmlError = err;
                continue; // Try next proxy
            }
        }

        // If all proxies failed, try using Gemini with just the URL
        if (!html || html.length < 100) {
            statusEl.textContent = 'Using AI to analyze URL directly...';
            
            // Fallback: Ask Gemini to extract info from URL directly
            const prompt = `Extract product information from this URL: ${url}

Based on the URL and your knowledge, return ONLY a valid JSON object with this exact structure:
{
  "product_title": "string",
  "price": number (numeric value only, no currency symbols, or null if unknown),
  "main_image_url": "string (full URL or null)",
  "list_of_specifications": ["string", "string", ...],
  "suggested_category": "string (one word category like Tech, Home, Apparel, etc.)"
}

If you cannot determine certain information from the URL, use null for that field. Price should be a number or null.`;

            const responseText = await callGeminiAPI(prompt);
            
            // Extract JSON from response
            let jsonText = responseText.trim();
            if (jsonText.startsWith('```json')) {
                jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```\n?/g, '');
            }
            
            // Try to extract JSON from the response
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }

            const product = JSON.parse(jsonText);
            
            // Validate and clean the data
            if (!product.product_title) {
                product.product_title = 'Unknown Product';
            } else {
                // Truncate title to maximum 7 words
                const words = product.product_title.trim().split(/\s+/);
                if (words.length > 7) {
                    product.product_title = words.slice(0, 7).join(' ');
                }
            }
            
            if (!Array.isArray(product.tags)) {
                product.tags = [];
            }
            
            // Fix image URL if it's relative
            let imageUrl = product.main_image_url || '';
            if (imageUrl) {
                // Clean and validate URL
                imageUrl = imageUrl.trim();
                
                // Fix Power.dk image URLs - convert incorrect domains to correct one
                if (imageUrl.includes('power.dk') || imageUrl.includes('power-cdn.net')) {
                    // Replace incorrect Power.dk CDN domains with correct one
                    imageUrl = imageUrl
                        .replace(/https?:\/\/cdn\.power\.dk\//g, 'https://media.power-cdn.net/')
                        .replace(/https?:\/\/images\.power-cdn\.net\//g, 'https://media.power-cdn.net/images/')
                        .replace(/https?:\/\/assets\.power-cdn\.net\//g, 'https://media.power-cdn.net/images/');
                    
                    console.log('Power.dk product detected, fixing image URL domain');
                }
                
                // If relative URL, convert to absolute
                if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
                    try {
                        const urlObj = new URL(url);
                        if (imageUrl.startsWith('/')) {
                            imageUrl = urlObj.origin + imageUrl;
                        } else {
                            imageUrl = urlObj.origin + '/' + imageUrl;
                        }
                    } catch (e) {
                        console.warn('Could not convert relative image URL:', e);
                        imageUrl = ''; // Clear invalid URL
                    }
                }
                
                // Validate URL format
                try {
                    new URL(imageUrl); // This will throw if URL is invalid
                } catch (e) {
                    console.warn('Invalid image URL format:', imageUrl);
                    imageUrl = ''; // Clear invalid URL
                }
            }
            
            // Pre-fill the item details form
            document.getElementById('detailTitle').value = product.product_title || '';
            document.getElementById('detailPrice').value = product.price ? parseFloat(product.price).toFixed(2) : '';
            document.getElementById('detailImageUrl').value = imageUrl;
            document.getElementById('detailPurchaseLink').value = url; // Use the scraped URL as purchase link
            updateImagePreview(imageUrl); // Show image preview
            document.getElementById('detailSpecs').value = Array.isArray(product.list_of_specifications) 
                ? product.list_of_specifications.join('\n')
                : product.list_of_specifications || '';
            document.getElementById('detailCategory').value = product.suggested_category || '';
            document.getElementById('detailList').value = '';
            
            // Generate tags if not provided or empty
            let tagsValue = '';
            if (Array.isArray(product.tags) && product.tags.length > 0) {
                tagsValue = product.tags.join(', ');
            } else {
                // Generate tags from category and title if not provided
                const generatedTags = [];
                if (product.suggested_category) {
                    generatedTags.push(product.suggested_category.toLowerCase());
                }
                if (product.product_title) {
                    // Extract brand name (usually first word)
                    const titleWords = product.product_title.split(' ');
                    if (titleWords.length > 0) {
                        generatedTags.push(titleWords[0].toLowerCase());
                    }
                    // Extract key words from title
                    const keywords = product.product_title.toLowerCase().match(/\b(laptop|pc|computer|gaming|16|inch|acer|nitro)\b/g);
                    if (keywords) {
                        generatedTags.push(...keywords.filter((v, i, a) => a.indexOf(v) === i));
                    }
                }
                tagsValue = generatedTags.slice(0, 5).join(', ');
            }
            document.getElementById('detailTags').value = tagsValue;
            console.log('Tags extracted (fallback):', product.tags, 'Tags value:', tagsValue); // Debug

            // Show the item details form
            document.getElementById('itemDetailsForm').classList.remove('hidden');
            document.getElementById('productUrl').value = '';

            statusEl.className = 'status-message success';
            statusEl.textContent = 'Product information extracted! Please review and save.';
            return;
        }

        // Extract text content from HTML
        const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .substring(0, 50000); // Limit to 50k chars

        // If content extraction failed, use Gemini fallback
        if (textContent.length < 100) {
            statusEl.textContent = 'Using AI to analyze URL directly...';
            
            // Fallback: Ask Gemini to extract info from URL directly
            const prompt = `Extract product information from this URL: ${url}

Based on the URL and your knowledge, return ONLY a valid JSON object with this exact structure:
{
  "product_title": "string (MAXIMUM 7 words - keep it short and concise)",
  "price": number (numeric value in EUR, or null if unknown - convert from other currencies if needed),
  "main_image_url": "string (full absolute URL starting with http:// or https://, or null)",
  "list_of_specifications": ["string in English", "string in English", ...],
  "suggested_category": "string (one word category like Tech, Home, Apparel, etc.)",
  "tags": ["tag1", "tag2", "tag3"]
}

IMPORTANT REQUIREMENTS:
- Product Title: MUST be maximum 7 words. Extract the most important words from the product name in the URL. Keep it concise.
- Price: For Amazon URLs, try to estimate or look up the typical price range for this product. Convert to EUR if needed (1 EUR ≈ 7.5 DKK for Danish sites, 1 EUR ≈ 1.1 USD). If truly unknown, use null.
- Specifications: ALL must be in English
- Tags: Generate 3-5 relevant tags (brand, product type, key features)

If you cannot determine certain information from the URL, use null for that field. Price should be a number or null.`;

            const responseText = await callGeminiAPI(prompt);
            
            // Extract JSON from response
            let jsonText = responseText.trim();
            if (jsonText.startsWith('```json')) {
                jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```\n?/g, '');
            }
            
            // Try to extract JSON from the response
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }

            const product = JSON.parse(jsonText);
            
            // Pre-fill the item details form
            document.getElementById('detailTitle').value = product.product_title || '';
            document.getElementById('detailPrice').value = product.price ? parseFloat(product.price).toFixed(2) : '';
            document.getElementById('detailImageUrl').value = product.main_image_url || '';
            document.getElementById('detailPurchaseLink').value = url; // Use the scraped URL as purchase link
            document.getElementById('detailSpecs').value = Array.isArray(product.list_of_specifications) 
                ? product.list_of_specifications.join('\n')
                : product.list_of_specifications || '';
            document.getElementById('detailCategory').value = product.suggested_category || '';
            document.getElementById('detailList').value = '';

            // Show the item details form
            document.getElementById('itemDetailsForm').classList.remove('hidden');
            document.getElementById('productUrl').value = '';

            statusEl.className = 'status-message success';
            statusEl.textContent = 'Product information extracted! Please review and save.';
            return;
        }

        statusEl.textContent = 'Analyzing with AI...';

        // Call Gemini API to extract product information
        const prompt = `Extract product information from the following webpage content. Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks, just pure JSON):
{
  "product_title": "string (MAXIMUM 7 words - keep it short and concise)",
  "price": number (numeric value only, no currency symbols - extract the actual current price, convert to EUR if needed),
  "main_image_url": "string (full absolute URL starting with http:// or https://)",
  "list_of_specifications": ["string in English", "string in English", ...],
  "suggested_category": "string (one word category like Tech, Home, Apparel, etc.)",
  "tags": ["tag1", "tag2", "tag3"]
}

IMPORTANT REQUIREMENTS:
- Product Title: MUST be maximum 7 words. Extract the most important words from the full title. Keep it concise and clear.
- Price: CRITICAL - Extract the actual current price. For Amazon, look for price patterns like "€", "EUR", "$", "USD", etc. Search thoroughly in the content for price information. Convert to EUR if needed (1 EUR ≈ 7.5 DKK, 1 EUR ≈ 1.1 USD). If price is not found, use null.
- Image URL: CRITICAL - For Power.dk websites, look for image URLs containing "media.power-cdn.net" (NOT "cdn.power.dk", "images.power-cdn.net", or "assets.power-cdn.net"). For Amazon, look for images.amazon.com or m.media-amazon.com URLs. Extract the MAIN product image, not thumbnails. Must be a complete absolute URL.
- Specifications: ALL specifications must be in English. Translate any non-English text to English.
- Tags: Generate 3-5 relevant tags based on the product (e.g., for a laptop: "laptop", "gaming", "acer", "16-inch", "gpu"). Include brand name, product type, key features.

Webpage URL: ${url}
Webpage content:
${textContent.substring(0, 40000)}

If you cannot find certain information, use null for that field. Price should be a number or null. Return ONLY the JSON object, nothing else.`;

        const responseText = await callGeminiAPI(prompt);

        // Extract JSON from response (handle markdown code blocks and other formats)
        let jsonText = responseText.trim();
        
        // Remove markdown code blocks
        if (jsonText.includes('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.includes('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }
        
        // Try to extract JSON object if it's embedded in text
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonText = jsonMatch[0];
        }

        let product;
        try {
            product = JSON.parse(jsonText);
        } catch (parseError) {
            // If JSON parsing fails, try to fix common issues
            jsonText = jsonText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            product = JSON.parse(jsonText);
        }

        // Validate and clean the data
        if (!product.product_title) {
            product.product_title = 'Unknown Product';
        } else {
            // Truncate title to maximum 7 words
            const words = product.product_title.trim().split(/\s+/);
            if (words.length > 7) {
                product.product_title = words.slice(0, 7).join(' ');
            }
        }
        if (typeof product.price !== 'number' || isNaN(product.price)) {
            product.price = 0;
        } else {
            // Ensure price is properly formatted
            product.price = parseFloat(product.price.toFixed(2));
        }
        if (!Array.isArray(product.list_of_specifications)) {
            product.list_of_specifications = [];
        }
        if (!Array.isArray(product.tags)) {
            product.tags = [];
        }

        // Fix image URL if it's relative
        let imageUrl = product.main_image_url || '';
        if (imageUrl) {
            // Clean and validate URL
            imageUrl = imageUrl.trim();
            
            // Fix Power.dk image URLs - convert incorrect domains to correct one
            if (imageUrl.includes('power.dk') || imageUrl.includes('power-cdn.net')) {
                // Extract product ID from the original URL
                const productIdMatch = url.match(/\/p-(\d+)/);
                
                if (productIdMatch) {
                    const productId = productIdMatch[1];
                    
                    // If URL is from cdn.power.dk or wrong domain, we need to find the correct one
                    // The correct pattern is: https://media.power-cdn.net/images/h-[hash]/products/[product_id]/[product_id]_[number]_[size].webp
                    if (imageUrl.includes('cdn.power.dk') || imageUrl.includes('images.power-cdn.net') || imageUrl.includes('assets.power-cdn.net')) {
                        // Try to extract hash and image details from the HTML content if available
                        // For now, log that we need the correct URL from Gemini
                        console.log('Power.dk product detected with incorrect image URL. Gemini should extract the correct media.power-cdn.net URL.');
                        // Keep the URL but note that it needs to be fixed by Gemini's extraction
                    }
                }
                
                // Replace incorrect Power.dk CDN domains with correct one (basic fix)
                imageUrl = imageUrl
                    .replace(/https?:\/\/cdn\.power\.dk\//g, 'https://media.power-cdn.net/')
                    .replace(/https?:\/\/images\.power-cdn\.net\//g, 'https://media.power-cdn.net/images/')
                    .replace(/https?:\/\/assets\.power-cdn\.net\//g, 'https://media.power-cdn.net/images/');
            }
            
            // If relative URL, convert to absolute
            if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
                try {
                    const urlObj = new URL(url);
                    if (imageUrl.startsWith('/')) {
                        imageUrl = urlObj.origin + imageUrl;
                    } else {
                        imageUrl = urlObj.origin + '/' + imageUrl;
                    }
                } catch (e) {
                    console.warn('Could not convert relative image URL:', e);
                    imageUrl = ''; // Clear invalid URL
                }
            }
            
            // Validate URL format
            try {
                new URL(imageUrl); // This will throw if URL is invalid
            } catch (e) {
                console.warn('Invalid image URL format:', imageUrl);
                imageUrl = ''; // Clear invalid URL
            }
        }

        // Pre-fill the item details form
        document.getElementById('detailTitle').value = product.product_title || '';
        document.getElementById('detailPrice').value = product.price ? parseFloat(product.price).toFixed(2) : '';
        document.getElementById('detailImageUrl').value = imageUrl;
        document.getElementById('detailPurchaseLink').value = url; // Use the scraped URL as purchase link
        updateImagePreview(imageUrl); // Show image preview
        document.getElementById('detailSpecs').value = Array.isArray(product.list_of_specifications) 
            ? product.list_of_specifications.join('\n')
            : product.list_of_specifications || '';
        document.getElementById('detailCategory').value = product.suggested_category || '';
        document.getElementById('detailList').value = '';
        
        // Generate tags if not provided or empty
        let tagsValue = '';
        if (Array.isArray(product.tags) && product.tags.length > 0) {
            tagsValue = product.tags.join(', ');
        } else {
            // Generate tags from category and title if not provided
            const generatedTags = [];
            if (product.suggested_category) {
                generatedTags.push(product.suggested_category.toLowerCase());
            }
            if (product.product_title) {
                // Extract brand name (usually first word)
                const titleWords = product.product_title.split(' ');
                if (titleWords.length > 0) {
                    generatedTags.push(titleWords[0].toLowerCase());
                }
                // Extract key words from title
                const keywords = product.product_title.toLowerCase().match(/\b(laptop|pc|computer|gaming|16|inch|acer|nitro)\b/g);
                if (keywords) {
                    generatedTags.push(...keywords.filter((v, i, a) => a.indexOf(v) === i));
                }
            }
            tagsValue = generatedTags.slice(0, 5).join(', ');
        }
        document.getElementById('detailTags').value = tagsValue;
        console.log('Tags extracted:', product.tags, 'Tags value:', tagsValue); // Debug

        // Show the item details form
        document.getElementById('itemDetailsForm').classList.remove('hidden');
        document.getElementById('productUrl').value = '';

        statusEl.className = 'status-message success';
        statusEl.textContent = 'Product scraped successfully! Please review and save.';
    } catch (error) {
        console.error('Error scraping product:', error);
        statusEl.className = 'status-message error';
        
        // Show more specific error message
        let errorMsg = 'Error scraping product. ';
        if (error.message) {
            const msg = error.message.toLowerCase();
            if (msg.includes('overloaded') || msg.includes('quota') || msg.includes('rate limit')) {
                errorMsg = '⚠️ Model is currently overloaded. The system will retry automatically, but you may need to wait a moment and try again. Alternatively, use manual entry.';
            } else {
                errorMsg += error.message;
            }
        } else {
            errorMsg += 'Please try manual entry or check the browser console for details.';
        }
        statusEl.textContent = errorMsg;
    }
}

function showManualItemForm() {
    // Clear form
    document.getElementById('detailTitle').value = '';
    document.getElementById('detailPrice').value = '';
    document.getElementById('detailImageUrl').value = '';
    document.getElementById('detailPurchaseLink').value = '';
    document.getElementById('detailSpecs').value = '';
    document.getElementById('detailCategory').value = '';
    document.getElementById('detailPriority').value = 'medium';
    document.getElementById('detailTags').value = '';
    document.getElementById('detailGoal').value = '';
    document.getElementById('detailList').value = '';
    
    currentEditingItem = null;
    document.getElementById('itemDetailsForm').classList.remove('hidden');
}

async function saveItem() {
    if (!currentUser) return;

    const title = document.getElementById('detailTitle').value.trim();
    const price = parseFloat(document.getElementById('detailPrice').value);
    const imageUrl = document.getElementById('detailImageUrl').value.trim();
    const purchaseLink = document.getElementById('detailPurchaseLink').value.trim();
    const specs = document.getElementById('detailSpecs').value.trim().split('\n').filter(s => s.trim());
    const category = document.getElementById('detailCategory').value.trim();
    const priority = document.getElementById('detailPriority').value;
    const tags = document.getElementById('detailTags').value.trim().split(',').map(t => t.trim()).filter(t => t);
    const goalId = document.getElementById('detailGoal').value || null;
    const listName = document.getElementById('detailList').value.trim() || null;

    if (!title || isNaN(price) || price <= 0) {
        alert('Please enter a valid title and price');
        return;
    }

    const itemData = {
        user_id: currentUser.id,
        title,
        price: parseFloat(price.toFixed(2)), // Ensure consistent price format
        image_url: imageUrl,
        purchase_link: purchaseLink || null,
        specifications: specs,
        category: category || null,
        priority,
        tags,
        goal_id: goalId,
        list_name: listName
    };

    let error;
    if (currentEditingItem) {
        // Update existing item
        const { data, err } = await supabase
            .from('items')
            .update(itemData)
            .eq('id', currentEditingItem.id)
            .select()
            .single();
        error = err;
        if (data) {
            const index = items.findIndex(i => i.id === currentEditingItem.id);
            if (index !== -1) items[index] = data;
        }
    } else {
        // Insert new item
        const { data, err } = await supabase
            .from('items')
            .insert(itemData)
            .select()
            .single();
        error = err;
        if (data) items.push(data);
    }

    if (error) {
        console.error('Error saving item:', error);
        alert('Error saving item');
    } else {
        cancelItemForm();
        updateCategoryFilter();
        updateListSelectors();
        renderLists();
        renderWishlist();
        showStatus('Item saved successfully!', 'success');
    }
}

function cancelItemForm() {
    document.getElementById('itemDetailsForm').classList.add('hidden');
    currentEditingItem = null;
    // Clear all form fields
    document.getElementById('productUrl').value = '';
    document.getElementById('scrapingStatus').textContent = '';
    document.getElementById('detailTitle').value = '';
    document.getElementById('detailPrice').value = '';
    document.getElementById('detailImageUrl').value = '';
    document.getElementById('detailPurchaseLink').value = '';
    document.getElementById('detailSpecs').value = '';
    document.getElementById('detailCategory').value = '';
    document.getElementById('detailPriority').value = 'medium';
    document.getElementById('detailTags').value = '';
    document.getElementById('detailGoal').value = '';
    document.getElementById('detailList').value = '';
    // Clear image preview
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('previewImage').src = '';
}

async function loadItems() {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading items:', error);
        items = [];
    } else {
        items = data || [];
        // Log items with current_price for debugging
        const itemsWithPriceTracking = items.filter(item => item.current_price);
        if (itemsWithPriceTracking.length > 0) {
            console.log('Items with price tracking:', itemsWithPriceTracking.map(item => ({
                title: item.title,
                price: item.price,
                current_price: item.current_price,
                difference: item.current_price - item.price
            })));
        }
    }
}

async function loadListBudgets() {
    if (!currentUser) return;

    const { data, error } = await supabase
        .from('list_budgets')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('list_name', { ascending: true });

    if (error) {
        console.error('Error loading budgets:', error);
        listBudgets = [];
    } else {
        listBudgets = data || [];
    }
}

// Price Tracking - Check prices daily for items with purchase links
async function checkPricesDaily(forceCheck = false) {
    if (!currentUser) return;
    
    const statusEl = document.getElementById('priceCheckStatus');
    const checkBtn = document.getElementById('checkPricesBtn');
    
    // Get items with purchase links that need price checking
    const itemsToCheck = items.filter(item => {
        if (!item.purchase_link) return false;
        
        // If forcing check, check all items with purchase links
        if (forceCheck) return true;
        
        // Otherwise, check if we need to update (never checked or last check was more than 24 hours ago)
        if (!item.last_price_check) return true;
        
        const lastCheck = new Date(item.last_price_check);
        const now = new Date();
        const hoursSinceCheck = (now - lastCheck) / (1000 * 60 * 60);
        
        return hoursSinceCheck >= 24;
    });
    
    if (itemsToCheck.length === 0) {
        if (forceCheck) {
            statusEl.style.display = 'block';
            statusEl.className = 'status-message info';
            statusEl.textContent = 'No items with purchase links to check.';
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
        return;
    }
    
    // Show status message
    if (forceCheck) {
        statusEl.style.display = 'block';
        statusEl.className = 'status-message info';
        statusEl.textContent = `Checking prices for ${itemsToCheck.length} item(s)...`;
        checkBtn.disabled = true;
        checkBtn.textContent = 'Checking...';
    }
    
    // Check prices for items (limit to 10 at a time when forced, 5 for automatic)
    const limit = forceCheck ? 10 : 5;
    const itemsToUpdate = itemsToCheck.slice(0, limit);
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < itemsToUpdate.length; i++) {
        const item = itemsToUpdate[i];
        try {
            if (forceCheck) {
                statusEl.textContent = `Checking ${i + 1}/${itemsToUpdate.length}: ${item.title}...`;
            }
            await checkItemPrice(item);
            successCount++;
            // Add a longer delay between requests to avoid rate limiting (3 seconds)
            // The callGeminiAPI function also has its own rate limiting, but this adds extra safety
            if (i < itemsToUpdate.length - 1) { // Don't wait after the last item
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (error) {
            console.error(`Error checking price for item ${item.id}:`, error);
            failCount++;
            // If it's a rate limit error, wait longer before continuing
            const errorMsg = error.message || String(error);
            if (errorMsg.toLowerCase().includes('overloaded') || 
                errorMsg.toLowerCase().includes('quota') ||
                errorMsg.toLowerCase().includes('rate limit')) {
                if (forceCheck) {
                    statusEl.textContent = `Rate limited. Waiting before continuing...`;
                }
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                // Regular error, shorter delay
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    // Reload items to get updated prices
    await loadItems();
    renderWishlist();
    
    // Update status message
    if (forceCheck) {
        if (successCount > 0) {
            statusEl.className = 'status-message success';
            statusEl.textContent = `✓ Successfully checked ${successCount} item(s)${failCount > 0 ? ` (${failCount} failed)` : ''}.`;
        } else {
            statusEl.className = 'status-message error';
            // Check if failures were due to rate limiting
            const hasRateLimitErrors = failCount > 0;
            if (hasRateLimitErrors) {
                statusEl.textContent = `⚠️ Model overloaded. Please wait a few minutes and try again. The system automatically retries, but too many requests were made.`;
            } else {
                statusEl.textContent = `✗ Failed to check prices. Please try again later.`;
            }
        }
        checkBtn.disabled = false;
        checkBtn.textContent = '🔍 Check Prices Now';
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 8000); // Show longer for rate limit messages
    }
}

async function checkItemPrice(item) {
    if (!item.purchase_link) return;
    
    try {
        // Use the same scraping logic as scrapeProduct
        const url = item.purchase_link;
        
        // Try using Supabase Edge Function first (skip if running from file:// protocol)
        const isFileProtocol = window.location.protocol === 'file:' || window.location.origin === 'null' || !window.location.origin;
        
        if (!isFileProtocol) {
            try {
                const supabaseProjectUrl = supabase.supabaseUrl;
                const edgeFunctionUrl = `${supabaseProjectUrl}/functions/v1/scrape-product`;
                
                const session = await supabase.auth.getSession();
                const response = await fetch(edgeFunctionUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.data.session?.access_token || ''}`
                    },
                    body: JSON.stringify({ url })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.product) {
                        const price = result.product.price;
                        // Check if price exists and is valid (> 0)
                        if (price !== null && price !== undefined && !isNaN(price) && price > 0) {
                            const newPrice = parseFloat(price);
                            await updateItemPrice(item.id, newPrice);
                            console.log(`✓ Price updated via Edge Function for ${item.title}: €${newPrice.toFixed(2)} (original: €${(item.price || 0).toFixed(2)})`);
                            return;
                        } else {
                            console.log(`Edge function returned invalid price (${price}) for ${item.title}, trying Gemini API...`);
                        }
                    } else {
                        console.log(`Edge function returned unsuccessful result for ${item.title}, trying Gemini API...`);
                    }
                } else {
                    const errorText = await response.text().catch(() => '');
                    console.log(`Edge function returned status ${response.status} for ${item.title}, trying Gemini API...`, errorText);
                }
            } catch (edgeError) {
                console.log('Edge function failed, trying Gemini API...', edgeError.message || edgeError);
            }
        } else {
            console.log('Skipping edge function (file:// protocol detected), using Gemini API directly...');
        }
        
        // Use Gemini API directly - it can access websites without needing CORS proxies
        // This is more reliable than CORS proxies which often fail
        console.log(`Using Gemini API to extract price from: ${url}`);
        const prompt = `${url}

IMPORTANT INSTRUCTIONS:
1. Visit the URL and find the current price of the product
2. Look for price information in formats like: "€XX.XX", "EUR XX.XX", "DKK XXX" (Danish krone), "$XX.XX" (USD), "£XX.XX" (GBP)
3. For Danish sites (power.dk, elgiganten.dk, etc.), prices are usually in DKK (Danish krone)
4. Convert to EUR using: 1 EUR = 7.5 DKK (approximately)
5. For USD: 1 EUR = 1.1 USD (approximately)
6. For GBP: 1 EUR = 0.85 GBP (approximately)
7. Extract ONLY the current/active price, not crossed-out prices or old prices
8. If the product has multiple prices (regular, sale, etc.), use the lowest/current active price

Return ONLY a JSON object with this exact format (no markdown, no code blocks, just pure JSON):
{
  "price": number (numeric value in EUR, or null if price cannot be found)
}

Example for a product priced at 7,499 DKK: {"price": 999.87} (7499 / 7.5 = 999.87 EUR)
Example for a product priced at €99.99: {"price": 99.99}
Example if price not found: {"price": null}`;
        
        try {
            const responseText = await callGeminiAPI(prompt);
            let jsonText = responseText.trim();
            
            // Clean up JSON response
            if (jsonText.includes('```json')) {
                jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            } else if (jsonText.includes('```')) {
                jsonText = jsonText.replace(/```\n?/g, '');
            }
            
            // Extract JSON object
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[0];
            }
            
            const product = JSON.parse(jsonText);
            // Check if price exists and is valid (> 0)
            if (product && product.price !== null && product.price !== undefined && !isNaN(product.price) && product.price > 0) {
                const newPrice = parseFloat(product.price);
                console.log(`✓ Price extracted for ${item.title}: €${newPrice.toFixed(2)} (original: €${(item.price || 0).toFixed(2)})`);
                await updateItemPrice(item.id, newPrice);
                return;
            } else {
                console.log(`✗ No valid price found for ${item.title} - Gemini returned: ${JSON.stringify(product)}`);
                throw new Error(`Could not extract price for ${item.title} - price was ${product?.price || 'missing'}`);
            }
        } catch (parseError) {
            console.error(`Error parsing Gemini response for ${item.title}:`, parseError);
            // Log the actual response for debugging
            let errorMsg = `Failed to parse price data for ${item.title}`;
            if (parseError.message) {
                errorMsg += `: ${parseError.message}`;
            }
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error(`Error checking price for item ${item.id} (${item.title}):`, error.message || error);
        throw error; // Re-throw to be caught by checkPricesDaily
    }
}

async function updateItemPrice(itemId, newPrice) {
    if (!currentUser) return;
    
    const priceValue = parseFloat(newPrice);
    if (isNaN(priceValue) || priceValue <= 0) {
        console.error('Invalid price value:', newPrice);
        return;
    }
    
    const { error } = await supabase
        .from('items')
        .update({
            current_price: priceValue,
            last_price_check: new Date().toISOString()
        })
        .eq('id', itemId)
        .eq('user_id', currentUser.id);
    
    if (error) {
        console.error('Error updating item price:', error);
        throw error;
    } else {
        // Update local item
        const item = items.find(i => i.id === itemId);
        if (item) {
            item.current_price = priceValue;
            item.last_price_check = new Date().toISOString();
            console.log(`Local item updated: ${item.title} - current_price: ${item.current_price}, price: ${item.price}`);
        }
    }
}

function renderWishlist() {
    const container = document.getElementById('wishlistItems');
    container.innerHTML = '';

    // Get filters
    const sortBy = document.getElementById('sortBy').value;
    const viewList = document.getElementById('viewList').value.trim(); // Main list view selector
    const filterCategory = document.getElementById('filterCategory').value;
    const filterGoal = document.getElementById('filterGoal').value;
    const filterPriority = document.getElementById('filterPriority').value;
    const filterList = document.getElementById('filterList').value.trim();
    const searchQuery = document.getElementById('searchItems').value.trim().toLowerCase();

    // Filter items - viewList takes priority (shows only one list at a time)
    let filteredItems = [...items];
    
    // If viewList is set, only show items from that list
    if (viewList) {
        filteredItems = filteredItems.filter(item => item.list_name === viewList);
    }
    
    // Apply additional filters
    if (filterCategory) {
        filteredItems = filteredItems.filter(item => item.category === filterCategory);
    }
    
    if (filterGoal) {
        filteredItems = filteredItems.filter(item => item.goal_id === filterGoal);
    }
    
    if (filterPriority) {
        filteredItems = filteredItems.filter(item => item.priority === filterPriority);
    }
    
    // filterList is only used if viewList is not set
    if (filterList && !viewList) {
        filteredItems = filteredItems.filter(item => item.list_name === filterList);
    }
    
    // Apply search filter
    if (searchQuery) {
        filteredItems = filteredItems.filter(item => {
            const titleMatch = item.title?.toLowerCase().includes(searchQuery);
            const categoryMatch = item.category?.toLowerCase().includes(searchQuery);
            const tagsMatch = Array.isArray(item.tags) && item.tags.some(tag => tag.toLowerCase().includes(searchQuery));
            return titleMatch || categoryMatch || tagsMatch;
        });
    }

    // Sort items
    filteredItems.sort((a, b) => {
        switch (sortBy) {
            case 'price-desc':
                return (b.price || 0) - (a.price || 0);
            case 'price-asc':
                return (a.price || 0) - (b.price || 0);
            case 'name':
                return (a.title || '').localeCompare(b.title || '');
            case 'priority':
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
            default: // date
                return new Date(b.created_at) - new Date(a.created_at);
        }
    });

    // Render items
    filteredItems.forEach(item => {
        const itemCard = createItemCard(item);
        container.appendChild(itemCard);
    });

    // Update stats
    updateWishlistStats(filteredItems);
}

function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'wishlist-item';
    
    const hours = calculateHoursToAfford(item.price || 0);
    const priorityClass = `priority-${item.priority || 'medium'}`;
    
    // Normalize prices to numbers for comparison
    const originalPrice = parseFloat(item.price) || 0;
    const currentPrice = item.current_price ? parseFloat(item.current_price) : null;
    
    // Check if prices are different (account for floating point precision)
    const priceDifference = currentPrice !== null && Math.abs(currentPrice - originalPrice) > 0.01;
    
    card.innerHTML = `
        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" class="item-image" loading="lazy">` : ''}
        <div class="item-content">
            <div class="item-header">
                <div class="item-title">${escapeHtml(item.title)}</div>
                <span class="priority-badge ${priorityClass}">${(item.priority || 'medium').toUpperCase()}</span>
            </div>
            <div class="item-price">
                €${originalPrice.toFixed(2)}
                ${getShowTrackedPrices() && priceDifference ? `
                    <span style="font-size: 0.75em; margin-left: 8px; color: ${currentPrice < originalPrice ? 'var(--success-color, #10b981)' : 'var(--danger-color)'};">
                        (€${currentPrice.toFixed(2)})
                    </span>
                ` : ''}
            </div>
            <div class="item-hours">⏱️ ${hours.toFixed(1)} hours of work</div>
            ${item.category ? `<span class="item-category">${escapeHtml(item.category)}</span>` : ''}
            ${item.list_name ? `<span class="item-list" style="display: inline-block; margin-top: 4px; padding: 2px 8px; background: var(--background); border-radius: 4px; font-size: 0.85rem; color: var(--text-secondary);">📋 ${escapeHtml(item.list_name)}</span>` : ''}
            <div class="item-actions">
                ${item.purchase_link ? `<button class="btn btn-primary purchase-link-btn" data-link="${escapeHtml(item.purchase_link)}" style="margin-bottom: 4px;">🛒 Buy Now</button>` : ''}
                <button class="btn btn-secondary view-item-btn" data-id="${item.id}">View Details</button>
                <button class="btn btn-secondary find-alternatives-btn" data-id="${item.id}">Find Alternatives</button>
                <button class="btn btn-secondary edit-item-btn" data-id="${item.id}">Edit</button>
                <button class="btn btn-danger delete-item-btn" data-id="${item.id}">Delete</button>
            </div>
        </div>
    `;

    // Event listeners
    card.querySelector('.view-item-btn').addEventListener('click', () => showItemDetails(item));
    card.querySelector('.find-alternatives-btn').addEventListener('click', () => findAlternatives(item));
    card.querySelector('.edit-item-btn').addEventListener('click', () => editItem(item));
    card.querySelector('.delete-item-btn').addEventListener('click', () => deleteItem(item.id));
    
    // Purchase link button
    const purchaseBtn = card.querySelector('.purchase-link-btn');
    if (purchaseBtn) {
        purchaseBtn.addEventListener('click', (e) => {
            const link = e.target.dataset.link;
            if (link) {
                window.open(link, '_blank');
            }
        });
    }
    
    // Add image error handler
    const img = card.querySelector('.item-image');
    if (img && item.image_url) {
        img.addEventListener('error', function() {
            handleImageError(this, item.image_url);
        });
    }

    return card;
}

function updateWishlistStats(filteredItems) {
    const statsEl = document.getElementById('wishlistStats');
    const totalPrice = filteredItems.reduce((sum, item) => sum + (item.price || 0), 0);
    const totalHours = calculateHoursToAfford(totalPrice);
    const itemCount = filteredItems.length;

    statsEl.innerHTML = `
        <div class="stat-item">
            <div class="stat-label">Total Items</div>
            <div class="stat-value">${itemCount}</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">Total Price</div>
            <div class="stat-value">€${totalPrice.toFixed(2)}</div>
        </div>
        <div class="stat-item">
            <div class="stat-label">Total Hours</div>
            <div class="stat-value">${totalHours.toFixed(1)}h</div>
        </div>
    `;
}

function updateCategoryFilter() {
    const categories = [...new Set(items.map(item => item.category).filter(c => c))];
    const select = document.getElementById('filterCategory');
    const currentValue = select.value;
    
    select.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
    
    if (currentValue && categories.includes(currentValue)) {
        select.value = currentValue;
    }
}

async function showItemDetails(item) {
    const modal = document.getElementById('itemModal');
    const content = document.getElementById('modalContent');
    
    // Load spec summary if not already loaded
    let specSummary = item.spec_summary;
    if (!specSummary && item.specifications && item.specifications.length > 0) {
        specSummary = await generateSpecSummary(item);
    }

    // Normalize prices to numbers for comparison
    const originalPrice = parseFloat(item.price) || 0;
    const currentPrice = item.current_price ? parseFloat(item.current_price) : null;
    const priceDifference = currentPrice !== null && Math.abs(currentPrice - originalPrice) > 0.01;
    
    content.innerHTML = `
        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" class="modal-item-image">` : ''}
        <h2>${escapeHtml(item.title)}</h2>
        <div class="item-price">
            €${originalPrice.toFixed(2)}
            ${showTrackedPrices && priceDifference ? `
                <span style="font-size: 0.75em; margin-left: 8px; color: ${currentPrice < originalPrice ? 'var(--success-color, #10b981)' : 'var(--danger-color)'};">
                    (€${currentPrice.toFixed(2)})
                </span>
            ` : ''}
        </div>
        <div class="item-hours">⏱️ ${calculateHoursToAfford(originalPrice).toFixed(1)} hours of work</div>
        
        ${specSummary ? `
            <div class="spec-summary">
                <h5>Key Features:</h5>
                <ul>
                    ${specSummary.map(spec => `<li>${escapeHtml(spec)}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        
        ${item.specifications && item.specifications.length > 0 ? `
            <div class="modal-specs">
                <h4>Full Specifications:</h4>
                <ul>
                    ${item.specifications.map(spec => `<li>${escapeHtml(spec)}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        
        ${item.category ? `<p><strong>Category:</strong> ${escapeHtml(item.category)}</p>` : ''}
        ${item.list_name ? `<p><strong>List:</strong> ${escapeHtml(item.list_name)}</p>` : ''}
        ${item.purchase_link ? `<p><strong>Purchase Link:</strong> <a href="${escapeHtml(item.purchase_link)}" target="_blank" style="color: var(--primary-color);">${escapeHtml(item.purchase_link)}</a></p>` : ''}
        ${item.tags && item.tags.length > 0 ? `<p><strong>Tags:</strong> ${item.tags.map(t => escapeHtml(t)).join(', ')}</p>` : ''}
    `;
    
    // Add image error handler for modal
    const modalImg = content.querySelector('.modal-item-image');
    if (modalImg && item.image_url) {
        modalImg.addEventListener('error', function() {
            handleModalImageError(this, item.image_url);
        });
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

async function generateSpecSummary(item) {
    if (!item.specifications || item.specifications.length === 0) return null;

    try {
        const specsText = Array.isArray(item.specifications) 
            ? item.specifications.join('\n')
            : item.specifications;

        const prompt = `Given the following product title and specifications, create a clean, concise summary with exactly 3-5 bullet points highlighting the most important features. Return ONLY a JSON array of strings, each string being one bullet point (without the bullet symbol).

Product: ${item.title}

Specifications:
${specsText}

Return format: ["Feature 1", "Feature 2", "Feature 3", ...]`;

        const responseText = await callGeminiAPI(prompt);

        // Extract JSON array from response
        let jsonText = responseText.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const summary = JSON.parse(jsonText);

        if (!Array.isArray(summary)) {
            throw new Error('Invalid response format');
        }

        // Save summary to item
        const cleanSummary = summary.slice(0, 5); // Ensure max 5 items
        await supabase
            .from('items')
            .update({ spec_summary: cleanSummary })
            .eq('id', item.id);

        item.spec_summary = cleanSummary;
        return cleanSummary;
    } catch (error) {
        console.error('Error generating spec summary:', error);
        return null;
    }
}

async function findAlternatives(item) {
    const statusEl = document.getElementById('scrapingStatus');
    statusEl.className = 'status-message info';
    statusEl.textContent = 'Finding alternatives...';

    try {
        const prompt = `Find 3-5 alternative products that are similar to or cheaper alternatives to the following product. Return ONLY a valid JSON array of objects with this exact structure:
[
  {
    "name": "Product name",
    "price": number (estimated price, numeric value only),
    "description": "Brief description or key difference (optional)"
  },
  ...
]

Product to find alternatives for:
- Title: ${item.title}
- Price: €${item.price || 0}
${item.category ? `- Category: ${item.category}` : ''}

Focus on finding products that are either cheaper alternatives or similar quality options. Include estimated prices if possible.`;

        const responseText = await callGeminiAPI(prompt);

        // Extract JSON array from response
        let jsonText = responseText.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const alternatives = JSON.parse(jsonText);

        if (!Array.isArray(alternatives)) {
            throw new Error('Invalid response format');
        }

        // Validate and clean alternatives
        const cleanedAlternatives = alternatives
            .slice(0, 5)
            .map(alt => ({
                name: alt.name || 'Unknown Product',
                price: typeof alt.price === 'number' && !isNaN(alt.price) ? alt.price : null,
                description: alt.description || null,
            }));

        const modal = document.getElementById('itemModal');
        const content = document.getElementById('modalContent');
        
        content.innerHTML = `
            <h2>Alternatives for ${escapeHtml(item.title)}</h2>
            <p>Current Price: €${(item.price || 0).toFixed(2)}</p>
            <div class="alternatives-list">
                ${cleanedAlternatives.map(alt => `
                    <div class="alternative-item">
                        <strong>${escapeHtml(alt.name)}</strong>
                        <span>Estimated Price: €${alt.price ? alt.price.toFixed(2) : 'N/A'}</span>
                        ${alt.description ? `<p style="margin-top: 4px; font-size: 0.9rem; color: var(--text-secondary);">${escapeHtml(alt.description)}</p>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
        
        modal.classList.remove('hidden');
        modal.classList.add('show');
        statusEl.textContent = '';
    } catch (error) {
        console.error('Error finding alternatives:', error);
        statusEl.className = 'status-message error';
        statusEl.textContent = 'Error finding alternatives. Please try again later.';
    }
}

function editItem(item) {
    currentEditingItem = item;
    document.getElementById('detailTitle').value = item.title || '';
    document.getElementById('detailPrice').value = item.price || '';
    document.getElementById('detailImageUrl').value = item.image_url || '';
    document.getElementById('detailPurchaseLink').value = item.purchase_link || '';
    document.getElementById('detailSpecs').value = Array.isArray(item.specifications) 
        ? item.specifications.join('\n')
        : (item.specifications || '');
    document.getElementById('detailCategory').value = item.category || '';
    document.getElementById('detailPriority').value = item.priority || 'medium';
    document.getElementById('detailTags').value = Array.isArray(item.tags) 
        ? item.tags.join(', ')
        : (item.tags || '');
    document.getElementById('detailGoal').value = item.goal_id || '';
    document.getElementById('detailList').value = item.list_name || '';
    
    document.getElementById('itemDetailsForm').classList.remove('hidden');
    document.getElementById('itemDetailsForm').scrollIntoView({ behavior: 'smooth' });
}

async function deleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', itemId);

    if (error) {
        console.error('Error deleting item:', error);
        alert('Error deleting item');
    } else {
        items = items.filter(item => item.id !== itemId);
        updateCategoryFilter();
        updateListSelectors();
        renderLists();
        renderWishlist();
        showStatus('Item deleted successfully!', 'success');
    }
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
        modal.classList.add('hidden');
    });
}

function showStatus(message, type) {
    // Create a temporary status message
    const statusEl = document.createElement('div');
    statusEl.className = `status-message ${type}`;
    statusEl.textContent = message;
    statusEl.style.position = 'fixed';
    statusEl.style.top = '20px';
    statusEl.style.right = '20px';
    statusEl.style.zIndex = '9999';
    statusEl.style.minWidth = '300px';
    document.body.appendChild(statusEl);

    setTimeout(() => {
        statusEl.remove();
    }, 3000);
}

// What-If Scenarios
async function calculateWhatIf() {
    if (!financialProfile) {
        alert('Please set up your financial profile first');
        return;
    }

    const reduceExpenses = parseFloat(document.getElementById('reduceExpenses').value) || 0;
    const increaseIncome = parseFloat(document.getElementById('increaseIncome').value) || 0;

    // Calculate new profile
    const newIncomeAmount = financialProfile.income_amount + increaseIncome;
    const newMonthlyExpenses = financialProfile.monthly_expenses - reduceExpenses;

    const tempProfile = {
        ...financialProfile,
        income_amount: newIncomeAmount,
        monthly_expenses: newMonthlyExpenses
    };

    // Calculate impact
    const oldHourlyRate = calculateHourlyRate();
    const newHourlyRate = calculateHourlyRateForProfile(tempProfile);
    const oldDisposable = calculateDisposableIncome();
    const newDisposable = calculateDisposableIncomeForProfile(tempProfile);

    const resultsEl = document.getElementById('whatifResults');
    resultsEl.classList.remove('hidden');
    
    resultsEl.innerHTML = `
        <h3>Impact Analysis</h3>
        <div class="result-item">
            <strong>Hourly Rate:</strong>
            <span>€${oldHourlyRate.toFixed(2)} → €${newHourlyRate.toFixed(2)}</span>
        </div>
        <div class="result-item">
            <strong>Monthly Disposable Income:</strong>
            <span>€${oldDisposable.toFixed(2)} → €${newDisposable.toFixed(2)}</span>
        </div>
        <div class="result-item">
            <strong>Monthly Change:</strong>
            <span>+€${(newDisposable - oldDisposable).toFixed(2)}</span>
        </div>
        ${goals.length > 0 ? `
            <h4 style="margin-top: 20px;">Goal Impact:</h4>
            ${goals.map(goal => {
                const goalItems = items.filter(item => item.goal_id === goal.id);
                const totalPrice = goalItems.reduce((sum, item) => sum + (item.price || 0), 0);
                const oldHours = totalPrice / (oldHourlyRate || 1);
                const newHours = totalPrice / (newHourlyRate || 1);
                return `
                    <div class="result-item">
                        <strong>${goal.name}:</strong>
                        <span>${oldHours.toFixed(1)}h → ${newHours.toFixed(1)}h (${(oldHours - newHours).toFixed(1)}h saved)</span>
                    </div>
                `;
            }).join('')}
        ` : ''}
    `;
}

function calculateHourlyRateForProfile(profile) {
    const { income_type, income_amount, days_per_month } = profile;
    const daysPerMonth = days_per_month || 20;
    const hoursPerDay = 8; // Assuming 8 hours per day
    const hoursPerMonth = daysPerMonth * hoursPerDay;
    
    if (income_type === 'hourly') return income_amount;
    if (income_type === 'monthly') return income_amount / hoursPerMonth;
    if (income_type === 'yearly') return income_amount / (hoursPerMonth * 12);
    
    return 0;
}

function calculateDisposableIncomeForProfile(profile) {
    const { income_type, income_amount, monthly_expenses, days_per_month } = profile;
    const daysPerMonth = days_per_month || 20;
    const hoursPerDay = 8; // Assuming 8 hours per day
    const hoursPerMonth = daysPerMonth * hoursPerDay;
    
    let monthlyIncome;
    if (income_type === 'hourly') {
        monthlyIncome = income_amount * hoursPerMonth;
    } else if (income_type === 'monthly') {
        monthlyIncome = income_amount;
    } else if (income_type === 'yearly') {
        monthlyIncome = income_amount / 12;
    } else {
        return 0;
    }
    
    return monthlyIncome - monthly_expenses;
}

// Savings Planner
async function calculateSavings() {
    if (!financialProfile) {
        alert('Please set up your financial profile first');
        return;
    }

    const savingsAmount = parseFloat(document.getElementById('savingsAmount').value);
    const savingsFrequency = document.getElementById('savingsFrequency').value;

    if (!savingsAmount || savingsAmount <= 0) {
        alert('Please enter a valid savings amount');
        return;
    }

    const disposableIncome = calculateDisposableIncome();
    const weeklySavings = savingsFrequency === 'weekly' ? savingsAmount : savingsAmount / 4.33;
    const monthlySavings = savingsFrequency === 'monthly' ? savingsAmount : savingsAmount * 4.33;

    const resultsEl = document.getElementById('savingsResults');
    resultsEl.classList.remove('hidden');

    if (goals.length === 0) {
        const totalPrice = items.reduce((sum, item) => sum + (item.price || 0), 0);
        const weeksNeeded = totalPrice / weeklySavings;
        const monthsNeeded = totalPrice / monthlySavings;

        resultsEl.innerHTML = `
            <h3>Savings Timeline</h3>
            <div class="result-item">
                <strong>Total Wishlist Value:</strong>
                <span>€${totalPrice.toFixed(2)}</span>
            </div>
            <div class="result-item">
                <strong>Time to Afford Everything:</strong>
                <span>${weeksNeeded.toFixed(1)} weeks (${monthsNeeded.toFixed(1)} months)</span>
            </div>
        `;
    } else {
        resultsEl.innerHTML = `
            <h3>Savings Timeline by Goal</h3>
            ${goals.map(goal => {
                const goalItems = items.filter(item => item.goal_id === goal.id);
                const totalPrice = goalItems.reduce((sum, item) => sum + (item.price || 0), 0);
                const weeksNeeded = totalPrice / weeklySavings;
                const monthsNeeded = totalPrice / monthlySavings;
                
                return `
                    <div class="result-item">
                        <strong>${goal.name} (€${totalPrice.toFixed(2)}):</strong>
                        <span>${weeksNeeded.toFixed(1)} weeks (${monthsNeeded.toFixed(1)} months)</span>
                    </div>
                `;
            }).join('')}
        `;
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Image preview function
function updateImagePreview(imageUrl) {
    const previewDiv = document.getElementById('imagePreview');
    const previewImg = document.getElementById('previewImage');
    
    if (imageUrl && imageUrl.trim()) {
        previewImg.src = imageUrl;
        previewImg.onerror = function() {
            previewDiv.style.display = 'none';
        };
        previewImg.onload = function() {
            previewDiv.style.display = 'block';
        };
        previewDiv.style.display = 'block';
    } else {
        previewDiv.style.display = 'none';
    }
}

// Make it globally accessible for the oninput handler
window.updateImagePreview = updateImagePreview;

// Handle image loading errors with CORS proxy fallback
function handleImageError(img, originalUrl) {
    console.log('Image failed to load:', originalUrl);
    
    // Check if it's a DNS resolution error (ERR_NAME_NOT_RESOLVED)
    // media.power-cdn.net should work, but images.power-cdn.net and assets.power-cdn.net won't
    if (originalUrl && originalUrl.includes('power-cdn.net')) {
        // Only block if it's NOT the correct media.power-cdn.net domain
        if (!originalUrl.includes('media.power-cdn.net')) {
            console.log('DNS resolution error detected for incorrect Power.dk CDN domain, showing placeholder');
            img.style.display = 'none';
            if (!img.parentNode.querySelector('.item-image-placeholder')) {
                const placeholder = document.createElement('div');
                placeholder.className = 'item-image-placeholder';
                placeholder.style.cssText = 'width: 100%; height: 200px; background: var(--background); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.9rem;';
                placeholder.textContent = 'Image unavailable (CDN blocked)';
                img.parentNode.insertBefore(placeholder, img);
            }
            return;
        }
        // If it's media.power-cdn.net, let it try to load (it should work)
    }
    
    // Try CORS proxy if direct load failed (for CORS issues, not DNS)
    if (originalUrl && !img.src.includes('corsproxy.io') && !img.src.includes('api.allorigins.win')) {
        // Try corsproxy.io first (better for images)
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`;
        console.log('Trying CORS proxy:', proxyUrl);
        img.src = proxyUrl;
        img.onerror = function() {
            console.log('CORS proxy also failed');
            // If proxy also fails, show placeholder
            img.style.display = 'none';
            // Check if placeholder already exists
            if (!img.parentNode.querySelector('.item-image-placeholder')) {
                const placeholder = document.createElement('div');
                placeholder.className = 'item-image-placeholder';
                placeholder.style.cssText = 'width: 100%; height: 200px; background: var(--background); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.9rem;';
                placeholder.textContent = 'Image unavailable';
                img.parentNode.insertBefore(placeholder, img);
            }
        };
    } else {
        // Already tried proxy, hide image and show placeholder
        console.log('All image loading attempts failed');
        img.style.display = 'none';
        if (!img.parentNode.querySelector('.item-image-placeholder')) {
            const placeholder = document.createElement('div');
            placeholder.className = 'item-image-placeholder';
            placeholder.style.cssText = 'width: 100%; height: 200px; background: var(--background); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 0.9rem;';
            placeholder.textContent = 'Image unavailable';
            img.parentNode.insertBefore(placeholder, img);
        }
    }
}

// Make it globally accessible
window.handleImageError = handleImageError;

// Handle modal image errors
function handleModalImageError(img, originalUrl) {
    console.log('Modal image failed to load:', originalUrl);
    
    // Try CORS proxy if direct load failed
    if (originalUrl && !img.src.includes('corsproxy.io') && !img.src.includes('api.allorigins.win')) {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(originalUrl)}`;
        console.log('Trying CORS proxy for modal:', proxyUrl);
        img.src = proxyUrl;
        img.onerror = function() {
            console.log('CORS proxy failed for modal image');
            img.style.display = 'none';
        };
    } else {
        img.style.display = 'none';
    }
}

window.handleModalImageError = handleModalImageError;

