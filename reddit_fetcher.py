"""
Module for handling Reddit API interactions.
Responsible for fetching and processing Reddit thread data.
"""
import os
import logging
import praw
from dotenv import load_dotenv
from urllib.parse import urlparse

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_reddit_instance():
    """
    Create and return an authenticated Reddit instance using PRAW.
    
    Returns:
        praw.Reddit: Authenticated Reddit instance
        
    Raises:
        ValueError: If Reddit credentials are missing
    """
    load_dotenv()  # Load environment variables from .env file
    
    # Check for required credentials
    client_id = os.getenv('REDDIT_CLIENT_ID')
    client_secret = os.getenv('REDDIT_CLIENT_SECRET')
    user_agent = os.getenv('REDDIT_USER_AGENT')
    
    # Validate credentials
    if not client_id or not client_secret or not user_agent:
        missing = []
        if not client_id: missing.append('REDDIT_CLIENT_ID')
        if not client_secret: missing.append('REDDIT_CLIENT_SECRET') 
        if not user_agent: missing.append('REDDIT_USER_AGENT')
        
        error_msg = f"Missing Reddit API credentials: {', '.join(missing)}"
        logging.error(error_msg)
        raise ValueError(error_msg)
    
    # Initialize and return Reddit instance
    reddit = praw.Reddit(
        client_id=client_id,
        client_secret=client_secret,
        user_agent=user_agent
    )
    
    logging.info("Reddit instance initialized successfully")
    return reddit

def extract_submission_id(thread_url):
    """
    Extract submission ID from a Reddit URL.
    
    Args:
        thread_url (str): Reddit thread URL
        
    Returns:
        str: Submission ID
        
    Raises:
        ValueError: If URL format is invalid or ID can't be extracted
    """
    try:
        # Handle different Reddit URL formats
        url_path = urlparse(thread_url).path
        parts = [p for p in url_path.split('/') if p]
        
        # Search for the "comments" segment in the URL path
        if 'comments' in parts:
            # The submission ID should be right after "comments"
            comments_index = parts.index('comments')
            if comments_index + 1 < len(parts):
                return parts[comments_index + 1]
        
        # If we can't extract it from the path
        raise ValueError("Unable to find submission ID in URL")
    
    except Exception as e:
        logging.error(f"Error extracting submission ID: {e}")
        raise ValueError(f"Invalid Reddit URL format: {thread_url}")

def fetch_thread_data(reddit, thread_url, comment_limit=20, comment_sort='top'):
    """
    Fetch submission and comments for a given Reddit thread URL.
    
    Args:
        reddit (praw.Reddit): Authenticated Reddit instance
        thread_url (str): URL of the Reddit thread
        comment_limit (int): Maximum number of comments to fetch (default: 20)
        comment_sort (str): Sort method for comments: 'top', 'best', 'new', etc. (default: 'top')
        
    Returns:
        tuple: (praw.models.Submission, list of praw.models.Comment)
        
    Raises:
        ValueError: If submission can't be found or accessed
    """
    try:
        # Extract submission ID from URL
        submission_id = extract_submission_id(thread_url)
        logging.info(f"Extracted submission ID: {submission_id}")
        
        # Fetch the submission
        submission = reddit.submission(id=submission_id)
        
        # Replace MoreComments objects with actual comments
        submission.comment_sort = comment_sort
        submission.comments.replace_more(limit=0)  # Set to None to replace all MoreComments objects
        
        # Get comments (flattened tree)
        comments = list(submission.comments.list())[:comment_limit]
        
        logging.info(f"Fetched submission: '{submission.title}' with {len(comments)} comments")
        return submission, comments
        
    except Exception as e:
        error_msg = f"Error fetching thread data: {e}"
        logging.error(error_msg)
        return None, []


class RedditFetcher:
    """
    Class for handling Reddit API interactions.
    Note: The main.py currently uses the module functions directly,
    but this class can be used for future OOP-based refactoring.
    """
    def __init__(self):
        self.reddit = get_reddit_instance()
    
    def fetch_thread(self, thread_url, comment_limit=20, comment_sort='top'):
        """
        Fetch data from a Reddit thread
        
        Args:
            thread_url (str): URL of the Reddit thread
            comment_limit (int): Maximum number of comments to fetch
            comment_sort (str): Sort method for comments
            
        Returns:
            tuple: (praw.models.Submission, list of praw.models.Comment)
        """
        return fetch_thread_data(self.reddit, thread_url, comment_limit, comment_sort)