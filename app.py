from flask import Flask, render_template, request, redirect, url_for, flash
from main import process_reddit_thread
import logging
import re

app = Flask(__name__)
app.secret_key = "reddit_analyzer_secret_key"  # Required for flash messages

# Configure logging for the Flask app
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def validate_reddit_url(url):
    """
    Validate if the URL is a Reddit thread URL
    
    Args:
        url (str): URL to validate
        
    Returns:
        bool: True if valid, False otherwise
    """
    # Basic Reddit URL validation
    reddit_pattern = re.compile(r'^https?://(www\.)?reddit\.com/r/[\w\-]+/comments/')
    return bool(reddit_pattern.match(url))

@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        thread_url = request.form.get('reddit_url')
        comment_limit = request.form.get('comment_limit', 15)
        
        # Try to convert comment_limit to int
        try:
            comment_limit = int(comment_limit)
            if comment_limit < 1 or comment_limit > 50:
                flash("Comment limit must be between 1 and 50", "error")
                return render_template('index.html')
        except ValueError:
            flash("Comment limit must be a number", "error")
            return render_template('index.html')
        
        if not thread_url:
            flash("Reddit URL is required", "error")
            return render_template('index.html')
        
        if not validate_reddit_url(thread_url):
            flash("Please enter a valid Reddit thread URL", "error")
            return render_template('index.html')

        logging.info(f"Received request to analyze URL: {thread_url} with {comment_limit} comments")
        
        # For now, using the default models (Gemini as set in main.py)
        model = "google/gemini-2.5-pro-preview"
        
        processed_data = process_reddit_thread(
            thread_url, 
            comment_limit=comment_limit,
            summary_model=model,
            relevance_model=model
        )

        if processed_data:
            logging.info(f"Successfully processed data for URL: {thread_url}")
            return render_template('results.html', data=processed_data)
        else:
            logging.error(f"Failed to process data for URL: {thread_url}")
            flash("Failed to process Reddit thread. Check logs for details.", "error")
            return render_template('index.html')
    
    return render_template('index.html')

@app.route('/about')
def about():
    """Simple about page"""
    return render_template('about.html')

@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def server_error(e):
    return render_template('500.html'), 500

if __name__ == '__main__':
    app.run(debug=True)