// Centralized tweet management system
export class TweetManager {
    constructor(api) {
        this.api = api;
        this.currentAccount = null;
        this.allTweets = [];
        this.isLoading = false;
        this.loadingPromise = null;
    }

    async fetchAllTweets(account, forceRefresh = false) {
        if (!account || !account.account_id) {
            throw new Error('Invalid account provided for fetching tweets');
        }

        // Return cached tweets if available and not forcing refresh
        if (!forceRefresh && this.currentAccount?.account_id === account.account_id && this.allTweets.length > 0) {
            return this.allTweets;
        }

        // If already loading for this account, return the same promise
        if (this.isLoading && this.currentAccount?.account_id === account.account_id && this.loadingPromise) {
            return this.loadingPromise;
        }

        // Start new fetch
        this.currentAccount = account;
        this.isLoading = true;

        this.loadingPromise = this._fetchTweetsInternal(account);
        
        try {
            const tweets = await this.loadingPromise;
            this.allTweets = tweets;
            return tweets;
        } finally {
            this.isLoading = false;
            this.loadingPromise = null;
        }
    }

    async _fetchTweetsInternal(account) {
        if (!account || !account.account_id) {
            throw new Error('No current account set for fetching tweets');
        }

        const tweets = [];
        const batchSize = 1000;
        let offset = 0;
        let hasMore = true;


        while (hasMore) {
            const batch = await this.api.apiCall('tweets', {
                'select': '*',
                'account_id': `eq.${account.account_id}`,
                'limit': batchSize.toString(),
                'offset': offset.toString()
            });

            if (batch && batch.length > 0) {
                tweets.push(...batch);
                offset += batch.length;
                hasMore = batch.length === batchSize;
                
            } else {
                hasMore = false;
            }

            // Prevent infinite loops
            if (offset > 100000) {
                break;
            }
        }

        return tweets;
    }

    getTweetsForWordCloud() {
        // Return tweets with text content for word cloud generation
        return this.allTweets.map(tweet => ({
            full_text: tweet.full_text || tweet.text || ''
        }));
    }

    getTweetsForEmojis() {
        // Return tweets with text content for emoji analysis
        return this.allTweets.map(tweet => ({
            full_text: tweet.full_text || tweet.text || ''
        }));
    }

    searchTweets(query, sortBy = 'none', sortDirection = 'desc') {
        if (!query) return this.allTweets;

        // Filter tweets that match the query using advanced search logic
        const filteredTweets = this.allTweets.filter(tweet => {
            const text = (tweet.full_text || tweet.text || '');
            return this.matchesSearchQuery(text, query);
        });

        // Sort the results
        return this.sortTweets(filteredTweets, sortBy, sortDirection);
    }

    matchesSearchQuery(text, query) {
        const lowerText = text.toLowerCase();
        
        // Parse the query for different operators
        const parts = [];
        let currentPart = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < query.length) {
            const char = query[i];
            
            if (char === '"' && (i === 0 || query[i-1] === ' ')) {
                // Start of quoted phrase
                if (currentPart.trim()) {
                    parts.push({ type: 'word', value: currentPart.trim() });
                    currentPart = '';
                }
                inQuotes = true;
                i++;
                while (i < query.length && query[i] !== '"') {
                    currentPart += query[i];
                    i++;
                }
                if (i < query.length && query[i] === '"') {
                    parts.push({ type: 'phrase', value: currentPart.trim() });
                    currentPart = '';
                    inQuotes = false;
                    i++;
                }
            } else if (char === ' ') {
                if (currentPart.trim()) {
                    if (currentPart.trim().toLowerCase() === 'or') {
                        parts.push({ type: 'operator', value: 'or' });
                    } else {
                        parts.push({ type: 'word', value: currentPart.trim() });
                    }
                    currentPart = '';
                }
                i++;
            } else {
                currentPart += char;
                i++;
            }
        }
        
        // Add the last part
        if (currentPart.trim()) {
            if (currentPart.trim().toLowerCase() === 'or') {
                parts.push({ type: 'operator', value: 'or' });
            } else {
                parts.push({ type: 'word', value: currentPart.trim() });
            }
        }
        
        // Now evaluate the parts
        if (parts.length === 0) return false;
        
        // If there are no 'or' operators, all terms must be present (AND logic)
        const hasOrOperator = parts.some(part => part.type === 'operator' && part.value === 'or');
        
        if (!hasOrOperator) {
            // All words and phrases must be present
            return parts.every(part => {
                if (part.type === 'word') {
                    return lowerText.includes(part.value.toLowerCase());
                } else if (part.type === 'phrase') {
                    return lowerText.includes(part.value.toLowerCase());
                }
                return true;
            });
        } else {
            // Handle OR logic - split by 'or' and check if any group matches
            const orGroups = [];
            let currentGroup = [];
            
            parts.forEach(part => {
                if (part.type === 'operator' && part.value === 'or') {
                    if (currentGroup.length > 0) {
                        orGroups.push(currentGroup);
                        currentGroup = [];
                    }
                } else {
                    currentGroup.push(part);
                }
            });
            
            if (currentGroup.length > 0) {
                orGroups.push(currentGroup);
            }
            
            // At least one group must match (all terms within a group must be present)
            return orGroups.some(group => {
                return group.every(part => {
                    if (part.type === 'word') {
                        return lowerText.includes(part.value.toLowerCase());
                    } else if (part.type === 'phrase') {
                        return lowerText.includes(part.value.toLowerCase());
                    }
                    return true;
                });
            });
        }
    }

    sortTweets(tweets, sortBy, sortDirection) {
        if (sortBy === 'none' || sortDirection === 'none') {
            return tweets;
        }

        const sortedTweets = [...tweets];

        switch (sortBy) {
            case 'likes':
                sortedTweets.sort((a, b) => {
                    const aLikes = a.favorite_count || 0;
                    const bLikes = b.favorite_count || 0;
                    return sortDirection === 'desc' ? bLikes - aLikes : aLikes - bLikes;
                });
                break;
            case 'retweets':
                sortedTweets.sort((a, b) => {
                    const aRetweets = a.retweet_count || 0;
                    const bRetweets = b.retweet_count || 0;
                    return sortDirection === 'desc' ? bRetweets - aRetweets : aRetweets - bRetweets;
                });
                break;
            case 'date':
                sortedTweets.sort((a, b) => {
                    const aDate = new Date(a.created_at);
                    const bDate = new Date(b.created_at);
                    return sortDirection === 'desc' ? bDate - aDate : aDate - bDate;
                });
                break;
        }

        return sortedTweets;
    }

    clearTweets() {
        this.allTweets = [];
        this.currentAccount = null;
        this.isLoading = false;
        this.loadingPromise = null;
    }

    getCurrentAccount() {
        return this.currentAccount;
    }

    getAllTweets() {
        return this.allTweets;
    }
}