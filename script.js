// Reddit Thread Analyzer
// This application fetches Reddit threads and comments, processes them using OpenRouter AI models,
// and provides summaries and analysis of the most relevant responses.

// Configuration for the application
const config = {
  // OpenRouter API Configuration
  openRouter: {
    apiKey: "YOUR_OPENROUTER_API_KEY", // Replace with your OpenRouter API key
    model: "anthropic/claude-3-haiku-20240307", // Default model, can be changed
  },
  
  // Reddit API Configuration (using standard OAuth flow)
  reddit: {
    clientId: "YOUR_REDDIT_CLIENT_ID", // Replace with your Reddit API client ID
    redirectUri: "http://localhost:3000/callback", // Update as needed
  },
  
  // Analysis settings
  analysis: {
    commentLimit: 50, // Maximum comments to analyze per thread
    summaryLength: "medium", // Options: "short", "medium", "long"
    sentimentAnalysis: true, // Enable/disable sentiment analysis
    keywordExtraction: true, // Enable/disable keyword extraction
  }
};

// Class to handle Reddit API interactions
class RedditAPI {
  constructor(clientId, redirectUri) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Initialize authentication process
  async authenticate() {
    // Check if we already have a token in localStorage
    const storedToken = localStorage.getItem('redditAccessToken');
    if (storedToken) {
      this.accessToken = storedToken;
      return true;
    }
    
    // Otherwise, start the OAuth flow
    const authUrl = `https://www.reddit.com/api/v1/authorize?client_id=${this.clientId}&response_type=code&state=random_state&redirect_uri=${encodeURIComponent(this.redirectUri)}&duration=permanent&scope=read`;
    window.location.href = authUrl;
    
    return false;
  }
  
  // Handle OAuth callback (to be called from the redirect page)
  async handleCallback(code) {
    try {
      // Exchange the code for tokens
      const tokenResponse = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${this.clientId}:`)}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(this.redirectUri)}`
      });
      
      const tokenData = await tokenResponse.json();
      
