// --- CONSTANTS AND STATE VARIABLES ---
const NEWS_CACHE_KEY = 'genaiPulseNews';
const YT_CACHE_KEY = 'genaiPulseYT';
const LAST_FETCH_KEY = 'genaiPulseLastFetch';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

const RSS_FEEDS = [
    { name: 'HBR (Main)', url: 'http://feeds.harvardbusiness.org/harvardbusiness' }, { name: 'HBR (Leadership)', url: 'https://hbr.org/topic/leadership/rss' }, { name: 'HBR (Technology)', url: 'https://hbr.org/topic/technology/rss' }, { name: 'HBR (HR Management)', url: 'https://hbr.org/topic/human-resource-management/rss' }, { name: 'Gartner News', url: 'https://www.gartner.com/en/newsroom/rss' }, { name: 'McKinsey Insights', url: 'https://www.mckinsey.com/featured-insights/rss.aspx' }, { name: 'SHRM (Policy & Affairs)', url: 'https://www.shrm.org/rss/public-policy-public-affairs.xml' }, { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' }, { name: 'OpenAI Blog', url: 'https://openai.com/blog/rss.xml' }, { name: 'Google AI Blog', url: 'https://ai.googleblog.com/feeds/posts/default' }, { name: 'Anthropic News', url: 'https://www.anthropic.com/news.xml' }, { name: 'Microsoft Blog', url: 'https://blogs.microsoft.com/feed/' }, { name: 'AWS News Blog', url: 'https://aws.amazon.com/blogs/aws/feed/' }, { name: 'NVIDIA Blog', url: 'https://blogs.nvidia.com/feed/' }, { name: 'AMD News', url: 'https://www.amd.com/en/newsroom.rss' }
];
// NEW: YouTube RSS Feeds
const YOUTUBE_FEEDS = [
    { name: 'Y Combinator', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCcefcZRL2oaA_uBNeo5UOWg' },
    { name: 'Matthew Berman', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCawZsQWqfGSbCI5yjkdVkTA' },
    { name: 'Two Minute Papers', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg' },
    { name: 'AI Explained', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNJ1Ymd5yFuUPtn21xtRbbw' }
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
let allYoutubeVideos = [];
let activeCategories = new Set();
let activeKeywords = new Set();
const MAX_KEYWORDS = 5;

// DOM Elements
const newsContainer = document.getElementById('newsContainer');
const youtubeContainer = document.getElementById('youtubeContainer');
const refreshNewsBtn = document.getElementById('refreshNewsBtn');
const downloadBtn = document.getElementById('downloadBtn');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const sourceFilter = document.getElementById('sourceFilter');
const keywordInput = document.getElementById('keywordInput');
const addKeywordBtn = document.getElementById('addKeywordBtn');
// NEW: YouTube Tab Elements
const tabNews = document.getElementById('tab-news');
const tabYoutube = document.getElementById('tab-youtube');
const newsContentArea = document.getElementById('news-content-area');
const youtubeContentArea = document.getElementById('youtube-content-area');
const ytStartDateInput = document.getElementById('yt-startDate');
const ytEndDateInput = document.getElementById('yt-endDate');
const channelFilter = document.getElementById('channelFilter');

// --- HELPER FUNCTIONS ---
function sanitizeText(text) { const tempDiv = document.createElement('div'); tempDiv.innerHTML = text; return tempDiv.textContent || tempDiv.innerText || ''; }
function formatDateForInput(date) { return date.toISOString().split('T')[0]; }
function setDefaultDates() {
    const today = new Date(); const oneWeekAgo = new Date(); oneWeekAgo.setDate(today.getDate() - 7);
    const formattedToday = formatDateForInput(today);
    const formattedOneWeekAgo = formatDateForInput(oneWeekAgo);
    startDateInput.value = formattedOneWeekAgo;
    endDateInput.value = formattedToday;
    ytStartDateInput.value = formattedOneWeekAgo;
    ytEndDateInput.value = formattedToday;
}

// --- CORE DATA FETCHING ---
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
            });
        } catch (error) { console.error(`Failed to process feed for ${feed.name}:`, error); }
    }));
    allNewsArticles = fetchedArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    categorizeAllArticles();
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(allNewsArticles));
    if (callback) callback();
}

