# Tweet Harvest 🌾

A web application for discovering the most engaging tweets from the Community Archive database. Find top-performing tweets by likes, retweets, replies, and engagement ratios.

## Features

- **Account Search**: Find any Twitter account that has uploaded their archive to the Community Archive
- **Top Tweets Analysis**: View the most liked, retweeted, and replied-to tweets
- **Ratio Analysis**: Discover tweets with the highest and lowest like-to-retweet ratios
- **Customizable Results**: Choose to see top 5, 10, or 20 tweets in each category
- **Harvest Theme**: Beautiful agricultural-inspired design with wheat, gold, and green colors

## How to Use

1. Open `index.html` in your web browser
2. Enter a Twitter username (without the @) in the search box
3. Click "Search" to find the account in the Community Archive
4. Explore different categories using the tabs:
   - **Most Liked**: Tweets with the highest like counts
   - **Most Retweeted**: Tweets with the highest retweet counts
   - **Most Replied**: Tweets with the highest reply counts
   - **Best/Worst Ratios**: Tweets with highest and lowest like-to-retweet ratios

## Technical Details

- **Frontend**: HTML, CSS, JavaScript
- **Database**: Community Archive Supabase instance
- **API**: Supabase REST API
- **Styling**: Custom CSS with harvest-themed color palette
- **Icons**: Font Awesome

## Data Source

This app uses the [Community Archive](https://github.com/TheExGenesis/community-archive) - an open-source project preserving Twitter subculture history. Only accounts that have voluntarily uploaded their archives are searchable.

## File Structure

```
tweet-harvest/
├── index.html          # Main HTML structure
├── styles.css          # Harvest-themed styling
├── app.js             # Application logic and API calls
└── README.md          # This file
```

## Requirements

- Modern web browser with JavaScript enabled
- Internet connection for API calls
- Account must exist in the Community Archive database