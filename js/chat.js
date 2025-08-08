// Chat module for conversation history functionality
export class ChatManager {
    constructor(api) {
        this.api = api;
        this.secondAccount = null;
        this.currentConversation = [];
        this.searchMatches = [];
        this.currentSearchIndex = -1;
        this.userAOnRight = true; // A is blue (right), B is gray (left)
    }

    initializeEventListeners() {
        // Clickable participants to toggle positions
        document.getElementById('chatParticipants').addEventListener('click', () => this.toggleUserPositions());
        
        // Search functionality
        document.getElementById('chatSearchBtn').addEventListener('click', () => this.searchInConversation());
        document.getElementById('chatSearchInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.searchMatches.length > 0) {
                    // Navigate to next search result
                    this.navigateSearch(1);
                } else {
                    // Start new search
                    this.searchInConversation();
                }
            }
        });
        
        // Real-time search as user types
        document.getElementById('chatSearchInput').addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (query) {
                this.searchInConversation();
            } else {
                this.clearSearch();
            }
        });
        
        // Search navigation
        document.getElementById('prevSearchResult').addEventListener('click', () => this.navigateSearch(-1));
        document.getElementById('nextSearchResult').addEventListener('click', () => this.navigateSearch(1));
        document.getElementById('clearSearch').addEventListener('click', () => this.clearSearch());
    }

    updateChatLoadingMessage(message) {
        const chatLoading = document.getElementById('chatLoading');
        const loadingText = chatLoading.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }

    async loadConversation(currentAccount, secondAccount) {
        this.secondAccount = secondAccount;
        
        const chatSetup = document.getElementById('chatSetup');
        const chatContainer = document.getElementById('chatContainer');
        const chatLoading = document.getElementById('chatLoading');
        
        // Show loading state
        chatSetup.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        chatLoading.classList.remove('hidden');
        
        // Update participants display
        this.updateParticipantsDisplay(currentAccount, secondAccount);
        
        // Update loading message
        this.updateChatLoadingMessage('Searching for conversations...');

        try {
            // Fetch conversation data
            const conversation = await this.fetchConversationData(currentAccount, secondAccount);
            
            if (conversation.length === 0) {
                this.displayEmptyConversation();
            } else {
                this.currentConversation = conversation;
                this.displayConversation();
            }
            
        } catch (error) {
            console.error('Error loading conversation:', error);
            this.showError(`Error loading conversation: ${error.message}`);
        } finally {
            chatLoading.classList.add('hidden');
        }
    }

    async fetchConversationData(userA, userB) {
        
        const conversationTweets = [];
        const originalTweetsToFetch = new Set(); // Track original tweets we need to fetch
        
        try {
            // Update loading message
            this.updateChatLoadingMessage(`Finding replies from @${userB.username} to @${userA.username}...`);
            
            // B replying to A
            const bRepliesA = await this.api.apiCall('tweets', {
                'select': '*',
                'account_id': `eq.${userB.account_id}`,
                'reply_to_username': `eq.${userA.username}`,
                'limit': '1000'
            }).catch(() => []);
            
            bRepliesA.forEach(tweet => {
                tweet.conversationType = 'reply';
                tweet.sender = 'B';
                tweet.senderAccount = userB;
                
                // Track original tweet if it has a reply_to_tweet_id
                if (tweet.reply_to_tweet_id) {
                    originalTweetsToFetch.add(tweet.reply_to_tweet_id);
                }
            });
            
            // Update loading message
            this.updateChatLoadingMessage(`Finding replies from @${userA.username} to @${userB.username}...`);
            
            // A replying to B
            const aRepliesB = await this.api.apiCall('tweets', {
                'select': '*',
                'account_id': `eq.${userA.account_id}`,
                'reply_to_username': `eq.${userB.username}`,
                'limit': '1000'
            }).catch(() => []);
            
            aRepliesB.forEach(tweet => {
                tweet.conversationType = 'reply';
                tweet.sender = 'A';
                tweet.senderAccount = userA;
                
                // Track original tweet if it has a reply_to_tweet_id
                if (tweet.reply_to_tweet_id) {
                    originalTweetsToFetch.add(tweet.reply_to_tweet_id);
                }
            });
            
            // Update loading message
            this.updateChatLoadingMessage(`Finding mentions from @${userA.username} to @${userB.username}...`);
            
            // A mentioning B (non-replies)
            const aMentionsB = await this.api.apiCall('tweets', {
                'select': '*',
                'account_id': `eq.${userA.account_id}`,
                'full_text': `ilike.*@${userB.username}*`,
                'limit': '1000'
            }).catch(() => []);
            
            // Filter out replies from mentions
            const aMentionsBFiltered = aMentionsB.filter(tweet => 
                tweet.reply_to_username !== userB.username
            );
            
            aMentionsBFiltered.forEach(tweet => {
                tweet.conversationType = 'mention';
                tweet.sender = 'A';
                tweet.senderAccount = userA;
            });
            
            // Update loading message
            this.updateChatLoadingMessage(`Finding mentions from @${userB.username} to @${userA.username}...`);
            
            // B mentioning A (non-replies)
            const bMentionsA = await this.api.apiCall('tweets', {
                'select': '*',
                'account_id': `eq.${userB.account_id}`,
                'full_text': `ilike.*@${userA.username}*`,
                'limit': '1000'
            }).catch(() => []);
            
            // Filter out replies from mentions
            const bMentionsAFiltered = bMentionsA.filter(tweet => 
                tweet.reply_to_username !== userA.username
            );
            
            bMentionsAFiltered.forEach(tweet => {
                tweet.conversationType = 'mention';
                tweet.sender = 'B';
                tweet.senderAccount = userB;
            });
            
            // Combine all conversation tweets
            conversationTweets.push(...bRepliesA, ...aRepliesB, ...aMentionsBFiltered, ...bMentionsAFiltered);
            
            
            // Update loading message
            this.updateChatLoadingMessage(`Fetching ${originalTweetsToFetch.size} original tweets...`);
            
            // Fetch original tweets that are being replied to
            const originalTweets = await this.fetchOriginalTweets(Array.from(originalTweetsToFetch), userA, userB);
            
            // Add original tweets to conversation
            conversationTweets.push(...originalTweets);
            
            // Remove duplicates based on tweet_id
            const uniqueTweets = conversationTweets.filter((tweet, index, self) => 
                index === self.findIndex(t => t.tweet_id === tweet.tweet_id)
            );
            
            // Update loading message
            this.updateChatLoadingMessage('Building conversation threads...');
            
            // Build threaded conversation structure
            const threadedTweets = this.buildThreadedConversation(uniqueTweets);
            
            return threadedTweets;
            
        } catch (error) {
            console.error('Error fetching conversation data:', error);
            throw error;
        }
    }

    async fetchOriginalTweets(tweetIds, userA, userB) {
        if (tweetIds.length === 0) return [];
        
        
        const originalTweets = await this.api.fetchTweetsByIds(tweetIds);
        
        // Process each original tweet
        originalTweets.forEach(tweet => {
            // Determine if this original tweet is from userA or userB
            if (tweet.account_id === userA.account_id) {
                tweet.conversationType = 'original';
                tweet.sender = 'A';
                tweet.senderAccount = userA;
            } else if (tweet.account_id === userB.account_id) {
                tweet.conversationType = 'original';
                tweet.sender = 'B';
                tweet.senderAccount = userB;
            } else {
                // This is an original tweet from someone else, but still part of the thread
                tweet.conversationType = 'context';
                tweet.sender = 'other';
                tweet.senderAccount = { username: 'unknown', account_id: tweet.account_id };
            }
        });
        
        return originalTweets;
    }

    buildThreadedConversation(tweets) {
        
        // Create maps for quick lookup
        const tweetMap = new Map();
        const repliesMap = new Map(); // parent_id -> [replies]
        
        // First pass: index all tweets and group replies
        tweets.forEach(tweet => {
            tweetMap.set(tweet.tweet_id, tweet);
            
            if (tweet.reply_to_tweet_id) {
                if (!repliesMap.has(tweet.reply_to_tweet_id)) {
                    repliesMap.set(tweet.reply_to_tweet_id, []);
                }
                repliesMap.get(tweet.reply_to_tweet_id).push(tweet);
            }
        });
        
        // Sort replies by timestamp within each thread
        repliesMap.forEach(replies => {
            replies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });
        
        // Second pass: build threaded structure
        const processedTweets = new Set();
        const threadedResult = [];
        
        // Function to add a tweet and all its replies recursively
        const addTweetWithReplies = (tweet, depth = 0) => {
            if (processedTweets.has(tweet.tweet_id)) {
                return; // Already processed
            }
            
            processedTweets.add(tweet.tweet_id);
            tweet.threadDepth = depth;
            threadedResult.push(tweet);
            
            // Add all direct replies to this tweet
            const replies = repliesMap.get(tweet.tweet_id) || [];
            replies.forEach(reply => {
                addTweetWithReplies(reply, depth + 1);
            });
        };
        
        // Start with root tweets (non-replies) and standalone mentions, sorted by time
        // For threads with replies, sort by the latest reply time to show recent conversations first
        const rootTweets = tweets.filter(tweet => !tweet.reply_to_tweet_id || !tweetMap.has(tweet.reply_to_tweet_id));
        
        // Function to get the latest reply time in a thread
        const getLatestReplyTime = (rootTweet) => {
            let latestTime = new Date(rootTweet.created_at);
            
            const findLatestInReplies = (tweetId) => {
                const replies = repliesMap.get(tweetId) || [];
                replies.forEach(reply => {
                    const replyTime = new Date(reply.created_at);
                    if (replyTime > latestTime) {
                        latestTime = replyTime;
                    }
                    findLatestInReplies(reply.tweet_id); // Recursively check nested replies
                });
            };
            
            findLatestInReplies(rootTweet.tweet_id);
            return latestTime;
        };
        
        rootTweets.sort((a, b) => getLatestReplyTime(a) - getLatestReplyTime(b)); // Sort by latest activity, oldest first
        
        // Process each root tweet and its thread
        rootTweets.forEach(rootTweet => {
            addTweetWithReplies(rootTweet, 0);
        });
        
        // Handle orphaned replies (replies to tweets not in our dataset)
        const orphanedReplies = tweets.filter(tweet => 
            tweet.reply_to_tweet_id && 
            !tweetMap.has(tweet.reply_to_tweet_id) && 
            !processedTweets.has(tweet.tweet_id)
        );
        
        orphanedReplies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); // Keep orphaned replies in chronological order
        orphanedReplies.forEach(tweet => {
            if (!processedTweets.has(tweet.tweet_id)) {
                addTweetWithReplies(tweet, 0);
            }
        });
        
        return threadedResult;
    }

    displayConversation() {
        const messagesList = document.getElementById('messagesList');
        
        if (!this.currentConversation || this.currentConversation.length === 0) {
            this.displayEmptyConversation();
            return;
        }
        
        // Create threaded conversation HTML
        let html = '';
        let currentDate = null;
        
        this.currentConversation.forEach((message, index) => {
            // Add date separator when date changes
            const messageDate = new Date(message.created_at).toDateString();
            if (messageDate !== currentDate) {
                html += `<div class="date-separator"><span>${this.formatDateSeparator(messageDate)}</span></div>`;
                currentDate = messageDate;
            }
            
            // Create message bubble (passing the full conversation for context)
            html += this.createMessageBubble(message, index, this.currentConversation);
        });
        
        messagesList.innerHTML = html;
        
        // Add click handlers for tweet bubbles
        this.addMessageClickHandlers();
        
        // Scroll to bottom
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    formatDateSeparator(dateString) {
        const date = new Date(dateString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    createMessageBubble(message, index, messagesInGroup) {
        // Handle different sender types
        let isSent, bubbleClass, displayUsername;
        
        if (message.sender === 'other') {
            // Context tweet from someone else - show as neutral
            isSent = false;
            bubbleClass = 'context';
            displayUsername = message.senderAccount?.username || 'unknown';
        } else {
            const isUserA = message.sender === 'A';
            isSent = this.userAOnRight ? isUserA : !isUserA;
            bubbleClass = isSent ? 'sent' : 'received';
            displayUsername = message.senderAccount?.username || 'unknown';
        }
        
        const time = new Date(message.created_at).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        // Process message text and remove @username at start of replies
        let rawText = message.full_text || message.text || '';
        
        // If this is a reply, remove the @username mention at the start
        if (message.conversationType === 'reply' && message.reply_to_username) {
            const mentionPattern = new RegExp(`^@${message.reply_to_username}\\s*`, 'i');
            rawText = rawText.replace(mentionPattern, '').trim();
        }
        
        const messageText = this.linkifyText(rawText);
        
        // Enhanced type labels
        let typeLabel;
        let typeIcon;
        switch (message.conversationType) {
            case 'reply':
                typeLabel = 'Reply';
                typeIcon = '↩️';
                break;
            case 'mention':
                typeLabel = 'Mention';
                typeIcon = '@';
                break;
            case 'original':
                typeLabel = 'Original';
                typeIcon = '💬';
                break;
            case 'context':
                typeLabel = 'Context';
                typeIcon = '🔗';
                break;
            default:
                typeLabel = 'Tweet';
                typeIcon = '💬';
        }
        
        // Determine if this is consecutive with previous message
        const prevMessage = messagesInGroup[index - 1];
        const nextMessage = messagesInGroup[index + 1];
        const isConsecutive = prevMessage && prevMessage.sender === message.sender;
        const isLastInGroup = !nextMessage || nextMessage.sender !== message.sender;
        
        // Add visual threading indicator based on depth
        let threadIndicator = '';
        if (message.threadDepth > 0) {
            const indent = '  '.repeat(message.threadDepth - 1);
            threadIndicator = `<div class="thread-indicator depth-${message.threadDepth}">${indent}┗━</div>`;
        }
        
        // Build tweet URL
        const tweetUrl = `https://twitter.com/${displayUsername}/status/${message.tweet_id}`;
        
        return `
            <div class="message-bubble ${bubbleClass} ${isConsecutive ? 'consecutive' : ''} ${isLastInGroup ? 'last-in-group' : ''} ${message.conversationType} clickable-tweet" 
                 data-tweet-id="${message.tweet_id}"
                 data-tweet-url="${tweetUrl}"
                 title="Click to view on Twitter">
                ${threadIndicator}
                <div class="message-content">${messageText}</div>
                <div class="message-meta">
                    <span class="message-time">${time}</span>
                    <span class="message-type">${typeIcon} ${typeLabel}</span>
                    ${message.sender === 'other' ? `<span class="message-username">@${displayUsername}</span>` : ''}
                </div>
            </div>
        `;
    }

    displayEmptyConversation() {
        const messagesList = document.getElementById('messagesList');
        messagesList.innerHTML = `
            <div class="chat-empty">
                <i class="fas fa-comment-slash"></i>
                <h3>No Conversation Found</h3>
                <p>These users haven't interacted with each other in the archived tweets.</p>
            </div>
        `;
    }

    toggleUserPositions() {
        this.userAOnRight = !this.userAOnRight;
        
        // Update participants display to show who's on right
        this.updateParticipantsDisplay();
        
        // Redisplay conversation with new positions
        if (this.currentConversation && this.currentConversation.length > 0) {
            this.displayConversation();
        }
    }

    updateParticipantsDisplay(currentAccount, secondAccount) {
        const chatParticipants = document.getElementById('chatParticipants');
        if (currentAccount && secondAccount) {
            const leftUser = this.userAOnRight ? secondAccount.username : currentAccount.username;
            const rightUser = this.userAOnRight ? currentAccount.username : secondAccount.username;
            chatParticipants.innerHTML = `@${leftUser} ↔ @${rightUser}`;
        }
    }

    // Search functionality
    matchesSearchQuery(text, query) {
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        
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

    searchInConversation() {
        const searchInput = document.getElementById('chatSearchInput');
        const query = searchInput.value.trim();
        
        if (!query) {
            this.clearSearch();
            return;
        }
        
        
        // Clear previous search results (but keep input text)
        this.clearSearchResults();
        
        // Find all messages containing the search term
        this.searchMatches = [];
        const messageElements = document.querySelectorAll('.message-bubble');
        
        messageElements.forEach((element, index) => {
            const messageContent = element.querySelector('.message-content');
            const text = messageContent.textContent.toLowerCase();
            
            if (this.matchesSearchQuery(text, query)) {
                this.searchMatches.push({
                    element,
                    index,
                    originalHtml: messageContent.innerHTML,
                    textContent: messageContent.textContent
                });
            }
        });
        
        
        if (this.searchMatches.length > 0) {
            this.highlightSearchResults(query);
            this.currentSearchIndex = 0;
            this.navigateToSearchResult(0);
            this.updateSearchNavigation();
        } else {
            this.showNoSearchResults();
        }
    }

    highlightSearchResults(query) {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        
        
        this.searchMatches.forEach((match, index) => {
            const messageContent = match.element.querySelector('.message-content');
            
            // Simple approach: work directly with innerHTML and replace text
            const currentClass = index === 0 ? 'current' : '';
            const highlightedHtml = match.originalHtml.replace(regex, `<span class="search-highlight ${currentClass}">$1</span>`);
            
            
            messageContent.innerHTML = highlightedHtml;
        });
    }

    navigateSearch(direction) {
        if (this.searchMatches.length === 0) return;
        
        // Remove current highlight
        const currentMatch = this.searchMatches[this.currentSearchIndex];
        if (currentMatch) {
            const currentHighlight = currentMatch.element.querySelector('.search-highlight.current');
            if (currentHighlight) {
                currentHighlight.classList.remove('current');
            }
        }
        
        // Update index
        this.currentSearchIndex += direction;
        if (this.currentSearchIndex < 0) {
            this.currentSearchIndex = this.searchMatches.length - 1;
        } else if (this.currentSearchIndex >= this.searchMatches.length) {
            this.currentSearchIndex = 0;
        }
        
        this.navigateToSearchResult(this.currentSearchIndex);
        this.updateSearchNavigation();
    }

    navigateToSearchResult(index) {
        const match = this.searchMatches[index];
        if (!match) return;
        
        // Add current highlight
        const highlight = match.element.querySelector('.search-highlight');
        if (highlight) {
            highlight.classList.add('current');
        }
        
        // Scroll to message
        match.element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
        
        // Temporarily highlight the entire message
        match.element.classList.add('highlight');
        setTimeout(() => {
            match.element.classList.remove('highlight');
        }, 1000);
    }

    updateSearchNavigation() {
        const navigation = document.getElementById('searchNavigation');
        const counter = document.getElementById('searchResultCounter');
        
        if (this.searchMatches.length > 0) {
            navigation.classList.remove('hidden');
            counter.textContent = `${this.currentSearchIndex + 1}/${this.searchMatches.length}`;
        } else {
            navigation.classList.add('hidden');
        }
    }

    showNoSearchResults() {
        const navigation = document.getElementById('searchNavigation');
        const counter = document.getElementById('searchResultCounter');
        
        navigation.classList.remove('hidden');
        counter.textContent = '0/0';
        
        // Hide after 3 seconds
        setTimeout(() => {
            if (this.searchMatches.length === 0) {
                navigation.classList.add('hidden');
            }
        }, 3000);
    }

    clearSearchResults() {
        const navigation = document.getElementById('searchNavigation');
        navigation.classList.add('hidden');
        
        // Remove all search highlights
        this.searchMatches.forEach(match => {
            const messageContent = match.element.querySelector('.message-content');
            if (messageContent && match.originalHtml) {
                messageContent.innerHTML = match.originalHtml;
            }
        });
        
        this.searchMatches = [];
        this.currentSearchIndex = -1;
    }

    clearSearch() {
        const searchInput = document.getElementById('chatSearchInput');
        searchInput.value = '';
        this.clearSearchResults();
    }

    addMessageClickHandlers() {
        const messageBubbles = document.querySelectorAll('.clickable-tweet');
        messageBubbles.forEach(bubble => {
            bubble.addEventListener('click', (e) => {
                // Don't trigger if clicking on links inside the message
                if (e.target.tagName === 'A') {
                    return;
                }
                
                const tweetUrl = bubble.dataset.tweetUrl;
                if (tweetUrl) {
                    window.open(tweetUrl, '_blank');
                }
            });
        });
    }

    clearChatHistory() {
        // Reset chat-related state
        this.secondAccount = null;
        this.currentConversation = [];
        this.searchMatches = [];
        this.currentSearchIndex = -1;

        // Clear second user input
        const secondUserInput = document.getElementById('secondUserInput');
        if (secondUserInput) {
            secondUserInput.value = '';
        }

        // Hide chat container and show setup
        const chatSetup = document.getElementById('chatSetup');
        const chatContainer = document.getElementById('chatContainer');
        if (chatSetup) chatSetup.classList.remove('hidden');
        if (chatContainer) chatContainer.classList.add('hidden');

        // Clear messages list
        const messagesList = document.getElementById('messagesList');
        if (messagesList) {
            messagesList.innerHTML = '';
        }

        // Disable load chat button
        const loadChatBtn = document.getElementById('loadChatBtn');
        if (loadChatBtn) {
            loadChatBtn.disabled = true;
        }

        // Clear any search in chat
        const chatSearchInput = document.getElementById('chatSearchInput');
        if (chatSearchInput) {
            chatSearchInput.value = '';
        }

        const searchNavigation = document.getElementById('searchNavigation');
        if (searchNavigation) {
            searchNavigation.classList.add('hidden');
        }
    }

    linkifyText(text) {
        // Match URLs (including t.co links, http/https links)
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        
        return text.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" onclick="event.stopPropagation()">${url}</a>`;
        });
    }

    showError(message) {
        const errorMsg = document.getElementById('errorMessage');
        errorMsg.textContent = message;
        errorMsg.classList.remove('hidden');
    }
}