// NEW: Dedicated function for fetching YouTube videos
async function fetchYoutubeVideos(callback) {
    const fetchedVideos = [];
    await Promise.all(YOUTUBE_FEEDS.map(async feed => {
        try {
            const response = await fetch(`${CORS_PROXY}${encodeURIComponent(feed.url)}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const xmlText = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlText, "application/xml");
            if (doc.querySelector('parsererror')) { console.warn(`Could not parse XML for ${feed.name}.`); return; }
            const items = doc.querySelectorAll('entry');
            items.forEach(item => {
                const title = item.querySelector('title')?.textContent.trim() || 'No Title';
                const link = item.querySelector('link')?.getAttribute('href');
                const pubDate = item.querySelector('published')?.textContent;
                const thumbnail = item.querySelector('thumbnail')?.getAttribute('url');
                const description = item.querySelector('description')?.textContent || '';
                if (title && link && pubDate) {
                    fetchedVideos.push({ title, link, description: sanitizeText(description), pubDate, thumbnail, source: feed.name });
                }
            });
        } catch (error) { console.error(`Failed to process YouTube feed for ${feed.name}:`, error); }
    }));
    allYoutubeVideos = fetchedVideos.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    localStorage.setItem(YT_CACHE_KEY, JSON.stringify(allYoutubeVideos));
    if (callback) callback();
}

// --- FILTERING AND RENDERING ---
function filterNews() { const startDate = new Date(startDateInput.value); const endDate = new Date(endDateInput.value); endDate.setHours(23, 59, 59, 999); const selectedSource = sourceFilter.value; let filteredArticles = allNewsArticles; filteredArticles = filteredArticles.filter(article => { const articleDate = new Date(article.pubDate); return articleDate >= startDate && articleDate <= endDate; }); if (selectedSource !== 'all') { filteredArticles = filteredArticles.filter(article => article.source === selectedSource); } if (!activeCategories.has('all') && activeCategories.size > 0) { filteredArticles = filteredArticles.filter(article => Array.from(activeCategories).some(activeCat => article.categories.includes(activeCat))); } if (activeKeywords.size > 0) { filteredArticles = filteredArticles.filter(article => { const content = (article.title + ' ' + article.description).toLowerCase(); return Array.from(activeKeywords).every(keyword => content.includes(keyword)); }); } renderNews(filteredArticles); }
function renderNews(articlesToDisplay) { newsContainer.innerHTML = ''; if (articlesToDisplay.length === 0) { newsContainer.innerHTML = '<p class="no-news">No news found for the selected filters.</p>'; return; } articlesToDisplay.forEach(article => { const card = document.createElement('div'); card.className = 'news-card'; card.innerHTML = `<a href="${article.link}" target="_blank" rel="noopener noreferrer"><div class="card-content"><h3>${article.title}</h3><p>${(article.description.length > 150 ? article.description.substring(0, 150) + '...' : article.description)}</p></div><div class="card-meta"><span class="source">${article.source}</span><span class="date">${new Date(article.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></div></a>`; newsContainer.appendChild(card); }); }

// NEW: Filtering and rendering for YouTube
function filterYoutubeVideos() {
    const startDate = new Date(ytStartDateInput.value);
    const endDate = new Date(ytEndDateInput.value);
    endDate.setHours(23, 59, 59, 999);
    const selectedChannel = channelFilter.value;

    let filteredVideos = allYoutubeVideos.filter(video => {
        const videoDate = new Date(video.pubDate);
        return videoDate >= startDate && videoDate <= endDate;
    });

    if (selectedChannel !== 'all') {
        filteredVideos = filteredVideos.filter(video => video.source === selectedChannel);
    }
    renderYoutubeVideos(filteredVideos);
}
function renderYoutubeVideos(videosToDisplay) {
    youtubeContainer.innerHTML = '';
    if (videosToDisplay.length === 0) { youtubeContainer.innerHTML = '<p class="no-news">No videos found for the selected filters.</p>'; return; }
    videosToDisplay.forEach(video => {
        const card = document.createElement('div');
        card.className = 'video-card';
        card.innerHTML = `
            <a href="${video.link}" target="_blank" rel="noopener noreferrer">
                <img src="${video.thumbnail}" alt="${video.title}" class="card-thumbnail" loading="lazy">
                <div class="card-content">
                    <h3>${video.title}</h3>
                </div>
                <div class="card-meta">
                    <span class="source">${video.source}</span>
                    <span class="date">${new Date(video.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
            </a>`;
        youtubeContainer.appendChild(card);
    });
}

// --- UTILITY AND UI FUNCTIONS ---
function populateSourceFilter() { const sources = [...new Set(allNewsArticles.map(article => article.source))].sort(); sourceFilter.innerHTML = '<option value="all">All Sources</option>'; sources.forEach(source => { const option = document.createElement('option'); option.value = source; option.textContent = source; sourceFilter.appendChild(option); }); }
function populateChannelFilter() { const channels = [...new Set(allYoutubeVideos.map(video => video.source))].sort(); channelFilter.innerHTML = '<option value="all">All Channels</option>'; channels.forEach(channel => { const option = document.createElement('option'); option.value = channel; option.textContent = channel; channelFilter.appendChild(option); }); }
function categorizeArticle(article) { const content = (article.title + ' ' + article.description).toLowerCase(); let matchedCategories = []; for (const categoryKey in CATEGORIES) { if (categoryKey === 'general') continue; const category = CATEGORIES[categoryKey]; for (const keyword of category.keywords) { if (content.includes(keyword.toLowerCase())) { matchedCategories.push(categoryKey); break; } } } article.categories = matchedCategories.length > 0 ? matchedCategories : ['general']; }
function categorizeAllArticles() { allNewsArticles.forEach(article => categorizeArticle(article)); }
function createCategoryToggles() { const categoryTogglesDiv = document.getElementById('categoryToggles'); categoryTogglesDiv.innerHTML = ''; const allBtn = document.createElement('div'); allBtn.className = 'toggle-btn active'; allBtn.dataset.category = 'all'; allBtn.textContent = 'All Topics'; categoryTogglesDiv.appendChild(allBtn); allBtn.addEventListener('click', () => toggleCategory('all')); activeCategories.add('all'); for (const key in CATEGORIES) { if (key === 'general') continue; const category = CATEGORIES[key]; const btn = document.createElement('div'); btn.className = 'toggle-btn'; btn.dataset.category = key; btn.textContent = category.name; categoryTogglesDiv.appendChild(btn); btn.addEventListener('click', () => toggleCategory(key)); } }
function toggleCategory(categoryKey) { const allToggle = document.querySelector('.toggle-btn[data-category="all"]'); const clickedToggle = document.querySelector(`.toggle-btn[data-category="${categoryKey}"]`); if (categoryKey === 'all') { activeCategories.clear(); activeCategories.add('all'); document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active')); allToggle.classList.add('active'); } else { activeCategories.delete('all'); allToggle.classList.remove('active'); if (activeCategories.has(categoryKey)) { activeCategories.delete(categoryKey); clickedToggle.classList.remove('active'); } else { activeCategories.add(categoryKey); clickedToggle.classList.add('active'); } if (activeCategories.size === 0) { activeCategories.add('all'); allToggle.classList.add('active'); } } filterNews(); }
function addKeyword() { const keyword = keywordInput.value.trim().toLowerCase(); if (keyword && activeKeywords.size < MAX_KEYWORDS) { activeKeywords.add(keyword); keywordInput.value = ''; renderKeywordTags(); filterNews(); } }
function removeKeyword(keywordToRemove) { activeKeywords.delete(keywordToRemove); renderKeywordTags(); filterNews(); }
function renderKeywordTags() { const keywordTagsContainer = document.getElementById('keywordTagsContainer'); keywordTagsContainer.innerHTML = ''; activeKeywords.forEach(keyword => { const tag = document.createElement('div'); tag.className = 'keyword-tag'; tag.textContent = keyword; const removeBtn = document.createElement('button'); removeBtn.className = 'remove-tag-btn'; removeBtn.innerHTML = '&times;'; removeBtn.onclick = () => removeKeyword(keyword); tag.appendChild(removeBtn); keywordTagsContainer.appendChild(tag); }); if (activeKeywords.size >= MAX_KEYWORDS) { keywordInput.disabled = true; addKeywordBtn.disabled = true; keywordInput.placeholder = "Max keywords reached"; } else { keywordInput.disabled = false; addKeywordBtn.disabled = false; keywordInput.placeholder = "e.g., skills gap, hbr, gartner"; } }
function getCurrentlyFilteredArticles() { const startDate = new Date(startDateInput.value); const endDate = new Date(endDateInput.value); endDate.setHours(23, 59, 59, 999); const selectedSource = sourceFilter.value; let filtered = allNewsArticles.filter(article => { const articleDate = new Date(article.pubDate); return articleDate >= startDate && articleDate <= endDate; }); if (selectedSource !== 'all') { filtered = filtered.filter(article => article.source === selectedSource); } if (!activeCategories.has('all') && activeCategories.size > 0) { filtered = filtered.filter(article => Array.from(activeCategories).some(activeCat => article.categories.includes(activeCat))); } if (activeKeywords.size > 0) { filtered = filtered.filter(article => { const content = (article.title + ' ' + article.description).toLowerCase(); return Array.from(activeKeywords).every(keyword => content.includes(keyword)); }); } return filtered; }
function generateNewsContent(articles, format) { let content = ''; if (format === 'txt') { articles.forEach((article, index) => { content += `--- Article ${index + 1} ---\nTitle: ${article.title}\nSource: ${article.source}\nDate: ${new Date(article.pubDate).toLocaleDateString()}\nLink: ${article.link}\nDescription: ${sanitizeText(article.description)}\nCategories: ${article.categories.map(c => CATEGORIES[c].name || c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}\n\n`; }); } else if (format === 'html') { content += `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>GenAI Pulse News Export</title><style>body{font-family:sans-serif;line-height:1.6;margin:20px;color:#333}.article{border-bottom:1px solid #eee;padding-bottom:20px;margin-bottom:20px}.article:last-child{border-bottom:none;margin-bottom:0}h1{color:#0056b3}h2{color:#0056b3;margin-top:25px}p{margin:5px 0}a{color:#007bff;text-decoration:none}a:hover{text-decoration:underline}.meta{font-size:.9em;color:#666}.meta strong{color:#000}.categories{font-style:italic;color:#888}</style></head><body><h1>GenAI Pulse News Export</h1><p>Generated on: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>`; articles.forEach(article => { content += `<div class="article"><h2><a href="${article.link}">${article.title}</a></h2><p class="meta"><strong>Source:</strong> ${article.source} | <strong>Date:</strong> ${new Date(article.pubDate).toLocaleDateString()}</p><p>${sanitizeText(article.description)}</p><p class="categories">Categories: ${article.categories.map(c => CATEGORIES[c].name || c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}</p></div>`; }); content += `</body></html>`; } return content; }
function downloadFile(filename, content, type) { const blob = new Blob([content], { type: type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('first-load-overlay');
    const loadingFactElement = document.getElementById('loading-fact');
    let factInterval;
    const loadingFacts = [ "Fetching insights from HBR & McKinsey...", "Compiling the latest from tech leaders...", "Waking up the AI research bots...", "Tuning the YouTube video feed..." ];
    
    setDefaultDates();
    createCategoryToggles();
    renderKeywordTags();
    
    const lastFetch = localStorage.getItem(LAST_FETCH_KEY);
    const isCacheExpired = !lastFetch || (Date.now() - parseInt(lastFetch) > CACHE_DURATION_MS);
    
    const onAllDataLoaded = () => {
        if (factInterval) clearInterval(factInterval);
        overlay.classList.add('hidden');
        localStorage.setItem('genaiPulseVisitedBefore', 'true');
        filterNews();
        filterYoutubeVideos();
    };

    if (isCacheExpired) {
        overlay.classList.remove('hidden');
        let factIndex = 0;
        factInterval = setInterval(() => {
            factIndex = (factIndex + 1) % loadingFacts.length;
            loadingFactElement.style.opacity = 0;
            setTimeout(() => { loadingFactElement.textContent = loadingFacts[factIndex]; loadingFactElement.style.opacity = 1; }, 300);
        }, 3000);
        
        // Fetch both in parallel
        Promise.all([
            fetchNews(),
            fetchYoutubeVideos()
        ]).then(() => {
            localStorage.setItem(LAST_FETCH_KEY, Date.now());
            populateSourceFilter();
            populateChannelFilter();
            onAllDataLoaded();
        });

    } else {
        overlay.classList.add('hidden');
        allNewsArticles = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || '[]');
        allYoutubeVideos = JSON.parse(localStorage.getItem(YT_CACHE_KEY) || '[]');
        categorizeAllArticles();
        populateSourceFilter();
        populateChannelFilter();
        onAllDataLoaded();
    }
});
// Tab Switching
tabNews.addEventListener('click', () => {
    tabNews.classList.add('active');
    tabYoutube.classList.remove('active');
    newsContentArea.classList.remove('hidden');
    youtubeContentArea.classList.add('hidden');
});
tabYoutube.addEventListener('click', () => {
    tabYoutube.classList.add('active');
    tabNews.classList.remove('active');
    youtubeContentArea.classList.remove('hidden');
    newsContentArea.classList.add('hidden');
});

// News Tab Listeners
refreshNewsBtn.addEventListener('click', () => { newsContainer.innerHTML = '<div class="loader"></div>'; fetchNews(filterNews); });
startDateInput.addEventListener('change', filterNews);
endDateInput.addEventListener('change', filterNews);
sourceFilter.addEventListener('change', filterNews);
addKeywordBtn.addEventListener('click', addKeyword);
keywordInput.addEventListener('keypress', function(event) { if (event.key === 'Enter') { event.preventDefault(); addKeyword(); } });
downloadBtn.addEventListener('click', function(event) { event.stopPropagation(); document.getElementById('downloadDropdownContent').classList.toggle('show'); });
window.addEventListener('click', function(event) { const dropdown = document.getElementById('downloadDropdownContent'); if (dropdown.classList.contains('show')) { if (!downloadBtn.contains(event.target)) { dropdown.classList.remove('show'); } } });
document.getElementById('downloadFilteredTxt').addEventListener('click', (e) => { e.preventDefault(); const content = generateNewsContent(getCurrentlyFilteredArticles(), 'txt'); downloadFile('genai_pulse_filtered_news.txt', content, 'text/plain'); });
document.getElementById('downloadFilteredHtml').addEventListener('click', (e) => { e.preventDefault(); const content = generateNewsContent(getCurrentlyFilteredArticles(), 'html'); downloadFile('genai_pulse_filtered_news.html', content, 'text/html'); });
document.getElementById('downloadAllTxt').addEventListener('click', (e) => { e.preventDefault(); const content = generateNewsContent(allNewsArticles, 'txt'); downloadFile('genai_pulse_all_news.txt', content, 'text/plain'); });
document.getElementById('downloadAllHtml').addEventListener('click', (e) => { e.preventDefault(); const content = generateNewsContent(allNewsArticles, 'html'); downloadFile('genai_pulse_all_news.html', content, 'text/html'); });

// YouTube Tab Listeners
ytStartDateInput.addEventListener('change', filterYoutubeVideos);
ytEndDateInput.addEventListener('change', filterYoutubeVideos);
channelFilter.addEventListener('change', filterYoutubeVideos);
