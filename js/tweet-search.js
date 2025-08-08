// Tweet search functionality module
export class TweetSearchManager {
    constructor(tweetManager, app) {
        this.tweetManager = tweetManager;
        this.app = app;
        this.currentQuery = '';
        this.currentSortBy = 'none';
        this.currentSortDirection = 'none';
        this.searchTimeout = null;
    }

    initializeEventListeners() {
        // Search input
        const searchInput = document.getElementById('tweetSearchInput');
        const clearBtn = document.getElementById('clearTweetSearch');
        
        searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
        clearBtn.addEventListener('click', () => this.clearSearch());

        // Sort buttons
        document.getElementById('sortByLikes').addEventListener('click', () => this.toggleSort('likes'));
        document.getElementById('sortByRetweets').addEventListener('click', () => this.toggleSort('retweets'));
        document.getElementById('sortByDate').addEventListener('click', () => this.toggleSort('date'));

        // Search help popup
        document.getElementById('searchInfoBtn').addEventListener('click', () => this.showSearchHelp());
        document.getElementById('searchHelpOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'searchHelpOverlay') {
                this.hideSearchHelp();
            }
        });
    }

    handleSearchInput(e) {
        const query = e.target.value.trim();
        this.currentQuery = query;

        // Show/hide clear button
        const clearBtn = document.getElementById('clearTweetSearch');
        if (query) {
            clearBtn.classList.remove('hidden');
        } else {
            clearBtn.classList.add('hidden');
        }

        // Debounce search
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        this.searchTimeout = setTimeout(() => {
            this.performSearch();
        }, 300);
    }

    clearSearch() {
        const searchInput = document.getElementById('tweetSearchInput');
        const clearBtn = document.getElementById('clearTweetSearch');
        
        searchInput.value = '';
        this.currentQuery = '';
        clearBtn.classList.add('hidden');
        
        this.performSearch();
    }

    toggleSort(sortBy) {
        const button = document.getElementById(`sortBy${sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}`);
        
        // Reset other buttons
        document.querySelectorAll('.sort-btn').forEach(btn => {
            if (btn !== button) {
                btn.className = 'sort-btn';
                btn.dataset.direction = 'none';
            }
        });

        // Toggle current button
        if (this.currentSortBy === sortBy) {
            // Same button clicked - cycle through states
            switch (this.currentSortDirection) {
                case 'none':
                    this.currentSortDirection = 'desc';
                    button.className = 'sort-btn active-desc';
                    break;
                case 'desc':
                    this.currentSortDirection = 'asc';
                    button.className = 'sort-btn active-asc';
                    break;
                case 'asc':
                    this.currentSortDirection = 'none';
                    this.currentSortBy = 'none';
                    button.className = 'sort-btn';
                    break;
            }
        } else {
            // Different button clicked
            this.currentSortBy = sortBy;
            this.currentSortDirection = 'desc';
            button.className = 'sort-btn active-desc';
        }

        button.dataset.direction = this.currentSortDirection;
        this.performSearch();
    }

    performSearch() {
        if (!this.tweetManager.getAllTweets().length) {
            return;
        }

        const results = this.tweetManager.searchTweets(
            this.currentQuery, 
            this.currentSortBy, 
            this.currentSortDirection
        );

        this.displayResults(results);
    }

    displayResults(tweets) {
        const container = document.getElementById('searchResultsContainer');
        const noResults = document.getElementById('searchNoResults');
        const loading = document.getElementById('searchLoadingPlaceholder');

        // Hide loading indicator
        if (loading) loading.classList.add('hidden');

        if (!tweets || tweets.length === 0) {
            container.innerHTML = '';
            noResults.classList.remove('hidden');
            return;
        }

        noResults.classList.add('hidden');
        
        // Use the existing tweet display method from the main app
        container.innerHTML = tweets.map(tweet => 
            this.app.createTweetCard(tweet, this.getHighlightMetric())
        ).join('');

        // Add event listeners for tweet interactions
        tweets.forEach(tweet => {
            const tweetElement = document.getElementById(`tweet-${tweet.tweet_id}`);
            if (tweetElement) {
                const tweetTextElement = tweetElement.querySelector('.tweet-text');
                if (tweetTextElement) {
                    tweetTextElement.addEventListener('click', (event) => {
                        if (event.target.tagName === 'A') {
                            event.stopPropagation();
                            return;
                        }
                        event.stopPropagation();
                        window.open(tweetTextElement.dataset.tweetUrl, '_blank');
                    });
                }
            }
        });
    }

    getHighlightMetric() {
        switch (this.currentSortBy) {
            case 'likes': return 'favorite_count';
            case 'retweets': return 'retweet_count';
            default: return null;
        }
    }

    resetSearch() {
        this.currentQuery = '';
        this.currentSortBy = 'none';
        this.currentSortDirection = 'none';
        
        // Reset UI
        const searchInput = document.getElementById('tweetSearchInput');
        const clearBtn = document.getElementById('clearTweetSearch');
        
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.classList.add('hidden');

        // Reset sort buttons
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.className = 'sort-btn';
            btn.dataset.direction = 'none';
        });

        // Clear results and show loading
        const container = document.getElementById('searchResultsContainer');
        const noResults = document.getElementById('searchNoResults');
        const loading = document.getElementById('searchLoadingPlaceholder');
        
        if (container) container.innerHTML = '';
        if (noResults) noResults.classList.add('hidden');
        if (loading) loading.classList.remove('hidden');
    }

    // Called when new account is selected
    onAccountChanged() {
        this.resetSearch();
        // Auto-populate with all tweets if we have them
        if (this.tweetManager.getAllTweets().length > 0) {
            this.performSearch();
        }
    }

    showSearchHelp() {
        const overlay = document.getElementById('searchHelpOverlay');
        overlay.classList.remove('hidden');
    }

    hideSearchHelp() {
        const overlay = document.getElementById('searchHelpOverlay');
        overlay.classList.add('hidden');
    }
}