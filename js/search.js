// Search module for account search functionality
export class SearchManager {
    constructor(api) {
        this.api = api;
        this.searchTimeout = null;
        this.currentHighlightIndex = -1;
        this.searchResults = [];
        this.currentSecondUserHighlight = -1;
        this.secondUserSearchResults = [];
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    initializeEventListeners() {
        const input = document.getElementById('usernameInput');
        
        // Enhanced input handling with search suggestions
        input.addEventListener('input', (e) => this.handleSearchInput(e));
        input.addEventListener('keydown', (e) => this.handleSearchKeydown(e));
        input.addEventListener('focus', (e) => this.handleSearchFocus(e));
        input.addEventListener('blur', (e) => this.handleSearchBlur(e));

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-input-container')) {
                this.hideSearchDropdown();
            }
        });

        // Second user search functionality
        const secondUserInput = document.getElementById('secondUserInput');
        secondUserInput.addEventListener('input', (e) => this.handleSecondUserInput(e));
        secondUserInput.addEventListener('keydown', (e) => this.handleSecondUserKeydown(e));
        secondUserInput.addEventListener('focus', (e) => this.handleSecondUserFocus(e));
        secondUserInput.addEventListener('blur', (e) => this.handleSecondUserBlur(e));
        
        // Reposition dropdown on scroll/resize if in chat section
        window.addEventListener('scroll', () => this.repositionChatDropdown());
        window.addEventListener('resize', () => this.repositionChatDropdown());
    }

    // Main search suggestion methods
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

        // Debounce search by 150ms
        this.searchTimeout = setTimeout(() => {
            this.searchAccounts(query);
        }, 150);
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
                    // Trigger main search
                    this.onAccountSelected(e.target.value);
                }
                break;
            case 'Escape':
                this.hideSearchDropdown();
                break;
        }
    }

    async handleSearchFocus(e) {
        const query = e.target.value.trim();
        if (query.length >= 1 && this.searchResults.length > 0) {
            this.showSearchDropdown();
        } else if (query.length === 0) {
            // Show all users by followers descending when clicking empty search bar
            await this.loadAllUsers();
        }
    }

    handleSearchBlur(e) {
        // Delay hiding to allow for dropdown clicks
        setTimeout(() => {
            this.hideSearchDropdown();
        }, 150);
    }

    async loadAllUsers() {
        try {
            // Get all users sorted by followers descending
            const allUsers = await this.api.apiCall('account', {
                'select': 'username,account_display_name,num_followers,num_tweets',
                'order': 'num_followers.desc.nullslast',
                'limit': '20' // Limit to top 20 users to keep it manageable
            });
            
            this.searchResults = allUsers || [];
            this.displaySearchResults();
        } catch (error) {
            console.error('Error loading all users:', error);
            this.hideSearchDropdown();
        }
    }

    async searchAccounts(query) {
        try {
            this.searchResults = await this.api.searchAccounts(query);
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
                `(${this.escapeHtml(account.account_display_name)})` : '';
            const followers = this.formatNumber(account.num_followers || 0);
            const tweets = this.formatNumber(account.num_tweets || 0);
            
            return `
                <div class="dropdown-item" data-index="${index}">
                    <div>
                        <div class="account-username">@${this.escapeHtml(account.username)}</div>
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
        this.onAccountSelected(account.username);
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

    // Second user search methods
    async handleSecondUserInput(e) {
        const query = e.target.value.trim();
        const loadChatBtn = document.getElementById('loadChatBtn');
        
        if (query.length < 1) {
            this.hideSecondUserDropdown();
            loadChatBtn.disabled = true;
            return;
        }

        try {
            const results = await this.searchSecondUser(query);
            this.displaySecondUserResults(results);
        } catch (error) {
            console.error('Second user search error:', error);
            this.hideSecondUserDropdown();
        }
    }

    handleSecondUserKeydown(e) {
        const dropdown = document.getElementById('secondUserDropdown');
        if (dropdown.classList.contains('hidden')) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.navigateSecondUserDropdown(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.navigateSecondUserDropdown(-1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.currentSecondUserHighlight >= 0 && this.secondUserSearchResults[this.currentSecondUserHighlight]) {
                    this.selectSecondUser(this.secondUserSearchResults[this.currentSecondUserHighlight]);
                }
                break;
            case 'Escape':
                this.hideSecondUserDropdown();
                break;
        }
    }

    async handleSecondUserFocus(e) {
        const query = e.target.value.trim();
        if (query.length >= 1 && this.secondUserSearchResults && this.secondUserSearchResults.length > 0) {
            this.showSecondUserDropdown();
        } else if (query.length === 0) {
            // Show all users by followers descending when clicking empty search bar
            await this.loadAllUsersForSecondUser();
        }
    }

    handleSecondUserBlur(e) {
        setTimeout(() => {
            this.hideSecondUserDropdown();
        }, 150);
    }

    async loadAllUsersForSecondUser() {
        try {
            // Get all users sorted by followers descending, excluding current user if set
            const excludeAccountId = this.getCurrentAccountId();
            
            const allUsers = await this.api.apiCall('account', {
                'select': 'username,account_display_name,num_followers,num_tweets,account_id',
                'order': 'num_followers.desc.nullslast',
                'limit': '20' // Limit to top 20 users to keep it manageable
            });
            
            // Filter out current user if we have one
            let filteredUsers = allUsers || [];
            if (excludeAccountId) {
                filteredUsers = filteredUsers.filter(user => user.account_id !== excludeAccountId);
            }
            
            this.secondUserSearchResults = filteredUsers;
            this.displaySecondUserResults(this.secondUserSearchResults);
        } catch (error) {
            console.error('Error loading all users for second user:', error);
            this.hideSecondUserDropdown();
        }
    }

    async searchSecondUser(query, excludeAccountId = null) {
        const cleanQuery = query.startsWith('@') ? query.slice(1) : query;
        
        const usernameResults = await this.api.apiCall('account', {
            'username': `ilike.*${cleanQuery}*`,
            'limit': '5',
            'order': 'num_followers.desc.nullslast'
        }).catch(() => []);

        const displayNameResults = await this.api.apiCall('account', {
            'account_display_name': `ilike.*${cleanQuery}*`,
            'limit': '5', 
            'order': 'num_followers.desc.nullslast'
        }).catch(() => []);

        // Combine and deduplicate, excluding current user
        const allResults = [...(usernameResults || []), ...(displayNameResults || [])];
        const uniqueResults = allResults.filter((account, index, self) => 
            index === self.findIndex(a => a.account_id === account.account_id) &&
            account.account_id !== excludeAccountId
        );

        this.secondUserSearchResults = uniqueResults
            .sort((a, b) => (b.num_followers || 0) - (a.num_followers || 0))
            .slice(0, 10);
            
        return this.secondUserSearchResults;
    }

    displaySecondUserResults(results) {
        const dropdown = document.getElementById('secondUserDropdown');
        const content = dropdown.querySelector('.dropdown-content');
        
        if (!results || results.length === 0) {
            this.hideSecondUserDropdown();
            return;
        }

        content.innerHTML = results.map((account, index) => {
            const displayName = account.account_display_name ? 
                `(${this.escapeHtml(account.account_display_name)})` : '';
            const followers = this.formatNumber(account.num_followers || 0);
            const tweets = this.formatNumber(account.num_tweets || 0);
            
            return `
                <div class="dropdown-item" data-index="${index}">
                    <div>
                        <div class="account-username">@${this.escapeHtml(account.username)}</div>
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
                this.selectSecondUser(results[index]);
            });
        });

        this.showSecondUserDropdown();
    }

    navigateSecondUserDropdown(direction) {
        const items = document.querySelectorAll('#secondUserDropdown .dropdown-item');
        if (items.length === 0) return;

        if (this.currentSecondUserHighlight >= 0) {
            items[this.currentSecondUserHighlight]?.classList.remove('highlighted');
        }

        this.currentSecondUserHighlight = (this.currentSecondUserHighlight || -1) + direction;
        if (this.currentSecondUserHighlight < 0) {
            this.currentSecondUserHighlight = items.length - 1;
        } else if (this.currentSecondUserHighlight >= items.length) {
            this.currentSecondUserHighlight = 0;
        }

        items[this.currentSecondUserHighlight]?.classList.add('highlighted');
        items[this.currentSecondUserHighlight]?.scrollIntoView({ block: 'nearest' });
    }

    selectSecondUser(account) {
        const input = document.getElementById('secondUserInput');
        const loadChatBtn = document.getElementById('loadChatBtn');
        
        input.value = account.username;
        this.hideSecondUserDropdown();
        
        // Enable load chat button
        loadChatBtn.disabled = false;
        
        // Call the callback with the selected account
        if (this.onSecondUserSelected) {
            this.onSecondUserSelected(account);
        }
    }

    showSecondUserDropdown() {
        const dropdown = document.getElementById('secondUserDropdown');
        const input = document.getElementById('secondUserInput');
        
        dropdown.classList.remove('hidden');
        this.currentSecondUserHighlight = -1;
        
        // Position the dropdown correctly when in chat section (using fixed position)
        if (dropdown.classList.contains('search-dropdown') && 
            input.closest('.chat-section')) {
            const rect = input.getBoundingClientRect();
            dropdown.style.top = (rect.bottom) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = rect.width + 'px';
        }
    }

    hideSecondUserDropdown() {
        document.getElementById('secondUserDropdown').classList.add('hidden');
        this.currentSecondUserHighlight = -1;
        document.querySelectorAll('#secondUserDropdown .dropdown-item.highlighted').forEach(item => {
            item.classList.remove('highlighted');
        });
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

    // Callback methods to be set by the main app
    onAccountSelected(username) {
        // To be implemented by main app
    }

    onSecondUserSelected(account) {
        // To be implemented by main app
    }

    repositionChatDropdown() {
        const dropdown = document.getElementById('secondUserDropdown');
        const input = document.getElementById('secondUserInput');
        
        if (dropdown && !dropdown.classList.contains('hidden') && 
            input.closest('.chat-section')) {
            const rect = input.getBoundingClientRect();
            dropdown.style.top = (rect.bottom) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = rect.width + 'px';
        }
    }

    getCurrentAccountId() {
        // Get current account ID from the main app if available
        if (window.tweetHarvest && window.tweetHarvest.currentAccount) {
            return window.tweetHarvest.currentAccount.account_id;
        }
        return null;
    }
}