// Main application class
import { CommunityArchiveAPI } from './api.js';
import { WordCloudManager } from './wordcloud.js';
import { EmojiManager } from './emojis.js';
import { ChatManager } from './chat.js';
import { SearchManager } from './search.js';

class TweetHarvest {
    constructor() {
        // Initialize modules
        this.api = new CommunityArchiveAPI();
        this.wordCloud = new WordCloudManager(this.api);
        this.emojis = new EmojiManager(this.api);
        this.chat = new ChatManager(this.api);
        this.search = new SearchManager(this.api);
        
        // Application state
        this.currentAccount = null;
        this.currentLimit = 10;
        this.isLoading = false;
        
        // Set up callbacks
        this.search.onAccountSelected = (username) => this.searchAccount(username);
        this.search.onSecondUserSelected = (account) => this.chat.secondAccount = account;
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Search functionality
        document.getElementById('searchBtn').addEventListener('click', () => this.searchAccount());
        this.search.initializeEventListeners();

        // Limit selector
        document.getElementById('limitSelect').addEventListener('change', (e) => {
            this.currentLimit = parseInt(e.target.value);
            if (this.currentAccount) {
                this.loadAllTweetCategories();
            }
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Find the actual tab button (in case user clicked on icon inside)
                const tabBtn = e.target.closest('.tab-btn');
                if (tabBtn && tabBtn.dataset.tab) {
                    this.switchTab(tabBtn.dataset.tab);
                }
            });
        });

        // Word cloud functionality
        document.getElementById('generateWordCloud').addEventListener('click', () => 
            this.wordCloud.generateWordCloud(this.currentAccount));
        document.getElementById('exportWordCloud').addEventListener('click', () => 
            this.wordCloud.exportWordCloud(this.currentAccount));
        document.getElementById('wordCloudPlaceholder').addEventListener('click', () => 
            this.wordCloud.generateWordCloud(this.currentAccount));

        // Emoji functionality
        this.emojis.initializeEventListeners();
        document.getElementById('emojiChartPlaceholder').addEventListener('click', () => 
            this.emojis.generateEmojiChart());

        // Chat functionality
        this.chat.initializeEventListeners();
        document.getElementById('loadChatBtn').addEventListener('click', () => 
            this.chat.loadConversation(this.currentAccount, this.chat.secondAccount));
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
        this.wordCloud.clearWordCloud();

        // Clear emoji chart
        this.emojis.resetChart();

        // Clear chat history
        this.chat.clearChatHistory();

        // Hide account info
        document.getElementById('accountInfo').classList.add('hidden');
    }

    async searchAccount(username) {
        const rawUsername = username || document.getElementById('usernameInput').value.trim();
        if (!rawUsername) {
            this.showError('Please enter a username');
            return;
        }

        // Remove @ symbol if present
        const cleanUsername = rawUsername.startsWith('@') ? rawUsername.slice(1) : rawUsername;

        // Clear previous results and hide results section
        this.clearResults();
        document.getElementById('resultsSection').classList.add('hidden');
        
        this.showLoading(true);

        try {
            const account = await this.api.getAccount(cleanUsername);

            if (!account) {
                const errorMsg = document.getElementById('errorMessage');
                errorMsg.innerHTML = `Account @${cleanUsername} not found in the <a href="https://www.community-archive.org/user-dir" target="_blank" style="color: white; text-decoration: underline;">Community Archive</a>. Make sure the username is correct and the account has uploaded their archive.`;
                errorMsg.classList.remove('hidden');
                this.showLoading(false);
                return;
            }

            this.currentAccount = account;
            this.displayAccountInfo();
            await this.loadAllTweetCategories();
            
            document.getElementById('resultsSection').classList.remove('hidden');
            this.showLoading(false);

            // Auto-generate word cloud for the new user
            this.wordCloud.autoGenerateWordCloud(this.currentAccount);

            // Set current account for emoji analysis and auto-generate
            this.emojis.setCurrentAccount(this.currentAccount);
            this.emojis.autoGenerateEmojiChart(this.currentAccount);

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
            // Load likes and retweets data
            const likesData = await this.api.getTopTweets(
                this.currentAccount.account_id, 'favorite_count', this.currentLimit
            ).catch(e => {
                console.log('favorite_count failed:', e.message);
                return [];
            });
            
            const retweetsData = await this.api.getTopTweets(
                this.currentAccount.account_id, 'retweet_count', this.currentLimit
            ).catch(e => {
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

    async loadRatioAnalysis() {
        try {
            // Get all tweets with any engagement for comprehensive ratio analysis
            const tweets = await this.api.getAllTweets(this.currentAccount.account_id, 1000);

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
        const text = this.linkifyText(rawText);
        
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
        
        const targetTabBtn = document.querySelector(`[data-tab="${tabName}"]`);
        if (targetTabBtn) {
            targetTabBtn.classList.add('active');
        }

        // Update tab content
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        const targetTabContent = document.getElementById(`${tabName}-content`);
        if (targetTabContent) {
            targetTabContent.classList.add('active');
        }
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
            const millions = num / 1000000;
            return (millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)) + 'M';
        } else if (num >= 10000) {
            const thousands = num / 1000;
            return (thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)) + 'K';
        }
        return num?.toString() || '0';
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tweetHarvest = new TweetHarvest();
});