      if (tokenData.access_token) {
        this.accessToken = tokenData.access_token;
        this.refreshToken = tokenData.refresh_token;
        
        // Store in localStorage for persistence
        localStorage.setItem('redditAccessToken', this.accessToken);
        localStorage.setItem('redditRefreshToken', this.refreshToken);
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error during Reddit authentication:', error);
      return false;
    }
  }
  
  // Fetch a thread with its comments
  async fetchThread(threadUrl) {
    try {
      // Extract the thread ID from the URL
      const urlParts = threadUrl.split('/');
      const threadId = urlParts[urlParts.indexOf('comments') + 1];
      
      if (!threadId) {
        throw new Error('Invalid Reddit thread URL');
      }
      
      // Fetch the thread data
      const threadResponse = await fetch(`https://oauth.reddit.com/comments/${threadId}?limit=${config.analysis.commentLimit}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': 'RedditThreadAnalyzer/1.0'
        }
      });
      
      const threadData = await threadResponse.json();
      
      // Process and structure the data
      const thread = {
        title: threadData[0].data.children[0].data.title,
        author: threadData[0].data.children[0].data.author,
        selftext: threadData[0].data.children[0].data.selftext,
        score: threadData[0].data.children[0].data.score,
        url: threadData[0].data.children[0].data.url,
        created: new Date(threadData[0].data.children[0].data.created_utc * 1000),
        comments: []
      };
      
      // Extract comments
      this._extractComments(threadData[1].data.children, thread.comments);
      
      return thread;
    } catch (error) {
      console.error('Error fetching Reddit thread:', error);
      throw error;
    }
  }
  
  // Helper method to recursively extract comments
  _extractComments(children, commentsList, depth = 0) {
    for (const child of children) {
      if (child.kind === 't1') { // t1 is the prefix for comments
        const commentData = child.data;
        
        // Add this comment to our list
        commentsList.push({
          id: commentData.id,
          author: commentData.author,
          body: commentData.body,
          score: commentData.score,
          created: new Date(commentData.created_utc * 1000),
          depth: depth
        });
        
        // Process replies recursively if they exist
        if (commentData.replies && 
            commentData.replies.data && 
            commentData.replies.data.children && 
            commentData.replies.data.children.length > 0) {
          this._extractComments(commentData.replies.data.children, commentsList, depth + 1);
        }
      }
    }
  }
}

// Class to handle OpenRouter API interactions
class OpenRouterAPI {
  constructor(apiKey, model) {
    this.apiKey = apiKey;
    this.model = model;
  }
  
  // Send a prompt to the AI model
  async sendPrompt(prompt) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin, // Required by OpenRouter
          'X-Title': 'Reddit Thread Analyzer' // Optional but good practice
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a helpful assistant that analyzes Reddit threads and comments.' },
            { role: 'user', content: prompt }
          ]
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`OpenRouter API error: ${data.error.message}`);
      }
      
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error sending prompt to OpenRouter:', error);
      throw error;
    }
  }
  
  // Generate a summary of a thread
  async summarizeThread(thread) {
    const threadText = `
      Title: ${thread.title}
      Author: ${thread.author}
      Content: ${thread.selftext}
      
      Top ${Math.min(5, thread.comments.length)} comments:
      ${thread.comments.slice(0, 5).map(comment => 
        `- u/${comment.author}: ${comment.body.substring(0, 200)}${comment.body.length > 200 ? '...' : ''}`
      ).join('\n\n')}
    `;
    
    const summaryLength = config.analysis.summaryLength === 'short' ? 'brief' : 
                         config.analysis.summaryLength === 'long' ? 'comprehensive' : 'moderate';
    
    const prompt = `
      Please provide a ${summaryLength} summary of this Reddit thread. Focus on:
      1. The main points or questions raised in the post
      2. The key insights from the comments
      3. The overall sentiment or consensus, if any
      4. Any actionable advice or notable perspectives
      
      Thread details:
      ${threadText}
    `;
    
    return this.sendPrompt(prompt);
  }
  
  // Analyze comments for relevance and usefulness
  async analyzeComments(thread) {
    // First, filter to just the top-level comments for the initial analysis
    const topLevelComments = thread.comments.filter(comment => comment.depth === 0);
    
    // Split comments into batches to avoid token limits
    const batchSize = 5;
    const commentBatches = [];
    
    for (let i = 0; i < topLevelComments.length; i += batchSize) {
      commentBatches.push(topLevelComments.slice(i, i + batchSize));
    }
    
    // Process each batch
    const analysisResults = [];
    
    for (const batch of commentBatches) {
      const commentsText = batch.map(comment => 
        `Comment by u/${comment.author} (Score: ${comment.score}):
         ${comment.body}`
      ).join('\n\n');
      
      const prompt = `
        For the following Reddit comments responding to a post titled "${thread.title}", please:
        
        1. Rate each comment's relevance to the original post (1-10 scale)
        2. Rate each comment's usefulness/insightfulness (1-10 scale)
        3. Extract key points from each comment
        4. Identify if the comment provides actionable advice
        
        Comments:
        ${commentsText}
        
        Format your response as a JSON array with one object per comment:
        [
          {
            "author": "username",
            "relevance_score": 8,
            "usefulness_score": 7,
            "key_points": ["point 1", "point 2"],
            "provides_actionable_advice": true/false
          }
        ]
      `;
      
      const analysisResponse = await this.sendPrompt(prompt);
      
      try {
        // Parse the JSON response
        const analysis = JSON.parse(analysisResponse);
        analysisResults.push(...analysis);
      } catch (error) {
        console.error('Error parsing comment analysis response:', error);
        console.log('Raw response:', analysisResponse);
      }
    }
    
    return analysisResults;
  }
  
  // Identify themes and patterns across comments
  async identifyThemes(thread) {
    // Get the text of all comments
    const commentTexts = thread.comments.map(comment => comment.body).join('\n\n');
    
    const prompt = `
      Analyze the following collection of Reddit comments from a thread titled "${thread.title}". 
      
      Please identify:
      1. 3-5 major themes or topics that appear across multiple comments
      2. Any consensus viewpoints or widely shared opinions
      3. Any significant disagreements or contrasting perspectives
      4. Emerging patterns in how people are responding to the original post
      
      Comments collection:
      ${commentTexts.substring(0, 10000)} ${commentTexts.length > 10000 ? '...(truncated)' : ''}
      
      Format your response as a JSON object:
      {
        "major_themes": ["theme 1", "theme 2", ...],
        "consensus_viewpoints": ["viewpoint 1", "viewpoint 2", ...],
        "significant_disagreements": ["disagreement 1", "disagreement 2", ...],
        "response_patterns": ["pattern 1", "pattern 2", ...]
      }
    `;
    
    const themesResponse = await this.sendPrompt(prompt);
    
    try {
      // Parse the JSON response
      return JSON.parse(themesResponse);
    } catch (error) {
      console.error('Error parsing themes analysis response:', error);
      console.log('Raw response:', themesResponse);
      // Return a simple object with the raw text if parsing fails
      return {
        raw_analysis: themesResponse
      };
    }
  }
}

// Main application class to orchestrate the analysis
class RedditThreadAnalyzer {
  constructor() {
    this.redditAPI = new RedditAPI(config.reddit.clientId, config.reddit.redirectUri);
    this.openRouterAPI = new OpenRouterAPI(config.openRouter.apiKey, config.openRouter.model);
    this.isAuthenticated = false;
    
    // UI references
    this.urlInput = null;
    this.analyzeButton = null;
    this.resultsContainer = null;
    
    // No immediate call to initialize here, it will be called after DOM content is loaded
    // and HTML is injected.
  }
  
  // Initialize the application
  async initialize() {
    // This method is now called *after* HTML is injected and DOM is ready.
    this.setupUI(); // setupUI will find elements that now exist.
    
    // Check for Reddit authentication
    try {
      this.isAuthenticated = await this.redditAPI.authenticate();
    } catch (error) {
      console.error('Authentication error:', error);
      // Potentially update UI to show authentication error
      if (this.resultsContainer) { // Check if UI elements are available
          this.showError('Authentication initialization failed.');
      }
    }
  }
  
  // Set up the UI components
  setupUI() {
    this.urlInput = document.getElementById('thread-url');
    this.analyzeButton = document.getElementById('analyze-button');
    this.resultsContainer = document.getElementById('results-container');
    
    if (this.analyzeButton) {
      this.analyzeButton.addEventListener('click', () => this.analyzeThread());
    } else {
      console.error("Analyze button not found during setupUI");
    }

    const settingsButton = document.getElementById('settings-button');
    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
          alert('Settings functionality will be implemented in a future version.');
        });
    } else {
        console.error("Settings button not found during setupUI");
    }
    
    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      this.handleAuthCallback(code);
    }
  }
  
  // Handle OAuth callback
  async handleAuthCallback(code) {
    try {
      const success = await this.redditAPI.handleCallback(code);
      if (success) {
        this.isAuthenticated = true;
        // Remove the query parameters from the URL
        window.history.replaceState({}, document.title, window.location.pathname);
        // Potentially update UI to reflect authenticated state
      } else {
        console.error('Failed to authenticate with Reddit');
        this.showError('Failed to authenticate with Reddit after callback.');
      }
    } catch (error) {
      console.error('Authentication callback error:', error);
      this.showError('Error during authentication callback.');
    }
  }
  
  // Main function to analyze a thread
  async analyzeThread() {
    if (!this.urlInput || !this.resultsContainer || !this.analyzeButton) {
        console.error("UI elements not initialized before analyzeThread call.");
        alert("Error: UI not ready. Please refresh.");
        return;
    }
    // Show loading state
    this.setLoading(true);
    this.clearResults();
    
    try {
      // Check authentication
      if (!this.isAuthenticated) {
        // Attempt to authenticate. If it redirects, this function will stop here.
        // If it resolves (e.g., token was in localStorage), it will continue.
        const authSuccess = await this.redditAPI.authenticate();
        if (!authSuccess && !localStorage.getItem('redditAccessToken')) { // Check if redirection happened or will happen
             // If authenticate() returned false and there's no token, it means redirection is occurring or failed silently.
             // We might not need to do anything else as the page will redirect.
             // If it didn't redirect (e.g. popup blocker or error), we should inform the user.
            this.showError('Authentication required. Please allow pop-ups and try again if redirection does not occur.');
            this.setLoading(false); // Reset loading state as we are not proceeding.
            return; 
        }
        this.isAuthenticated = authSuccess || !!localStorage.getItem('redditAccessToken');
        if(!this.isAuthenticated){ // If still not authenticated after trying.
            this.showError('Authentication failed. Please try authenticating again.');
            this.setLoading(false);
            return;
        }
      }
      
      // Get the thread URL
      const threadUrl = this.urlInput.value.trim();
      if (!threadUrl) {
        this.showError('Please enter a valid Reddit thread URL');
        this.setLoading(false);
        return;
      }
      
      // Fetch the thread data
      const thread = await this.redditAPI.fetchThread(threadUrl);
      
      // Display basic thread info
      this.displayThreadInfo(thread);
      
      // Analyze in parallel for efficiency
      const [summary, commentAnalysis, themes] = await Promise.all([
        this.openRouterAPI.summarizeThread(thread),
        this.openRouterAPI.analyzeComments(thread),
        this.openRouterAPI.identifyThemes(thread)
      ]);
      
      // Display the results
      this.displaySummary(summary);
      this.displayCommentAnalysis(commentAnalysis);
      this.displayThemes(themes);
      
    } catch (error) {
      console.error('Error analyzing thread:', error);
      this.showError(`Analysis error: ${error.message}`);
    } finally {
      this.setLoading(false);
    }
  }
  
  // Display functions for the UI
  displayThreadInfo(thread) {
    const infoHtml = `
      <div class="thread-info">
        <h2>${thread.title}</h2>
        <p>Posted by u/${thread.author} on ${thread.created.toLocaleDateString()}</p>
        <p>Score: ${thread.score} | Comments analyzed: ${thread.comments.length}</p>
        ${thread.selftext ? `<div class="thread-content">${this.formatMarkdown(thread.selftext)}</div>` : ''}
      </div>
    `;
    
    const threadInfoElement = document.createElement('div');
    threadInfoElement.innerHTML = infoHtml;
    this.resultsContainer.appendChild(threadInfoElement);
  }
  
  displaySummary(summary) {
    const summaryElement = document.createElement('div');
    summaryElement.classList.add('summary-section');
    summaryElement.innerHTML = `
      <h3>Thread Summary</h3>
      <div class="summary-content">${this.formatMarkdown(summary)}</div>
    `;
    this.resultsContainer.appendChild(summaryElement);
  }
  
  displayCommentAnalysis(commentAnalysis) {
    // Sort comments by usefulness score
    const sortedComments = [...commentAnalysis].sort((a, b) => (b.usefulness_score || 0) - (a.usefulness_score || 0));
    
    const analysisElement = document.createElement('div');
    analysisElement.classList.add('comment-analysis');
    
    let analysisHtml = `<h3>Most Useful Comments</h3>`;
    
    sortedComments.forEach(comment => {
      analysisHtml += `
        <div class="analyzed-comment">
          <div class="comment-header">
            <span class="comment-author">u/${comment.author || 'N/A'}</span>
            <div class="comment-scores">
              <span class="relevance-score">Relevance: ${comment.relevance_score || 'N/A'}/10</span>
              <span class="usefulness-score">Usefulness: ${comment.usefulness_score || 'N/A'}/10</span>
            </div>
          </div>
          <div class="comment-key-points">
            <h4>Key Points:</h4>
            <ul>
              ${(comment.key_points || []).map(point => `<li>${point}</li>`).join('')}
            </ul>
          </div>
          ${comment.provides_actionable_advice ? 
            `<div class="actionable-advice">✅ Provides actionable advice</div>` : ''}
        </div>
      `;
    });
    
    analysisElement.innerHTML = analysisHtml;
    this.resultsContainer.appendChild(analysisElement);
  }
  
  displayThemes(themes) {
    const themesElement = document.createElement('div');
    themesElement.classList.add('themes-section');
    
    // Handle both parsed JSON and raw text responses
    if (themes.raw_analysis) {
      themesElement.innerHTML = `
        <h3>Theme Analysis</h3>
        <div class="themes-content">${this.formatMarkdown(themes.raw_analysis)}</div>
      `;
    } else {
      let themesHtml = `<h3>Theme Analysis</h3>`;
      
      // Major themes
      themesHtml += `
        <div class="theme-category">
          <h4>Major Themes</h4>
          <ul>
            ${(themes.major_themes || []).map(theme => `<li>${theme}</li>`).join('')}
          </ul>
        </div>
      `;
      
      // Consensus viewpoints
      themesHtml += `
        <div class="theme-category">
          <h4>Consensus Viewpoints</h4>
          <ul>
            ${(themes.consensus_viewpoints || []).map(view => `<li>${view}</li>`).join('')}
          </ul>
        </div>
      `;
      
      // Significant disagreements
      themesHtml += `
        <div class="theme-category">
          <h4>Significant Disagreements</h4>
          <ul>
            ${(themes.significant_disagreements || []).map(disagree => `<li>${disagree}</li>`).join('')}
          </ul>
        </div>
      `;
      
      // Response patterns
      themesHtml += `
        <div class="theme-category">
          <h4>Response Patterns</h4>
          <ul>
            ${(themes.response_patterns || []).map(pattern => `<li>${pattern}</li>`).join('')}
          </ul>
        </div>
      `;
      
      themesElement.innerHTML = themesHtml;
    }
    
    this.resultsContainer.appendChild(themesElement);
  }
  
  // Helper functions
  setLoading(isLoading) {
    if (this.analyzeButton) {
        this.analyzeButton.disabled = isLoading;
        this.analyzeButton.textContent = isLoading ? 'Analyzing...' : 'Analyze Thread';
    }
  }
  
  clearResults() {
    if (this.resultsContainer) {
        this.resultsContainer.innerHTML = '';
    }
  }
  
  showError(message) {
    if (this.resultsContainer) {
        const errorElement = document.createElement('div');
        errorElement.classList.add('error-message');
        errorElement.textContent = message;
        this.resultsContainer.appendChild(errorElement);
    } else {
        console.error("Cannot show error, resultsContainer is not initialized:", message);
        alert("Error: " + message); // Fallback if UI not ready
    }
  }
  
  formatMarkdown(text = "") {
    // Very simple markdown formatter for displaying text
    // In a real app, you'd use a proper markdown library
    return String(text) // Ensure text is a string
      .replace(/\n\n/g, '<br><br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
  }
}

// HTML template for the application
function createHtmlTemplate() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reddit Thread Analyzer</title>
      <style>
        :root {
          --primary-color: #ff4500;
          --secondary-color: #0079d3;
          --background-color: #f8f9fa;
          --card-background: #ffffff;
          --text-color: #1a1a1b;
          --border-color: #edeff1;
          --shadow-color: rgba(0, 0, 0, 0.05);
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          line-height: 1.6;
          color: var(--text-color);
          background-color: var(--background-color);
          margin: 0;
          padding: 0;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border-color);
        }
        
        header h1 {
          color: var(--primary-color);
          margin: 0;
        }
        
        .input-section {
          background-color: var(--card-background);
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px var(--shadow-color);
          margin-bottom: 30px;
        }
        
        .input-group {
          display: flex;
          gap: 10px;
        }
        
        input[type="text"] {
          flex: 1;
          padding: 12px 15px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 16px;
        }
        
        button {
          background-color: var(--secondary-color);
          color: white;
          border: none;
          border-radius: 4px;
          padding: 12px 20px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        button:hover {
          background-color: #0061a9;
        }
        
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        
        #results-container {
          display: flex;
          flex-direction: column;
          gap: 30px;
        }
        
        .thread-info {
          background-color: var(--card-background);
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px var(--shadow-color);
        }
        
        .thread-info h2 {
          margin-top: 0;
          color: var(--text-color);
        }
        
        .thread-content {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid var(--border-color);
        }
        
        .summary-section, .comment-analysis, .themes-section {
          background-color: var(--card-background);
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px var(--shadow-color);
        }
        
        .summary-section h3, .comment-analysis h3, .themes-section h3 {
          margin-top: 0;
          color: var(--secondary-color);
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        
        .analyzed-comment {
          border: 1px solid var(--border-color);
          border-radius: 6px;
          padding: 15px;
          margin-bottom: 20px;
        }
        
        .comment-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .comment-author {
          font-weight: 600;
          color: var(--primary-color);
        }
        
        .comment-scores {
          display: flex;
          gap: 15px;
        }
        
        .relevance-score, .usefulness-score {
          background-color: #f0f0f0;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 14px;
        }
        
        .comment-key-points ul {
          margin-top: 5px;
        }
        
        .actionable-advice {
          margin-top: 10px;
          font-weight: 600;
          color: #2e7d32;
        }
        
        .theme-category {
          margin-bottom: 20px;
        }
        
        .theme-category h4 {
          margin-bottom: 10px;
          color: var(--text-color);
        }
        
        .error-message {
          background-color: #ffebee;
          color: #c62828;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        
        @media (max-width: 768px) {
          .input-group {
            flex-direction: column;
          }
          
          .comment-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
          
          .comment-scores {
            flex-direction: column;
            gap: 5px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>Reddit Thread Analyzer</h1>
          <div class="settings-button">
            <button id="settings-button">⚙️ Settings</button>
          </div>
        </header>
        
        <div class="input-section">
          <h2>Analyze Reddit Thread</h2>
          <p>Enter the URL of a Reddit thread to analyze its comments and provide valuable insights.</p>
          
          <div class="input-group">
            <input type="text" id="thread-url" placeholder="https://www.reddit.com/r/subreddit/comments/..." />
            <button id="analyze-button">Analyze Thread</button>
          </div>
        </div>
        
        <div id="results-container"></div>
      </div>
      
      <!-- Script tag removed from here, as it's part of the JS file itself now if we are doing single file approach -->
      <!-- If index.html is used, it will have <script src="script.js"></script> -->
    </body>
    </html>
  `;
}

// Create an instance of the analyzer and initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Inject the HTML template into the page
  document.body.innerHTML = createHtmlTemplate();
  
  // Initialize the application
  // This creates an instance, and its constructor calls initialize,
  // which then calls setupUI.
  const analyzer = new RedditThreadAnalyzer();
  analyzer.initialize(); // Explicitly call initialize to ensure UI setup and auth check
});