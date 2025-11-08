// Supabase Configuration
const SUPABASE_URL = 'https://monztwavozrgqksehmmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vbnp0d2F2b3pyZ3Frc2VobW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2MTMxOTUsImV4cCI6MjA3ODE4OTE5NX0.T_niVGPdZvlqzMg5XratajbfkcCNTfWuFCWlgu3zHc8';

// Gemini API Configuration
const GEMINI_API_KEY = 'AIzaSyDRkO31dq3n5R5KUFVbLgEXQF9yXrx455c';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Helper function to call Gemini API
async function callGeminiAPI(prompt) {
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
        throw new Error(`Gemini API error: ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
        throw new Error('No response from Gemini API');
    }

    return responseText;
}

// State
let currentUser = null;
let items = [];
let goals = [];
let financialProfile = null;
let currentEditingItem = null;

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
    setupEventListeners();
    await loadData();
});

// Initialize app
async function initializeApp() {
    // Check for existing session
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
    } else {
        // Create anonymous user
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
            console.error('Error creating anonymous session:', error);
            // Show user-friendly error message
            if (error.message && error.message.includes('Anonymous sign-ins are disabled')) {
                alert('⚠️ Anonymous sign-ins are disabled in Supabase.\n\nPlease enable it:\n1. Go to Supabase Dashboard\n2. Authentication → Providers\n3. Enable "Anonymous" sign-ins\n4. Refresh this page');
            } else {
                alert('⚠️ Authentication error. Some features may not work. Please check your Supabase settings.');
            }
        } else {
            currentUser = data.user;
        }
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
    document.getElementById('filterCategory').addEventListener('change', renderWishlist);
    document.getElementById('filterGoal').addEventListener('change', renderWishlist);
    document.getElementById('filterPriority').addEventListener('change', renderWishlist);

    // What-if and savings
    document.getElementById('calculateWhatIf').addEventListener('click', calculateWhatIf);
    document.getElementById('calculateSavings').addEventListener('click', calculateSavings);

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

// Load all data
async function loadData() {
    await loadFinancialProfile();
    await loadGoals();
    await loadItems();
    updateGoalSelects();
    updateCategoryFilter();
    renderWishlist();
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
        updateProfileSummary();
    }
}

async function saveFinancialProfile() {
    if (!currentUser) return;

    const incomeType = document.getElementById('incomeType').value;
    const incomeAmount = parseFloat(document.getElementById('incomeAmount').value);
    const monthlyExpenses = parseFloat(document.getElementById('monthlyExpenses').value);

    if (!incomeAmount || !monthlyExpenses) {
        alert('Please fill in all fields');
        return;
    }

    const profileData = {
        user_id: currentUser.id,
        income_type: incomeType,
        income_amount: incomeAmount,
        monthly_expenses: monthlyExpenses
    };

    const { data, error } = await supabase
        .from('financial_profiles')
        .upsert(profileData, { onConflict: 'user_id' });

    if (error) {
        console.error('Error saving profile:', error);
        alert('Error saving profile');
    } else {
        financialProfile = profileData;
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
        <p><strong>Hourly Rate:</strong> $${hourlyRate.toFixed(2)}/hour</p>
        <p><strong>Monthly Disposable Income:</strong> $${disposableIncome.toFixed(2)}</p>
    `;
}

function calculateHourlyRate() {
    if (!financialProfile) return 0;

    const { income_type, income_amount } = financialProfile;
    
    if (income_type === 'hourly') return income_amount;
    if (income_type === 'monthly') return income_amount / (40 * 4.33); // 40 hours/week * 4.33 weeks/month
    if (income_type === 'yearly') return income_amount / (40 * 52); // 40 hours/week * 52 weeks/year
    
    return 0;
}

function calculateDisposableIncome() {
    if (!financialProfile) return 0;

    const { income_type, income_amount, monthly_expenses } = financialProfile;
    
    let monthlyIncome;
    if (income_type === 'hourly') {
        monthlyIncome = income_amount * 40 * 4.33;
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
            <span class="goal-stats">$${totalPrice.toFixed(2)} • ${totalHours.toFixed(1)}h</span>
        `;
        goalBadge.addEventListener('click', () => {
            document.getElementById('filterGoal').value = goal.id;
            renderWishlist();
        });
        goalsListEl.appendChild(goalBadge);
    });
}

function showGoalModal() {
    document.getElementById('goalModal').classList.add('show');
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
            document.getElementById('detailPrice').value = product.price || '';
            document.getElementById('detailImageUrl').value = imageUrl;
            updateImagePreview(imageUrl); // Show image preview
            document.getElementById('detailSpecs').value = Array.isArray(product.list_of_specifications) 
                ? product.list_of_specifications.join('\n')
                : product.list_of_specifications || '';
            document.getElementById('detailCategory').value = product.suggested_category || '';
            
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
            document.getElementById('detailPrice').value = product.price || '';
            document.getElementById('detailImageUrl').value = product.main_image_url || '';
            document.getElementById('detailSpecs').value = Array.isArray(product.list_of_specifications) 
                ? product.list_of_specifications.join('\n')
                : product.list_of_specifications || '';
            document.getElementById('detailCategory').value = product.suggested_category || '';

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
        document.getElementById('detailPrice').value = product.price || '';
        document.getElementById('detailImageUrl').value = imageUrl;
        updateImagePreview(imageUrl); // Show image preview
        document.getElementById('detailSpecs').value = Array.isArray(product.list_of_specifications) 
            ? product.list_of_specifications.join('\n')
            : product.list_of_specifications || '';
        document.getElementById('detailCategory').value = product.suggested_category || '';
        
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
            errorMsg += error.message;
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
    document.getElementById('detailSpecs').value = '';
    document.getElementById('detailCategory').value = '';
    document.getElementById('detailPriority').value = 'medium';
    document.getElementById('detailTags').value = '';
    document.getElementById('detailGoal').value = '';
    
    currentEditingItem = null;
    document.getElementById('itemDetailsForm').classList.remove('hidden');
}

async function saveItem() {
    if (!currentUser) return;

    const title = document.getElementById('detailTitle').value.trim();
    const price = parseFloat(document.getElementById('detailPrice').value);
    const imageUrl = document.getElementById('detailImageUrl').value.trim();
    const specs = document.getElementById('detailSpecs').value.trim().split('\n').filter(s => s.trim());
    const category = document.getElementById('detailCategory').value.trim();
    const priority = document.getElementById('detailPriority').value;
    const tags = document.getElementById('detailTags').value.trim().split(',').map(t => t.trim()).filter(t => t);
    const goalId = document.getElementById('detailGoal').value || null;

    if (!title || !price) {
        alert('Please enter at least a title and price');
        return;
    }

    const itemData = {
        user_id: currentUser.id,
        title,
        price,
        image_url: imageUrl,
        specifications: specs,
        category: category || null,
        priority,
        tags,
        goal_id: goalId
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
        renderWishlist();
        showStatus('Item saved successfully!', 'success');
    }
}

function cancelItemForm() {
    document.getElementById('itemDetailsForm').classList.add('hidden');
    currentEditingItem = null;
    document.getElementById('productUrl').value = '';
    document.getElementById('scrapingStatus').textContent = '';
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
    } else {
        items = data || [];
    }
}

function renderWishlist() {
    const container = document.getElementById('wishlistItems');
    container.innerHTML = '';

    // Get filters
    const sortBy = document.getElementById('sortBy').value;
    const filterCategory = document.getElementById('filterCategory').value;
    const filterGoal = document.getElementById('filterGoal').value;
    const filterPriority = document.getElementById('filterPriority').value;

    // Filter items
    let filteredItems = [...items];
    
    if (filterCategory) {
        filteredItems = filteredItems.filter(item => item.category === filterCategory);
    }
    
    if (filterGoal) {
        filteredItems = filteredItems.filter(item => item.goal_id === filterGoal);
    }
    
    if (filterPriority) {
        filteredItems = filteredItems.filter(item => item.priority === filterPriority);
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
    
    card.innerHTML = `
        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" class="item-image" loading="lazy">` : ''}
        <div class="item-content">
            <div class="item-header">
                <div class="item-title">${escapeHtml(item.title)}</div>
                <span class="priority-badge ${priorityClass}">${(item.priority || 'medium').toUpperCase()}</span>
            </div>
            <div class="item-price">€${(item.price || 0).toFixed(2)}</div>
            <div class="item-hours">⏱️ ${hours.toFixed(1)} hours of work</div>
            ${item.category ? `<span class="item-category">${escapeHtml(item.category)}</span>` : ''}
            <div class="item-actions">
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
            <div class="stat-value">$${totalPrice.toFixed(2)}</div>
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

    content.innerHTML = `
        ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" class="modal-item-image">` : ''}
        <h2>${escapeHtml(item.title)}</h2>
        <div class="item-price">€${(item.price || 0).toFixed(2)}</div>
        <div class="item-hours">⏱️ ${calculateHoursToAfford(item.price || 0).toFixed(1)} hours of work</div>
        
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
        ${item.tags && item.tags.length > 0 ? `<p><strong>Tags:</strong> ${item.tags.map(t => escapeHtml(t)).join(', ')}</p>` : ''}
    `;
    
    // Add image error handler for modal
    const modalImg = content.querySelector('.modal-item-image');
    if (modalImg && item.image_url) {
        modalImg.addEventListener('error', function() {
            handleModalImageError(this, item.image_url);
        });
    }
    
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
    document.getElementById('detailSpecs').value = Array.isArray(item.specifications) 
        ? item.specifications.join('\n')
        : (item.specifications || '');
    document.getElementById('detailCategory').value = item.category || '';
    document.getElementById('detailPriority').value = item.priority || 'medium';
    document.getElementById('detailTags').value = Array.isArray(item.tags) 
        ? item.tags.join(', ')
        : (item.tags || '');
    document.getElementById('detailGoal').value = item.goal_id || '';
    
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
        renderWishlist();
        updateCategoryFilter();
        showStatus('Item deleted successfully!', 'success');
    }
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
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
            <span>$${oldHourlyRate.toFixed(2)} → $${newHourlyRate.toFixed(2)}</span>
        </div>
        <div class="result-item">
            <strong>Monthly Disposable Income:</strong>
            <span>$${oldDisposable.toFixed(2)} → $${newDisposable.toFixed(2)}</span>
        </div>
        <div class="result-item">
            <strong>Monthly Change:</strong>
            <span>+$${(newDisposable - oldDisposable).toFixed(2)}</span>
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
    const { income_type, income_amount } = profile;
    
    if (income_type === 'hourly') return income_amount;
    if (income_type === 'monthly') return income_amount / (40 * 4.33);
    if (income_type === 'yearly') return income_amount / (40 * 52);
    
    return 0;
}

function calculateDisposableIncomeForProfile(profile) {
    const { income_type, income_amount, monthly_expenses } = profile;
    
    let monthlyIncome;
    if (income_type === 'hourly') {
        monthlyIncome = income_amount * 40 * 4.33;
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
                <span>$${totalPrice.toFixed(2)}</span>
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
                        <strong>${goal.name} ($${totalPrice.toFixed(2)}):</strong>
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

