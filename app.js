// Tweet Harvest - Community Archive Explorer
class TweetHarvest {
    constructor() {
        // Community Archive API configuration
        this.apiUrl = 'https://fabxmporizzqflnftavs.supabase.co/rest/v1';
        this.apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8';
        
        this.currentAccount = null;
        this.currentLimit = 10;
        this.isLoading = false;
        this.searchTimeout = null;
        this.currentHighlightIndex = -1;
        this.searchResults = [];
        this.wordCloudGenerationController = null;
        
        this.initializeEventListeners();
    }

    // Helper method for API calls
    async apiCall(endpoint, params = {}) {
        const url = new URL(`${this.apiUrl}/${endpoint}`);
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.append(key, params[key]);
            }
        });

        console.log('API URL:', url.toString()); // Debug log

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': this.apiKey,
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error details:', errorText);
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    }

    initializeEventListeners() {
        const input = document.getElementById('usernameInput');
        
        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => this.searchAccount());
        
        // Enhanced input handling with search suggestions
        input.addEventListener('input', (e) => this.handleSearchInput(e));
        input.addEventListener('keydown', (e) => this.handleSearchKeydown(e));
        input.addEventListener('focus', (e) => this.handleSearchFocus(e));
        input.addEventListener('blur', (e) => this.handleSearchBlur(e));

        // Limit selector
        document.getElementById('limitSelect').addEventListener('change', (e) => {
            this.currentLimit = parseInt(e.target.value);
            if (this.currentAccount) {
                this.loadAllTweetCategories();
            }
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Word cloud functionality
        document.getElementById('generateWordCloud').addEventListener('click', () => this.generateWordCloud());
        document.getElementById('exportWordCloud').addEventListener('click', () => this.exportWordCloud());
        document.getElementById('wordCloudPlaceholder').addEventListener('click', () => this.generateWordCloud());

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-input-container')) {
                this.hideSearchDropdown();
            }
        });
    }

    showLoading(show = true) {
        const spinner = document.getElementById('loadingSpinner');
        const errorMsg = document.getElementById('errorMessage');
        
        if (show) {
            spinner.classList.remove('hidden');
            errorMsg.classList.add('hidden');
        } else {
            spinner.classList.add('hidden');
        }
        this.isLoading = show;
    }

    showError(message) {
        const errorMsg = document.getElementById('errorMessage');
        errorMsg.textContent = message;
        errorMsg.classList.remove('hidden');
        this.showLoading(false);
    }

    clearResults() {
        // Clear all tweet result containers
        const resultContainers = [
            'likesResults', 
            'retweetsResults', 
            'highRatiosResults', 
            'lowRatiosResults'
        ];
        
        resultContainers.forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '';
            }
        });

        // Clear word cloud
        this.clearWordCloud();

        // Hide account info
        document.getElementById('accountInfo').classList.add('hidden');
    }

    clearWordCloud() {
        // Remove existing canvas
        const existingCanvas = document.getElementById('wordCloudCanvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }

        // Show placeholder again
        const placeholder = document.querySelector('.wordcloud-placeholder');
        const progress = document.getElementById('wordCloudProgress');
        
        if (placeholder) placeholder.classList.remove('hidden');
        if (progress) progress.classList.add('hidden');

        // Reset word cloud data
        this.currentWordData = null;

        // Disable export button
        const exportBtn = document.getElementById('exportWordCloud');
        if (exportBtn) {
            exportBtn.disabled = true;
        }
    }

    // Search suggestion methods
    handleSearchInput(e) {
        const query = e.target.value.trim();
        
        // Clear existing timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        if (query.length < 1) {
            this.hideSearchDropdown();
            return;
        }

        // Debounce search by 250ms
        this.searchTimeout = setTimeout(() => {
            this.searchAccounts(query);
        }, 250);
    }

    handleSearchKeydown(e) {
        const dropdown = document.getElementById('searchDropdown');
        if (dropdown.classList.contains('hidden')) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.navigateDropdown(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.navigateDropdown(-1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.currentHighlightIndex >= 0 && this.searchResults[this.currentHighlightIndex]) {
                    this.selectAccount(this.searchResults[this.currentHighlightIndex]);
                } else {
                    this.searchAccount();
                }
                break;
            case 'Escape':
                this.hideSearchDropdown();
                break;
        }
    }

    handleSearchFocus(e) {
        const query = e.target.value.trim();
        if (query.length >= 1 && this.searchResults.length > 0) {
            this.showSearchDropdown();
        }
    }

    handleSearchBlur(e) {
        // Delay hiding to allow for dropdown clicks
        setTimeout(() => {
            this.hideSearchDropdown();
        }, 150);
    }

    async searchAccounts(query) {
        try {
            // Clean the query (remove @ if present)
            const cleanQuery = query.startsWith('@') ? query.slice(1) : query;
            
            // Search by username first
            const usernameResults = await this.apiCall('account', {
                'username': `ilike.*${cleanQuery}*`,
                'limit': '5',
                'order': 'num_followers.desc.nullslast'
            }).catch(() => []);

            // Search by display name
            const displayNameResults = await this.apiCall('account', {
                'account_display_name': `ilike.*${cleanQuery}*`,
                'limit': '5', 
                'order': 'num_followers.desc.nullslast'
            }).catch(() => []);

            // Combine and deduplicate results
            const allResults = [...(usernameResults || []), ...(displayNameResults || [])];
            const uniqueResults = allResults.filter((account, index, self) => 
                index === self.findIndex(a => a.account_id === account.account_id)
            );

            // Sort by followers and limit to 10
            this.searchResults = uniqueResults
                .sort((a, b) => (b.num_followers || 0) - (a.num_followers || 0))
                .slice(0, 10);
                
            this.displaySearchResults();
        } catch (error) {
            console.error('Search error:', error);
            this.hideSearchDropdown();
        }
    }

    displaySearchResults() {
        const dropdown = document.getElementById('searchDropdown');
        const content = dropdown.querySelector('.dropdown-content');
        
        if (this.searchResults.length === 0) {
            this.hideSearchDropdown();
            return;
        }

        content.innerHTML = this.searchResults.map((account, index) => {
            const displayName = account.account_display_name ? 
                `(${account.account_display_name})` : '';
            const followers = this.formatNumber(account.num_followers || 0);
            const tweets = this.formatNumber(account.num_tweets || 0);
            
            return `
                <div class="dropdown-item" data-index="${index}">
                    <div>
                        <div class="account-username">@${account.username}</div>
                        ${displayName ? `<div class="account-display-name">${displayName}</div>` : ''}
                    </div>
                    <div class="account-stats">
                        ${followers} followers • ${tweets} tweets
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        content.querySelectorAll('.dropdown-item').forEach((item, index) => {
            item.addEventListener('click', () => {
                this.selectAccount(this.searchResults[index]);
            });
        });

        this.showSearchDropdown();
    }

    navigateDropdown(direction) {
        const items = document.querySelectorAll('.dropdown-item');
        if (items.length === 0) return;

        // Remove current highlight
        if (this.currentHighlightIndex >= 0) {
            items[this.currentHighlightIndex]?.classList.remove('highlighted');
        }

        // Calculate new index
        this.currentHighlightIndex += direction;
        if (this.currentHighlightIndex < 0) {
            this.currentHighlightIndex = items.length - 1;
        } else if (this.currentHighlightIndex >= items.length) {
            this.currentHighlightIndex = 0;
        }

        // Add new highlight
        items[this.currentHighlightIndex]?.classList.add('highlighted');
        items[this.currentHighlightIndex]?.scrollIntoView({ block: 'nearest' });
    }

    selectAccount(account) {
        const input = document.getElementById('usernameInput');
        input.value = account.username;
        this.hideSearchDropdown();
        this.searchAccount();
    }

    showSearchDropdown() {
        document.getElementById('searchDropdown').classList.remove('hidden');
        this.currentHighlightIndex = -1;
    }

    hideSearchDropdown() {
        document.getElementById('searchDropdown').classList.add('hidden');
        this.currentHighlightIndex = -1;
        // Remove all highlights
        document.querySelectorAll('.dropdown-item.highlighted').forEach(item => {
            item.classList.remove('highlighted');
        });
    }


    async searchAccount() {
        const rawUsername = document.getElementById('usernameInput').value.trim();
        if (!rawUsername) {
            this.showError('Please enter a username');
            return;
        }

        // Remove @ symbol if present
        const username = rawUsername.startsWith('@') ? rawUsername.slice(1) : rawUsername;

        // Clear previous results and hide results section
        this.clearResults();
        document.getElementById('resultsSection').classList.add('hidden');
        
        this.showLoading(true);

        try {
            // First, try to get all available columns to see what's there
            const accounts = await this.apiCall('account', {
                'username': `eq.${username.toLowerCase()}`,
                'limit': '1'
            });


            if (!accounts || accounts.length === 0) {
                const errorMsg = document.getElementById('errorMessage');
                errorMsg.innerHTML = `Account @${username} not found in the <a href="https://www.community-archive.org/user-dir" target="_blank" style="color: white; text-decoration: underline;">Community Archive</a>. Make sure the username is correct and the account has uploaded their archive.`;
                errorMsg.classList.remove('hidden');
                this.showLoading(false);
                return;
            }

            this.currentAccount = accounts[0];
            this.displayAccountInfo();
            await this.loadAllTweetCategories();
            
            document.getElementById('resultsSection').classList.remove('hidden');
            this.showLoading(false);

            // Auto-generate word cloud for the new user
            this.autoGenerateWordCloud();

        } catch (error) {
            console.error('Search error:', error);
            this.showError(`Error searching for account: ${error.message}`);
        }
    }

    displayAccountInfo() {
        const accountInfo = document.getElementById('accountInfo');
        const account = this.currentAccount;
        
        
        accountInfo.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                <div>
                    <strong>@${account.username}</strong>
                    ${account.account_display_name ? `(${account.account_display_name})` : ''}
                </div>
                <div style="display: flex; gap: 1rem; font-size: 0.9rem; color: var(--text-light);">
                    <span><i class="fas fa-users"></i> ${this.formatNumber(account.num_followers || 0)} followers</span>
                    <span><i class="fas fa-user-plus"></i> ${this.formatNumber(account.num_following || 0)} following</span>
                    <span><i class="fas fa-comment"></i> ${this.formatNumber(account.num_tweets || 0)} tweets</span>
                </div>
            </div>
        `;
        accountInfo.classList.remove('hidden');
    }

    async loadAllTweetCategories() {
        if (!this.currentAccount) return;

        try {
            // First, let's get sample tweets to see what columns are available
            const sampleTweets = await this.apiCall('tweets', {
                'account_id': `eq.${this.currentAccount.account_id}`,
                'limit': '20'
            });


            // Load likes and retweets data
            const likesData = await this.loadTopTweets('favorite_count').catch(e => {
                console.log('favorite_count failed:', e.message);
                return [];
            });
            
            const retweetsData = await this.loadTopTweets('retweet_count').catch(e => {
                console.log('retweet_count failed:', e.message);
                return [];
            });

            this.displayTweets('likesResults', likesData, 'favorite_count');
            this.displayTweets('retweetsResults', retweetsData, 'retweet_count');

            // Load ratio analysis (only if we have likes and retweets)
            if (likesData.length > 0 && retweetsData.length > 0) {
                await this.loadRatioAnalysis();
            }

        } catch (error) {
            console.error('Error loading tweet categories:', error);
            this.showError(`Error loading tweets: ${error.message}`);
        }
    }

    async loadTopTweets(orderBy) {
        const tweets = await this.apiCall('tweets', {
            'select': '*',
            'account_id': `eq.${this.currentAccount.account_id}`,
            [`${orderBy}`]: 'gt.0',
            'order': `${orderBy}.desc`,
            'limit': this.currentLimit.toString()
        });

        return tweets || [];
    }

    async loadRatioAnalysis() {
        try {
            // Get all tweets with any engagement for comprehensive ratio analysis
            const tweets = await this.apiCall('tweets', {
                'select': '*',
                'account_id': `eq.${this.currentAccount.account_id}`,
                'limit': '1000'
            });

            if (tweets && tweets.length > 0) {
                // Calculate likes/retweets ratios only (both metrics must be > 0)
                const tweetsWithRatios = tweets
                    .filter(tweet => {
                        const likes = tweet.favorite_count || 0;
                        const retweets = tweet.retweet_count || 0;
                        return likes > 0 && retweets > 0;
                    })
                    .map(tweet => {
                        const likes = tweet.favorite_count || 0;
                        const retweets = tweet.retweet_count || 0;
                        return {
                            ...tweet,
                            ratioType: 'likes/retweets',
                            ratioValue: likes / retweets,
                            ratioDisplay: `${likes}:${retweets}`,
                            metric1: likes,
                            metric2: retweets
                        };
                    });

                // Sort by ratio value and get highest/lowest
                const sortedByRatio = [...tweetsWithRatios].sort((a, b) => b.ratioValue - a.ratioValue);
                
                const highestRatios = sortedByRatio.slice(0, this.currentLimit);
                const lowestRatios = sortedByRatio.slice(-this.currentLimit).reverse();

                this.displayTweets('highRatiosResults', highestRatios, 'ratio', 'highest');
                this.displayTweets('lowRatiosResults', lowestRatios, 'ratio', 'lowest');
            }
        } catch (error) {
            console.error('Error loading ratio analysis:', error);
        }
    }

    displayTweets(containerId, tweets, highlightMetric, ratioType = null) {
        const container = document.getElementById(containerId);
        
        if (!tweets || tweets.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-light);">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 1rem; color: var(--border-light);"></i>
                    <p>No tweets found with this criteria</p>
                </div>
            `;
            return;
        }

        container.innerHTML = tweets.map(tweet => this.createTweetCard(tweet, highlightMetric, ratioType)).join('');
        
        // Add hover event listeners to log tweet data and text click handlers
        tweets.forEach(tweet => {
            const tweetElement = document.getElementById(`tweet-${tweet.tweet_id}`);
            if (tweetElement) {

                // Add click handler for tweet text
                const tweetTextElement = tweetElement.querySelector('.tweet-text');
                if (tweetTextElement) {
                    tweetTextElement.addEventListener('click', (event) => {
                        // Check if clicked element is a link
                        if (event.target.tagName === 'A') {
                            // Let the link handle its own click
                            event.stopPropagation();
                            return;
                        }
                        
                        // If not a link, open the tweet
                        event.stopPropagation();
                        window.open(tweetTextElement.dataset.tweetUrl, '_blank');
                    });

                }
            }
        });
    }

    createTweetCard(tweet, highlightMetric, ratioType = null) {
        const date = new Date(tweet.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        const rawText = tweet.full_text || tweet.text || 'No text available';
        const text = this.linkifyText(rawText); // Show full text, no truncation
        
        // Determine highlight value and ratio display
        let highlightValue = tweet[highlightMetric];
        let ratioDisplay = '';
        
        // Ratio display is now handled in the header

        const tweetUrl = `https://twitter.com/${tweet.account_id}/status/${tweet.tweet_id}`;

        const tweetId = `tweet-${tweet.tweet_id}`;

        return `
            <div class="tweet-card" 
                 id="${tweetId}"
                 onclick="window.open('${tweetUrl}', '_blank')" 
                 data-tweet-url="${tweetUrl}">
                <div class="tweet-header">
                    <div class="tweet-date">
                        <i class="fas fa-calendar"></i>
                        <span>${date}</span>
                    </div>
                    ${ratioType && tweet.ratioType ? `
                        <div class="tweet-ratio-label">
                            ${tweet.ratioType}: ${tweet.ratioValue.toFixed(2)}
                        </div>
                    ` : ''}
                </div>
                <div class="tweet-text" data-tweet-url="${tweetUrl}">${text}</div>
                <div class="tweet-metrics">
                    <div class="metric ${highlightMetric === 'favorite_count' ? 'highlight' : ''}">
                        <i class="fas fa-heart"></i>
                        <span>${this.formatNumber(tweet.favorite_count || 0)}</span>
                    </div>
                    <div class="metric ${highlightMetric === 'retweet_count' ? 'highlight' : ''}">
                        <i class="fas fa-retweet"></i>
                        <span>${this.formatNumber(tweet.retweet_count || 0)}</span>
                    </div>
                    ${tweet.reply_to_username && !ratioType ? `
                        <div class="metric">
                            <i class="fas fa-reply"></i>
                            <span>@${tweet.reply_to_username}</span>
                        </div>
                    ` : ''}
                    ${ratioType && tweet.ratioType ? `
                        <div class="metric highlight">
                            <i class="fas fa-chart-line"></i>
                            <span>${tweet.ratioDisplay}</span>
                        </div>
                    ` : ''}
                    <button class="copy-tweet-btn" data-tweet-text="${this.escapeForAttribute(tweet.full_text || tweet.text || '')}" data-username="${this.escapeForAttribute(this.currentAccount?.username || 'unknown')}" onclick="event.stopPropagation(); window.tweetHarvest.copyTweetText(this)" title="Copy formatted tweet text">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>
        `;
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${tabName}-content`).classList.add('active');
    }

    // Word Cloud Methods
    autoGenerateWordCloud() {
        // Cancel any existing word cloud generation
        if (this.wordCloudGenerationController) {
            this.wordCloudGenerationController.abort();
        }
        
        // Start automatic generation in the background
        this.generateWordCloud(true);
    }

    async generateWordCloud(isAutoGenerated = false) {
        if (!this.currentAccount) {
            if (!isAutoGenerated) {
                this.showError('Please search for an account first');
            }
            return;
        }

        // Cancel any existing generation
        if (this.wordCloudGenerationController) {
            this.wordCloudGenerationController.abort();
        }

        // Create new AbortController for this generation
        this.wordCloudGenerationController = new AbortController();
        const signal = this.wordCloudGenerationController.signal;

        const generateBtn = document.getElementById('generateWordCloud');
        const exportBtn = document.getElementById('exportWordCloud');
        const placeholder = document.querySelector('.wordcloud-placeholder');
        const progress = document.getElementById('wordCloudProgress');
        const container = document.getElementById('wordCloudContainer');
        
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        
        // Show progress, hide placeholder, start filling animation
        placeholder.classList.add('hidden');
        progress.classList.remove('hidden');
        container.classList.add('filling');
        
        // Change tab icon to loading spinner
        const wordCloudTab = document.querySelector('[data-tab="wordcloud"] i');
        if (wordCloudTab) {
            wordCloudTab.className = 'fas fa-spinner fa-spin';
        }

        try {
            // Check if cancelled before starting
            if (signal.aborted) {
                throw new Error('Generation cancelled');
            }
            // Fetch ALL tweets for the account with progress
            const allTweets = await this.fetchAllTweetsWithProgress(signal);
            
            console.log(`Fetched ${allTweets.length} tweets`);
            
            if (allTweets.length === 0) {
                throw new Error('No tweets found to analyze');
            }

            // Check if cancelled after fetching
            if (signal.aborted) {
                throw new Error('Generation cancelled');
            }

            // Update progress to processing
            document.getElementById('progressText').textContent = 'Processing tweets...';

            // Process tweets into word frequency data
            const wordData = this.processTextForWordCloud(allTweets);

            // Check if cancelled after processing
            if (signal.aborted) {
                throw new Error('Generation cancelled');
            }
            
            console.log(`Processed ${wordData.length} unique words`);
            console.log('Top 10 words:', wordData.slice(0, 10));

            if (wordData.length === 0) {
                throw new Error('No meaningful words found in tweets');
            }

            // Update progress to rendering
            document.getElementById('progressText').textContent = 'Creating word cloud...';
            
            // Small delay to show the progress update
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Render the word cloud
            this.renderWordCloud(wordData);
            
            exportBtn.disabled = false;

        } catch (error) {
            console.error('Word cloud generation error:', error);
            
            // Don't show error for cancelled operations unless it's a manual generation
            if (error.message !== 'Generation cancelled' || !isAutoGenerated) {
                if (error.message === 'Generation cancelled') {
                    console.log('Word cloud generation was cancelled');
                } else {
                    this.showError(`Failed to generate word cloud: ${error.message}`);
                }
            }
            
            // Show placeholder again on error
            placeholder.classList.remove('hidden');
        } finally {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fas fa-sync"></i> Generate Word Cloud';
            progress.classList.add('hidden');
            container.classList.remove('filling');
            
            // Restore tab icon to cloud
            const wordCloudTab = document.querySelector('[data-tab="wordcloud"] i');
            if (wordCloudTab) {
                wordCloudTab.className = 'fas fa-cloud';
            }

            // Clear the controller reference
            this.wordCloudGenerationController = null;
        }
    }

    async fetchAllTweetsWithProgress(signal = null) {
        const allTweets = [];
        let offset = 0;
        const limit = 1000; // Fetch in batches
        
        // First, get the total tweet count for progress calculation
        const totalTweets = this.currentAccount.num_tweets || 0;
        let fetchedCount = 0;

        while (true) {
            // Check if cancelled before making API call
            if (signal && signal.aborted) {
                throw new Error('Generation cancelled');
            }

            const batch = await this.apiCall('tweets', {
                'account_id': `eq.${this.currentAccount.account_id}`,
                'select': 'full_text',
                'limit': limit.toString(),
                'offset': offset.toString()
            });

            if (!batch || batch.length === 0) break;
            
            allTweets.push(...batch);
            fetchedCount += batch.length;
            
            // Update progress
            const percentage = totalTweets > 0 ? Math.min((fetchedCount / totalTweets) * 100, 100) : 0;
            const container = document.getElementById('wordCloudContainer');
            container.style.setProperty('--progress-height', `${percentage}%`);
            document.getElementById('progressPercent').textContent = `${Math.round(percentage)}%`;
            
            if (batch.length < limit) break; // Last batch
            offset += limit;
        }

        return allTweets;
    }

    processTextForWordCloud(tweets) {
        const wordCounts = {};
        const commonWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'among', 'against', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'so', 'just', 'not', 'only', 'also', 'very', 'much', 'more', 'most', 'some', 'any', 'all', 'both', 'each', 'few', 'many', 'other', 'another', 'such', 'no', 'yes', 'well', 'now', 'then', 'here', 'there', 'out', 'get', 'go', 'come', 'see', 'know', 'think', 'take', 'want', 'give', 'make', 'say', 'tell', 'back', 'way', 'too', 'even', 'still', 'good', 'great', 'like', 'rt', 'via',
            // Contraction forms (still common words to filter out)
            'dont', 'wont', 'cant', 'isnt', 'arent', 'wasnt', 'werent', 'hasnt', 'havent', 'hadnt', 'doesnt', 'didnt', 'wouldnt', 'shouldnt', 'couldnt', 'mightnt', 'mustnt', 'neednt', 'im', 'youre', 'hes', 'shes', 'were', 'theyre', 'ive', 'youve', 'weve', 'theyve', 'ill', 'youll', 'hell', 'shell', 'theyll', 'youd', 'hed', 'shed', 'wed', 'theyd', 'thats', 'whats', 'wheres', 'whens', 'whos', 'hows', 'whys'
        ]);

        tweets.forEach(tweet => {
            const text = (tweet.full_text || '').toLowerCase();
            
            // Remove URLs, mentions, hashtags, and handle contractions
            const cleanText = text
                .replace(/https?:\/\/[^\s]+/g, '') // URLs
                .replace(/@\w+/g, '') // Mentions
                .replace(/#\w+/g, '') // Hashtags
                // Handle common contractions before removing punctuation
                .replace(/\bdon't\b/g, 'dont')
                .replace(/\bwon't\b/g, 'wont') 
                .replace(/\bcan't\b/g, 'cant')
                .replace(/\bisn't\b/g, 'isnt')
                .replace(/\baren't\b/g, 'arent')
                .replace(/\bwasn't\b/g, 'wasnt')
                .replace(/\bweren't\b/g, 'werent')
                .replace(/\bhasn't\b/g, 'hasnt')
                .replace(/\bhaven't\b/g, 'havent')
                .replace(/\bhadn't\b/g, 'hadnt')
                .replace(/\bdoesn't\b/g, 'doesnt')
                .replace(/\bdidn't\b/g, 'didnt')
                .replace(/\bwouldn't\b/g, 'wouldnt')
                .replace(/\bshouldn't\b/g, 'shouldnt')
                .replace(/\bcouldn't\b/g, 'couldnt')
                .replace(/\bmightn't\b/g, 'mightnt')
                .replace(/\bmustn't\b/g, 'mustnt')
                .replace(/\bneedn't\b/g, 'neednt')
                .replace(/\bi'm\b/g, 'im')
                .replace(/\byou're\b/g, 'youre')
                .replace(/\bhe's\b/g, 'hes')
                .replace(/\bshe's\b/g, 'shes')
                .replace(/\bit's\b/g, 'its')
                .replace(/\bwe're\b/g, 'were')
                .replace(/\bthey're\b/g, 'theyre')
                .replace(/\bi've\b/g, 'ive')
                .replace(/\byou've\b/g, 'youve')
                .replace(/\bwe've\b/g, 'weve')
                .replace(/\bthey've\b/g, 'theyve')
                .replace(/\bi'll\b/g, 'ill')
                .replace(/\byou'll\b/g, 'youll')
                .replace(/\bhe'll\b/g, 'hell')
                .replace(/\bshe'll\b/g, 'shell')
                .replace(/\bwe'll\b/g, 'well')
                .replace(/\bthey'll\b/g, 'theyll')
                .replace(/\bi'd\b/g, 'id')
                .replace(/\byou'd\b/g, 'youd')
                .replace(/\bhe'd\b/g, 'hed')
                .replace(/\bshe'd\b/g, 'shed')
                .replace(/\bwe'd\b/g, 'wed')
                .replace(/\bthey'd\b/g, 'theyd')
                .replace(/\bthat's\b/g, 'thats')
                .replace(/\bwhat's\b/g, 'whats')
                .replace(/\bwhere's\b/g, 'wheres')
                .replace(/\bwhen's\b/g, 'whens')
                .replace(/\bwho's\b/g, 'whos')
                .replace(/\bhow's\b/g, 'hows')
                .replace(/\bwhy's\b/g, 'whys')
                .replace(/[^\w\s]/g, ' ') // Remove remaining punctuation
                .replace(/\s+/g, ' ') // Multiple spaces
                .trim();

            const words = cleanText.split(' ').filter(word => 
                word.length > 2 && 
                !commonWords.has(word) &&
                !/^\d+$/.test(word) // No pure numbers
            );

            words.forEach(word => {
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            });
        });

        // Convert to array and sort by frequency
        return Object.entries(wordCounts)
            .filter(([word, count]) => count > 1) // Only words that appear more than once
            .sort(([,a], [,b]) => b - a)
            .slice(0, 100) // Top 100 words
            .map(([word, count]) => [word, count]);
    }

    renderWordCloud(wordData) {
        const container = document.getElementById('wordCloudContainer');
        
        // Clear existing content but keep the hidden elements
        const existingCanvas = container.querySelector('#wordCloudCanvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }
        
        // Create new canvas for display (square, responsive)
        const canvas = document.createElement('canvas');
        canvas.id = 'wordCloudCanvas';
        container.appendChild(canvas);
        
        const containerRect = container.getBoundingClientRect();
        
        // Always make it square - use the smaller dimension
        const displaySize = Math.min(containerRect.width - 40, 400);
        
        canvas.width = displaySize;
        canvas.height = displaySize;
        canvas.style.display = 'block';
        canvas.style.margin = '0 auto';

        console.log(`Display canvas dimensions: ${displaySize}x${displaySize}`);
        console.log('WordData sample:', wordData.slice(0, 5));

        // Store word data for export
        this.currentWordData = wordData;

        // Generate color palette using our green theme
        const colors = [
            '#004b23', // deep-soil
            '#006400', // rich-earth
            '#007200', // fertile-ground
            '#008000', // growing-field
            '#38b000', // fresh-harvest
            '#70e000', // spring-growth
            '#9ef01a', // new-sprout
        ];

        // WordCloud2 configuration for display with proper padding
        const padding = Math.round(displaySize * 0.02);
        const effectiveSize = displaySize - (padding * 2);
        
        try {
            WordCloud(canvas, {
                list: wordData,
                gridSize: Math.round(8 * effectiveSize / 1024),
                weightFactor: function (size) {
                    const factor = Math.pow(size, 0.6) * effectiveSize / 1024 * 18;
                    return factor;
                },
                fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
                color: function () {
                    return colors[Math.floor(Math.random() * colors.length)];
                },
                rotateRatio: 0.3,
                backgroundColor: 'transparent',
                minSize: 10,
                drawOutOfBound: false,
                shrinkToFit: true,
                origin: [canvas.width / 2, canvas.height / 2],
                clearCanvas: false
            });
            
            console.log('WordCloud rendered successfully');
        } catch (error) {
            console.error('WordCloud rendering error:', error);
            throw new Error('Failed to render word cloud visualization');
        }
    }

    exportWordCloud() {
        const canvas = document.getElementById('wordCloudCanvas');
        if (!canvas) {
            this.showError('No word cloud to export');
            return;
        }

        const exportBtn = document.getElementById('exportWordCloud');
        const originalText = exportBtn.innerHTML;
        
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';

        try {
            // Create a high-resolution 1000x1000 canvas
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = 1000;
            exportCanvas.height = 1000;
            
            const exportCtx = exportCanvas.getContext('2d');
            
            // Enable high-quality rendering
            exportCtx.imageSmoothingEnabled = false; // Disable smoothing for crisp scaling
            exportCtx.textRenderingOptimization = 'optimizeQuality';
            
            // Fill with white background
            exportCtx.fillStyle = '#ffffff';
            exportCtx.fillRect(0, 0, 1000, 1000);
            
            // Calculate scaling to fit display canvas into 1000x1000 with padding
            const padding = 20; // 2% of 1000
            const targetSize = 1000 - (padding * 2);
            const scale = targetSize / Math.min(canvas.width, canvas.height);
            
            // Center the scaled image
            const scaledWidth = canvas.width * scale;
            const scaledHeight = canvas.height * scale;
            const x = (1000 - scaledWidth) / 2;
            const y = (1000 - scaledHeight) / 2;
            
            // For better quality when scaling up, draw at a larger intermediate size
            if (scale > 1) {
                // Create intermediate canvas at 2x the final size for better quality
                const tempCanvas = document.createElement('canvas');
                const tempScale = scale * 2;
                tempCanvas.width = canvas.width * tempScale;
                tempCanvas.height = canvas.height * tempScale;
                
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = 'high';
                
                // Draw original to temp canvas at 2x scale
                tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
                
                // Now draw temp canvas to export canvas at final size
                exportCtx.imageSmoothingEnabled = true;
                exportCtx.imageSmoothingQuality = 'high';
                exportCtx.drawImage(tempCanvas, x, y, scaledWidth, scaledHeight);
            } else {
                // Direct scaling for downscaling
                exportCtx.imageSmoothingEnabled = true;
                exportCtx.imageSmoothingQuality = 'high';
                exportCtx.drawImage(canvas, x, y, scaledWidth, scaledHeight);
            }

            // Create download link
            const link = document.createElement('a');
            link.download = `${this.currentAccount.username}_wordcloud_1000x1000.png`;
            link.href = exportCanvas.toDataURL('image/png');
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log('High-quality 1000x1000 word cloud exported');
            
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to export word cloud');
        } finally {
            exportBtn.disabled = false;
            exportBtn.innerHTML = originalText;
        }
    }






    isImageUrl(url) {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
        const urlLower = url.toLowerCase();
        return imageExtensions.some(ext => urlLower.includes(ext));
    }

    linkifyText(text) {
        // Match URLs (including t.co links, http/https links)
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        
        return text.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" onclick="event.stopPropagation()">${url}</a>`;
        });
    }

    escapeForAttribute(text) {
        return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, ' ').replace(/\r/g, '');
    }

    copyTweetText(buttonElement) {
        const tweetText = buttonElement.getAttribute('data-tweet-text')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
        const username = buttonElement.getAttribute('data-username');
        
        // Transform the text
        const transformedText = this.transformTweetForCopy(tweetText, username);
        
        // Copy to clipboard
        navigator.clipboard.writeText(transformedText).then(() => {
            // Show brief check icon feedback
            buttonElement.innerHTML = '<i class="fas fa-check"></i>';
            
            setTimeout(() => {
                buttonElement.innerHTML = '<i class="fas fa-copy"></i>';
            }, 1000);
        }).catch(err => {
            console.error('Failed to copy text:', err);
            // Fallback: show the text in an alert
            alert('Copy failed. Here\'s the text:\n\n' + transformedText);
        });
    }

    transformTweetForCopy(tweetText, username) {
        // 1. Strip out all https://t.co links
        const withoutTcoLinks = tweetText.replace(/https:\/\/t\.co\/\S+/g, '').trim();
        
        // Clean up any double spaces
        const cleanedText = withoutTcoLinks.replace(/\s+/g, ' ').trim();
        
        // 2. Add quotation marks and 3. Add attribution
        return `"${cleanedText}" - @${username}`;
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num?.toString() || '0';
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tweetHarvest = new TweetHarvest();
});