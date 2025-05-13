"""
Main application script for Reddit Thread Analyzer.
Coordinates the interaction between Reddit data fetching and AI processing.
"""

from reddit_fetcher import RedditFetcher
from ai_processor import AIProcessor
import os
from dotenv import load_dotenv

def main():
    # Load environment variables
    load_dotenv()
    
    # Initialize components
    reddit_fetcher = RedditFetcher()
    ai_processor = AIProcessor()
    
    # Main application logic will go here
    
if __name__ == "__main__":
    main()
