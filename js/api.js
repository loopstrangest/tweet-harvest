// API module for Community Archive requests
export class CommunityArchiveAPI {
    constructor() {
        this.apiUrl = 'https://fabxmporizzqflnftavs.supabase.co/rest/v1';
        this.apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhYnhtcG9yaXp6cWZsbmZ0YXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIyNDQ5MTIsImV4cCI6MjAzNzgyMDkxMn0.UIEJiUNkLsW28tBHmG-RQDW-I5JNlJLt62CSk9D_qG8';
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

    async searchAccounts(query) {
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
        return uniqueResults
            .sort((a, b) => (b.num_followers || 0) - (a.num_followers || 0))
            .slice(0, 10);
    }

    async getAccount(username) {
        const accounts = await this.apiCall('account', {
            'username': `eq.${username.toLowerCase()}`,
            'limit': '1'
        });

        return accounts && accounts.length > 0 ? accounts[0] : null;
    }

    async getTopTweets(accountId, orderBy, limit) {
        const tweets = await this.apiCall('tweets', {
            'select': '*',
            'account_id': `eq.${accountId}`,
            [`${orderBy}`]: 'gt.0',
            'order': `${orderBy}.desc`,
            'limit': limit.toString()
        });

        return tweets || [];
    }

    async getAllTweets(accountId, limit = 1000) {
        const tweets = await this.apiCall('tweets', {
            'select': '*',
            'account_id': `eq.${accountId}`,
            'limit': limit.toString()
        });

        return tweets || [];
    }

    async getTweetsWithProgress(accountId, signal = null) {
        const allTweets = [];
        let offset = 0;
        const limit = 1000; // Fetch in batches
        
        while (true) {
            // Check if cancelled before making API call
            if (signal && signal.aborted) {
                throw new Error('Generation cancelled');
            }

            const batch = await this.apiCall('tweets', {
                'account_id': `eq.${accountId}`,
                'select': 'full_text',
                'limit': limit.toString(),
                'offset': offset.toString()
            });

            if (!batch || batch.length === 0) break;
            
            allTweets.push(...batch);
            
            if (batch.length < limit) break; // Last batch
            offset += limit;
        }

        return allTweets;
    }

    async fetchTweetsByIds(tweetIds, batchSize = 50) {
        const tweets = [];
        
        for (let i = 0; i < tweetIds.length; i += batchSize) {
            const batch = tweetIds.slice(i, i + batchSize);
            
            try {
                // Create OR query for multiple tweet IDs
                const orQuery = batch.map(id => `tweet_id.eq.${id}`).join(',');
                
                const batchTweets = await this.apiCall('tweets', {
                    'select': '*',
                    'or': `(${orQuery})`,
                    'limit': batchSize.toString()
                }).catch(() => []);
                
                tweets.push(...batchTweets);
                
            } catch (error) {
                console.error(`Error fetching batch ${i}-${i + batchSize}:`, error);
                // Continue with other batches even if one fails
            }
        }
        
        return tweets;
    }
}