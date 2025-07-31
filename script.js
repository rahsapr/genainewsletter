// All JavaScript from the previous version goes here
const NEWS_CACHE_KEY = 'genaiPulseNews';
const LAST_FETCH_KEY = 'genaiPulseLastFetch';
const CACHE_DURATION_MS = 60 * 60 * 1000;
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

const RSS_FEEDS = [
    { name: 'HBR (Main)', url: 'http://feeds.harvardbusiness.org/harvardbusiness' },
    { name: 'HBR (Leadership)', url: 'https://hbr.org/topic/leadership/rss' },
    { name: 'HBR (Technology)', url: 'https://hbr.org/topic/technology/rss' },
    { name: 'HBR (HR Management)', url: 'https://hbr.org/topic/human-resource-management/rss' },
    { name: 'Gartner News', url: 'https://www.gartner.com/en/newsroom/rss' },
    { name: 'McKinsey Insights', url: 'https://www.mckinsey.com/featured-insights/rss.aspx' },
    { name: 'SHRM (Policy & Affairs)', url: 'https://www.shrm.org/rss/public-policy-public-affairs.xml' },
    { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
    { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml' },
    { name: 'Google AI Blog', url: 'https://ai.googleblog.com/feeds/posts/default' },
    { name: 'Anthropic News', url: 'https://www.anthropic.com/news.xml' },
    { name: 'Microsoft Blog', url: 'https://blogs.microsoft.com/feed/' },
    { name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/' },
    { name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/' },
    { name: 'AMD News', url: 'https://www.amd.com/en/newsroom.rss' }
];

const CATEGORIES = {
    'workforce': { name: 'Workforce / HR', keywords: ['workforce', 'employee', 'skills', 'upskilling', 'reskilling', 'hiring', 'talent', 'hr', 'future of work', 'jobs', 'productivity', 'culture', 'leadership'] },
    'leadership': { name: 'Leadership Moves', keywords: ['appoint', 'ceo', 'cto', 'vp', 'head of ai', 'executive', 'board', 'transition', 'resign'] },
    'product': { name: 'New Product/Tool', keywords: ['launch', 'release', 'unveil', 'introduce', 'feature', 'tool', 'model', 'platform', 'product', 'update', 'api', 'beta', 'demo'] },
    'announcement': { name: 'Big Announcements', keywords: ['OpenAI', 'Google', 'Microsoft', 'Meta', 'Anthropic', 'Nvidia', 'AWS', 'Amazon', 'Azure', 'Intel', 'AMD', 'partnership', 'collaboration', 'major', 'breakthrough'] },
    'regulatory': { name: 'Regulatory/Legal', keywords: ['bill', 'law', 'regulation', 'policy', 'act', 'court', 'legal', 'ethical', 'guideline', 'governance'] },
    'general': { name: 'General AI News', keywords: [] }
};

let allNewsArticles = [];
let activeCategories = new Set();
let activeKeywords = new Set();
const MAX_KEYWORDS = 5;

// DOM Elements
const newsContainer = document.getElementById('newsContainer');
const refreshNewsBtn = document.getElementById('refreshNewsBtn');
const downloadBtn = document.getElementById('downloadBtn');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const sourceFilter = document.getElementById('sourceFilter');
const keywordInput = document.getElementById('keywordInput');
const addKeywordBtn = document.getElementById('addKeywordBtn');

// --- HELPER FUNCTIONS ---
function sanitizeText(text) { const tempDiv = document.createElement('div'); tempDiv.innerHTML = text; return tempDiv.textContent || tempDiv.innerText || ''; }
function formatDateForInput(date) { return date.toISOString().split('T')[0]; }
function setDefaultDates() { const today = new Date(); const oneWeekAgo = new Date(); oneWeekAgo.setDate(today.getDate() - 7); endDateInput.value = formatDateForInput(today); startDateInput.value = formatDateForInput(oneWeekAgo); }

// --- CORE LOGIC ---
async function fetchNews(callback) {
    const fetchedArticles = [];
    await Promise.all(RSS_FEEDS.map(async feed => {
        try {
            const response = await fetch(`${CORS_PROXY}${encodeURIComponent(feed.url)}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const xmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, "application/xml");
            if (doc.querySelector('parsererror')) { console.warn(`Could not parse XML for ${feed.name}.`); return; }
            const items = doc.querySelectorAll('item, entry');
            items.forEach(item => {
                const title = item.querySelector('title')?.textContent.trim() || 'No Title';
                const pubDate = item.querySelector('pubDate, published, updated')?.textContent;
                const descriptionNode = item.querySelector('description') || item.querySelector('summary') || item.querySelector('content') || item.querySelector('content\\:encoded');
                const description = descriptionNode ? descriptionNode.textContent : '';
                let link = '';
                const linkNode = item.querySelector('link');
                if (linkNode) { link = linkNode.getAttribute('href') || linkNode.textContent.trim(); }
                if (!link) { const guidNode = item.querySelector('guid'); if (guidNode && guidNode.getAttribute('isPermaLink') !== 'false') { link = guidNode.textContent.trim(); } }
                if (title && link && pubDate) { fetchedArticles.push({ title, link, description: sanitizeText(description), pubDate, source: feed.name }); } 
                else { console.warn(`Skipped item from ${feed.name} due to missing data.`); }
            });
        } catch (error) { console.error(`Failed to process feed for ${feed.name}:`, error); }
    }));
    allNewsArticles = fetchedArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    categorizeAllArticles();
    saveNewsToLocalStorage(allNewsArticles);
    populateSourceFilter();
    if (callback) callback();
}

function loadNewsFromLocalStorage() {
    const cachedNews = localStorage.getItem(NEWS_CACHE_KEY);
    const lastFetch = localStorage.getItem(LAST_FETCH_KEY);
    if (cachedNews && lastFetch && (Date.now() - parseInt(lastFetch) < CACHE_DURATION_MS)) {
        allNewsArticles = JSON.parse(cachedNews);
        categorizeAllArticles();
        populateSourceFilter();
        return true;
    }
    return false;
}

function filterNews() {
    const startDate = new Date(startDateInput.value); const endDate = new Date(endDateInput.value); endDate.setHours(23, 59, 59, 999); const selectedSource = sourceFilter.value; let filteredArticles = allNewsArticles; filteredArticles = filteredArticles.filter(article => { const articleDate = new Date(article.pubDate); return articleDate >= startDate && articleDate <= endDate; }); if (selectedSource !== 'all') { filteredArticles = filteredArticles.filter(article => article.source === selectedSource); } if (!activeCategories.has('all') && activeCategories.size > 0) { filteredArticles = filteredArticles.filter(article => Array.from(activeCategories).some(activeCat => article.categories.includes(activeCat))); } if (activeKeywords.size > 0) { filteredArticles = filteredArticles.filter(article => { const content = (article.title + ' ' + article.description).toLowerCase(); return Array.from(activeKeywords).every(keyword => content.includes(keyword)); }); } renderNews(filteredArticles);
}

function saveNewsToLocalStorage(articles) { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(articles)); localStorage.setItem(LAST_FETCH_KEY, Date.now()); }
function categorizeArticle(article) { const content = (article.title + ' ' + article.description).toLowerCase(); let matchedCategories = []; for (const categoryKey in CATEGORIES) { if (categoryKey === 'general') continue; const category = CATEGORIES[categoryKey]; for (const keyword of category.keywords) { if (content.includes(keyword.toLowerCase())) { matchedCategories.push(categoryKey); break; } } } article.categories = matchedCategories.length > 0 ? matchedCategories : ['general']; }
function categorizeAllArticles() { allNewsArticles.forEach(article => categorizeArticle(article)); }
function renderNews(articlesToDisplay) { const newsContainer = document.getElementById('newsContainer'); newsContainer.innerHTML = ''; if (articlesToDisplay.length === 0) { newsContainer.innerHTML = '<p class="no-news">No news found for the selected filters. Try a wider date range or different filters!</p>'; return; } articlesToDisplay.forEach(article => { const card = document.createElement('div'); card.className = 'news-card'; card.innerHTML = `<a href="${article.link}" target="_blank" rel="noopener noreferrer"><h3>${article.title}</h3><p>${(article.description.length > 150 ? article.description.substring(0, 150) + '...' : article.description)}</p></a><div class="card-meta"><span class="source">${article.source}</span><span class="date">${new Date(article.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>`; newsContainer.appendChild(card); }); }
function createCategoryToggles() { const categoryTogglesDiv = document.getElementById('categoryToggles'); categoryTogglesDiv.innerHTML = ''; const allBtn = document.createElement('div'); allBtn.className = 'toggle-btn active'; allBtn.dataset.category = 'all'; allBtn.textContent = 'All Topics'; categoryTogglesDiv.appendChild(allBtn); allBtn.addEventListener('click', () => toggleCategory('all')); activeCategories.add('all'); for (const key in CATEGORIES) { if (key === 'general') continue; const category = CATEGORIES[key]; const btn = document.createElement('div'); btn.className = 'toggle-btn'; btn.dataset.category = key; btn.textContent = category.name; categoryTogglesDiv.appendChild(btn); btn.addEventListener('click', () => toggleCategory(key)); } }
function toggleCategory(categoryKey) { const allToggle = document.querySelector('.toggle-btn[data-category="all"]'); const clickedToggle = document.querySelector(`.toggle-btn[data-category="${categoryKey}"]`); if (categoryKey === 'all') { activeCategories.clear(); activeCategories.add('all'); document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active')); allToggle.classList.add('active'); } else { activeCategories.delete('all'); allToggle.classList.remove('active'); if (activeCategories.has(categoryKey)) { activeCategories.delete(categoryKey); clickedToggle.classList.remove('active'); } else { activeCategories.add(categoryKey); clickedToggle.classList.add('active'); } if (activeCategories.size === 0) { activeCategories.add('all'); allToggle.classList.add('active'); } } filterNews(); }
function addKeyword() { const keywordInput = document.getElementById('keywordInput'); const keyword = keywordInput.value.trim().toLowerCase(); if (keyword && activeKeywords.size < MAX_KEYWORDS) { activeKeywords.add(keyword); keywordInput.value = ''; renderKeywordTags(); filterNews(); } }
function removeKeyword(keywordToRemove) { activeKeywords.delete(keywordToRemove); renderKeywordTags(); filterNews(); }
function renderKeywordTags() { const keywordTagsContainer = document.getElementById('keywordTagsContainer'); keywordTagsContainer.innerHTML = ''; activeKeywords.forEach(keyword => { const tag = document.createElement('div'); tag.className = 'keyword-tag'; tag.textContent = keyword; const removeBtn = document.createElement('button'); removeBtn.className = 'remove-tag-btn'; removeBtn.innerHTML = '×'; removeBtn.onclick = () => removeKeyword(keyword); tag.appendChild(removeBtn); keywordTagsContainer.appendChild(tag); }); const addKeywordBtn = document.getElementById('addKeywordBtn'); const keywordInput = document.getElementById('keywordInput'); if (activeKeywords.size >= MAX_KEYWORDS) { keywordInput.disabled = true; addKeywordBtn.disabled = true; keywordInput.placeholder = "Max keywords reached"; } else { keywordInput.disabled = false; addKeywordBtn.disabled = false; keywordInput.placeholder = "e.g., skills gap, hbr, gartner"; } }
function downloadFile(filename, content, type) { const blob = new Blob([content], { type: type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }
function generateNewsContent(articles, format) { let content = ''; if (format === 'txt') { articles.forEach((article, index) => { content += `--- Article ${index + 1} ---\nTitle: ${article.title}\nSource: ${article.source}\nDate: ${new Date(article.pubDate).toLocaleDateString()}\nLink: ${article.link}\nDescription: ${sanitizeText(article.description)}\nCategories: ${article.categories.map(c => CATEGORIES[c].name || c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}\n\n`; }); } else if (format === 'html') { content += `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>GenAI Pulse News Export</title><style>body{font-family:sans-serif;line-height:1.6;margin:20px;color:#333}.article{border-bottom:1px solid #eee;padding-bottom:20px;margin-bottom:20px}.article:last-child{border-bottom:none;margin-bottom:0}h1{color:#0056b3}h2{color:#0056b3;margin-top:25px}p{margin:5px 0}a{color:#007bff;text-decoration:none}a:hover{text-decoration:underline}.meta{font-size:.9em;color:#666}.meta strong{color:#000}.categories{font-style:italic;color:#888}</style></head><body><h1>GenAI Pulse News Export</h1><p>Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>`; articles.forEach(article => { content += `<div class="article"><h2><a href="${article.link}">${article.title}</a></h2><p class="meta"><strong>Source:</strong> ${article.source} | <strong>Date:</strong> ${new Date(article.pubDate).toLocaleDateString()}</p><p>${sanitizeText(article.description)}</p><p class="categories">Categories: ${article.categories.map(c => CATEGORIES[c].name || c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}</p></div>`; }); content += `</body></html>`; } return content; }
function getCurrentlyFilteredArticles() { const startDate = new Date(startDateInput.value); const endDate = new Date(endDateInput.value); endDate.setHours(23, 59, 59, 999); const selectedSource = sourceFilter.value; let filtered = allNewsArticles.filter(article => { const articleDate = new Date(article.pubDate); return articleDate >= startDate && articleDate <= endDate; }); if (selectedSource !== 'all') { filtered = filtered.filter(article => article.source === selectedSource); } if (!activeCategories.has('all') && activeCategories.size > 0) { filtered = filtered.filter(article => Array.from(activeCategories).some(activeCat => article.categories.includes(activeCat))); } if (activeKeywords.size > 0) { filtered = filtered.filter(article => { const content = (article.title + ' ' + article.description).toLowerCase(); return Array.from(activeKeywords).every(keyword => content.includes(keyword)); }); } return filtered; }
function populateSourceFilter() { const sources = [...new Set(allNewsArticles.map(article => article.source))].sort(); sourceFilter.innerHTML = '<option value="all">All Sources</option>'; sources.forEach(source => { const option = document.createElement('option'); option.value = source; option.textContent = source; sourceFilter.appendChild(option); }); }

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('first-load-overlay');
    const loadingFactElement = document.getElementById('loading-fact');
    let factInterval;
    const loadingFacts = [
        "Connecting to the global information matrix...",
        "Fetching insights from HBR & McKinsey...",
        "Waking up the AI research bots...",
        "Compiling the latest from tech leaders...",
        "Did you know? The transformer architecture (2017) powers most modern AI.",
        "Almost there... just polishing the pixels."
    ];
    if (!localStorage.getItem('genaiPulseVisitedBefore')) {
        overlay.classList.remove('hidden');
        let factIndex = 0;
        factInterval = setInterval(() => {
            factIndex = (factIndex + 1) % loadingFacts.length;
            loadingFactElement.style.opacity = 0;
            setTimeout(() => {
                loadingFactElement.textContent = loadingFacts[factIndex];
                loadingFactElement.style.opacity = 1;
            }, 300);
        }, 3000);
    } else {
        overlay.classList.add('hidden');
    }
    setDefaultDates();
    createCategoryToggles();
    renderKeywordTags();
    const onNewsLoaded = () => {
        if (factInterval) clearInterval(factInterval);
        overlay.classList.add('hidden');
        localStorage.setItem('genaiPulseVisitedBefore', 'true');
        filterNews();
    };
    if (!loadNewsFromLocalStorage()) {
        fetchNews(onNewsLoaded);
    } else {
        onNewsLoaded();
    }
});
refreshNewsBtn.addEventListener('click', () => {
    newsContainer.innerHTML = '<div class="loader"></div>';
    fetchNews(filterNews)
});
downloadBtn.addEventListener('click', function(event) { event.stopPropagation(); document.getElementById('downloadDropdownContent').classList.toggle('show'); });
window.addEventListener('click', function(event) { const dropdown = document.getElementById('downloadDropdownContent'); if (dropdown.classList.contains('show')) { if (!downloadBtn.contains(event.target)) { dropdown.classList.remove('show'); } } });
startDateInput.addEventListener('change', filterNews);
endDateInput.addEventListener('change', filterNews);
sourceFilter.addEventListener('change', filterNews);
addKeywordBtn.addEventListener('click', addKeyword);
keywordInput.addEventListener('keypress', function(event) { if (event.key === 'Enter') { event.preventDefault(); addKeyword(); } });
document.getElementById('downloadFilteredTxt').addEventListener('click', (e) => { e.preventDefault(); const content = generateNewsContent(getCurrentlyFilteredArticles(), 'txt'); downloadFile('genai_pulse_filtered_news.txt', content, 'text/plain'); });
document.getElementById('downloadFilteredHtml').addEventListener('click', (e) => { e.preventDefault(); const content = generateNewsContent(getCurrentlyFilteredArticles(), 'html'); downloadFile('genai_pulse_filtered_news.html', content, 'text/html'); });
document.getElementById('downloadAllTxt').addEventListener('click', (e) => { e.preventDefault(); const content = generateNewsContent(allNewsArticles, 'txt'); downloadFile('genai_pulse_all_news.txt', content, 'text/plain'); });
document.getElementById('downloadAllHtml').addEventListener('click', (e) => { e.preventDefault(); const content = generateNewsContent(allNewsArticles, 'html'); downloadFile('genai_pulse_all_news.html', content, 'text/html'); });
