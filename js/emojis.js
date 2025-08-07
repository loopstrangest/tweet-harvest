// Emoji analysis module for tweet emoji frequency analysis
export class EmojiManager {
    constructor(api) {
        this.api = api;
        this.currentAccount = null;
        this.emojiData = [];
        this.isGenerating = false;
    }

    initializeEventListeners() {
        document.getElementById('generateEmojiChart').addEventListener('click', () => {
            if (this.currentAccount) {
                this.generateEmojiChart();
            } else {
                console.error('No current account set for emoji generation');
            }
        });
        document.getElementById('exportEmojiChart').addEventListener('click', () => this.exportChart());
    }

    async generateEmojiChart() {
        if (!this.currentAccount || this.isGenerating) {
            return;
        }

        this.isGenerating = true;
        this.showProgress();
        this.updateProgress('Loading tweets...', 0);

        try {
            // Fetch all tweets for the user
            const tweets = await this.fetchAllTweets();
            
            this.updateProgress('Analyzing emojis...', 50);
            
            // Extract and count emojis
            const emojiCounts = this.analyzeEmojis(tweets);
            
            this.updateProgress('Generating chart...', 75);
            
            // Generate the bar chart
            this.displayEmojiChart(emojiCounts);
            
            this.updateProgress('Complete!', 100);
            
            setTimeout(() => {
                this.hideProgress();
                document.getElementById('exportEmojiChart').disabled = false;
            }, 1000);

        } catch (error) {
            console.error('Error generating emoji chart:', error);
            this.hideProgress();
            this.showError(`Error generating emoji chart: ${error.message}`);
        } finally {
            this.isGenerating = false;
        }
    }

    async fetchAllTweets() {
        const tweets = [];
        const batchSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await this.api.apiCall('tweets', {
                'select': 'full_text',
                'account_id': `eq.${this.currentAccount.account_id}`,
                'limit': batchSize.toString(),
                'offset': offset.toString()
            });

            if (batch && batch.length > 0) {
                tweets.push(...batch);
                offset += batch.length;
                hasMore = batch.length === batchSize;
                
                // Update progress
                const progress = Math.min(45, (tweets.length / 10000) * 45);
                this.updateProgress(`Loading tweets... (${tweets.length} loaded)`, progress);
            } else {
                hasMore = false;
            }

            // Prevent infinite loops
            if (offset > 50000) {
                console.log('Reached maximum tweet limit of 50,000');
                break;
            }
        }

        console.log(`Loaded ${tweets.length} tweets for emoji analysis`);
        return tweets;
    }

    analyzeEmojis(tweets) {
        const emojiCounts = new Map();
        
        // Unicode emoji regex pattern
        const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}]|[\u{2194}-\u{21AA}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{24C2}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/gu;

        tweets.forEach(tweet => {
            const text = tweet.full_text || '';
            const emojis = text.match(emojiRegex);
            
            if (emojis) {
                emojis.forEach(emoji => {
                    emojiCounts.set(emoji, (emojiCounts.get(emoji) || 0) + 1);
                });
            }
        });

        // Convert to array and sort by frequency
        const sortedEmojis = Array.from(emojiCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50); // Top 50 emojis

        console.log(`Found ${emojiCounts.size} unique emojis, showing top ${sortedEmojis.length}`);
        
        this.emojiData = sortedEmojis;
        return sortedEmojis;
    }

    displayEmojiChart(emojiData) {
        const container = document.getElementById('emojiChartContainer');
        const placeholder = document.getElementById('emojiChartPlaceholder');
        
        if (emojiData.length === 0) {
            container.innerHTML = `
                <div class="emoji-empty">
                    <i class="fas fa-meh" style="font-size: 3rem; color: #c7c7cc; margin-bottom: 1rem;"></i>
                    <h3>No Emojis Found</h3>
                    <p>This user hasn't used any emojis in their archived tweets.</p>
                </div>
            `;
            return;
        }

        // Hide placeholder
        placeholder.classList.add('hidden');

        // Calculate max count for scaling
        const maxCount = Math.max(...emojiData.map(item => item[1]));

        // Create the chart HTML
        const chartHtml = `
            <div class="emoji-chart">
                <div class="chart-header">
                    <h3>Most Used Emojis</h3>
                    <p>Top ${emojiData.length} emojis from @${this.currentAccount.username}'s tweets</p>
                </div>
                <div class="chart-bars">
                    ${emojiData.map((item, index) => {
                        const [emoji, count] = item;
                        const percentage = (count / maxCount) * 100;
                        const rank = index + 1;
                        
                        return `
                            <div class="emoji-bar" style="animation-delay: ${index * 0.05}s;">
                                <div class="emoji-info">
                                    <span class="emoji-rank">#${rank}</span>
                                    <span class="emoji-symbol">${emoji}</span>
                                    <span class="emoji-count">${count} uses</span>
                                </div>
                                <div class="bar-container">
                                    <div class="bar-fill" style="width: ${percentage}%"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        container.innerHTML = chartHtml;
    }

    setCurrentAccount(account) {
        this.currentAccount = account;
        this.resetChart();
    }

    autoGenerateEmojiChart(account) {
        // Start automatic generation in the background
        if (account) {
            this.currentAccount = account; // Ensure current account is set
            setTimeout(() => {
                this.generateEmojiChart();
            }, 2000); // Delay slightly to let other auto-generations run first
        }
    }

    resetChart() {
        const container = document.getElementById('emojiChartContainer');
        const placeholder = document.getElementById('emojiChartPlaceholder');
        const exportButton = document.getElementById('exportEmojiChart');
        
        // Reset container
        if (container && placeholder) {
            container.innerHTML = '';
            container.appendChild(placeholder);
            placeholder.classList.remove('hidden');
        }
        
        // Reset export button
        if (exportButton) {
            exportButton.disabled = true;
        }
        
        this.emojiData = [];
        this.hideProgress();
    }

    showProgress() {
        const container = document.getElementById('emojiChartContainer');
        const progress = document.getElementById('emojiChartProgress');
        const placeholder = document.getElementById('emojiChartPlaceholder');
        
        if (placeholder) {
            placeholder.classList.add('hidden');
        }
        if (progress) {
            progress.classList.remove('hidden');
        }
        
        // Make the progress more visible by centering it in the container
        if (container && progress) {
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.minHeight = '300px';
        }
    }

    hideProgress() {
        const container = document.getElementById('emojiChartContainer');
        const progress = document.getElementById('emojiChartProgress');
        
        if (progress) {
            progress.classList.add('hidden');
        }
        
        // Reset container styling
        if (container) {
            container.style.display = '';
            container.style.alignItems = '';
            container.style.justifyContent = '';
            container.style.minHeight = '';
        }
    }

    updateProgress(text, percent) {
        const progressText = document.getElementById('emojiProgressText');
        const progressPercent = document.getElementById('emojiProgressPercent');
        
        if (progressText) progressText.textContent = text;
        if (progressPercent) progressPercent.textContent = `${Math.round(percent)}%`;
    }

    exportChart() {
        if (this.emojiData.length === 0) return;

        try {
            const chartElement = document.querySelector('.emoji-chart');
            if (!chartElement) return;

            // Create a canvas for export
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set canvas size
            canvas.width = 800;
            canvas.height = Math.max(600, this.emojiData.length * 40 + 150);
            
            // Fill background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw title
            ctx.fillStyle = '#2d5016';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Most Used Emojis - @${this.currentAccount.username}`, canvas.width / 2, 40);
            
            // Draw subtitle
            ctx.fillStyle = '#666666';
            ctx.font = '16px Arial';
            ctx.fillText(`Top ${this.emojiData.length} emojis from archived tweets`, canvas.width / 2, 65);
            
            // Draw bars
            const maxCount = Math.max(...this.emojiData.map(item => item[1]));
            const barHeight = 25;
            const barSpacing = 35;
            const startY = 100;
            const maxBarWidth = 500;
            
            this.emojiData.forEach((item, index) => {
                const [emoji, count] = item;
                const y = startY + (index * barSpacing);
                const barWidth = (count / maxCount) * maxBarWidth;
                
                // Draw rank
                ctx.fillStyle = '#666666';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(`#${index + 1}`, 40, y + 17);
                
                // Draw emoji (simplified as text since canvas emoji support is limited)
                ctx.fillStyle = '#000000';
                ctx.font = '20px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(emoji, 50, y + 17);
                
                // Draw bar background
                ctx.fillStyle = '#f0f0f0';
                ctx.fillRect(90, y + 3, maxBarWidth, barHeight);
                
                // Draw bar fill with gradient
                const gradient = ctx.createLinearGradient(90, y, 90 + barWidth, y);
                gradient.addColorStop(0, '#9ef01a');
                gradient.addColorStop(1, '#70e000');
                ctx.fillStyle = gradient;
                ctx.fillRect(90, y + 3, barWidth, barHeight);
                
                // Draw count
                ctx.fillStyle = '#2d5016';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'left';
                ctx.fillText(`${count} uses`, 100 + barWidth, y + 17);
            });
            
            // Download the image
            const link = document.createElement('a');
            link.download = `emoji-chart-${this.currentAccount.username}.png`;
            link.href = canvas.toDataURL();
            link.click();
            
        } catch (error) {
            console.error('Error exporting chart:', error);
            alert('Error exporting chart. Please try again.');
        }
    }

    showError(message) {
        const container = document.getElementById('emojiChartContainer');
        container.innerHTML = `
            <div class="emoji-error">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ff6b6b; margin-bottom: 1rem;"></i>
                <h3>Error</h3>
                <p>${message}</p>
            </div>
        `;
    }
}