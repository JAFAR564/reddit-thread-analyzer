"""
Module for handling AI processing using OpenRouter API.
Processes Reddit thread data for analysis using Google's Gemini model.
"""
import os
import json
import logging
import requests
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_openrouter_client():
    """
    Set up and return configuration for OpenRouter API.
    
    Returns:
        dict: Configuration for OpenRouter API
        
    Raises:
        ValueError: If OpenRouter API credentials are missing
    """
    load_dotenv()  # Load environment variables from .env file
    
    # Check for required credentials
    api_key = os.getenv('OPENROUTER_API_KEY')
    api_base = os.getenv('OPENROUTER_API_BASE', 'https://openrouter.ai/api/v1')
    
    if not api_key:
        error_msg = "Missing OpenRouter API key (OPENROUTER_API_KEY)"
        logging.error(error_msg)
        raise ValueError(error_msg)
    
    client_config = {
        'api_key': api_key,
        'api_base': api_base
    }
    
    logging.info("OpenRouter client configuration initialized successfully")
    return client_config

def make_openrouter_request(client_config, messages, model, max_tokens=1000, temperature=0.7):
    """
    Make a request to the OpenRouter API.
    
    Args:
        client_config (dict): OpenRouter configuration
        messages (list): List of message objects (role, content)
        model (str): OpenRouter model ID
        max_tokens (int): Maximum tokens in response
        temperature (float): Temperature for generation
        
    Returns:
        dict: Response from OpenRouter API
    """
    headers = {
        'Authorization': f"Bearer {client_config['api_key']}",
        'Content-Type': 'application/json'
    }
    
    payload = {
        'model': model,
        'messages': messages,
        'max_tokens': max_tokens,
        'temperature': temperature
    }
    
    # Additional settings for Gemini models
    if 'gemini' in model.lower():
        # Gemini seems to perform better with slightly lower temperature
        payload['temperature'] = min(temperature, 0.6)
        # Add response format JSON for structured outputs when needed
        if any('JSON' in msg.get('content', '') for msg in messages if isinstance(msg, dict)):
            payload['response_format'] = {"type": "json_object"}
    
    try:
        logging.info(f"Making request to OpenRouter API using model: {model}")
        response = requests.post(
            f"{client_config['api_base']}/chat/completions",
            headers=headers,
            json=payload
        )
        response.raise_for_status()  # Raise exception for 4XX/5XX responses
        return response.json()
    
    except requests.exceptions.RequestException as e:
        logging.error(f"OpenRouter API request failed: {e}")
        if hasattr(e, 'response') and e.response:
            logging.error(f"Response: {e.response.text}")
        return None

def summarize_text(client_config, text, model="google/gemini-2.5-pro-preview", max_length=100):
    """
    Summarize text using OpenRouter API with Gemini model.
    
    Args:
        client_config (dict): OpenRouter configuration
        text (str): Text to summarize
        model (str): OpenRouter model ID
        max_length (int): Target summary length
        
    Returns:
        str: Summarized text
    """
    if not text or len(text.strip()) < 10:
        logging.warning("Text too short to summarize")
        return "Text too short to summarize"
    
    # Gemini-specific prompt engineering
    messages = [
        {"role": "system", "content": "You are a concise summarization assistant. Create clear, brief summaries that capture the main points accurately."},
        {"role": "user", "content": f"""Summarize the following text in {max_length} words or less. Focus on the key information:

TEXT TO SUMMARIZE:
{text}

SUMMARY:"""}
    ]
    
    try:
        response = make_openrouter_request(client_config, messages, model)
        
        if response and 'choices' in response and len(response['choices']) > 0:
            summary = response['choices'][0]['message']['content'].strip()
            logging.info(f"Successfully summarized text ({len(text)} chars -> {len(summary)} chars)")
            return summary
        else:
            logging.error("Failed to get summary from OpenRouter API")
            return None
            
    except Exception as e:
        logging.error(f"Error summarizing text: {e}")
        return None

def analyze_comment_relevance(client_config, original_post, comment_text, model="google/gemini-2.5-pro-preview"):
    """
    Analyze the relevance of a comment to the original post using Gemini model.
    
    Args:
        client_config (dict): OpenRouter configuration
        original_post (str): Original post text
        comment_text (str): Comment text to analyze
        model (str): OpenRouter model ID
        
    Returns:
        dict: Relevance information including is_relevant (bool/str) and reasoning (str)
    """
    if not original_post or not comment_text:
        logging.warning("Missing original post or comment text for relevance analysis")
        return {"is_relevant": "unknown", "reasoning": "Missing original post or comment text"}
    
    # Gemini-specific prompt for structured JSON output
    messages = [
        {"role": "system", "content": "You are a comment analysis assistant. You determine if comments are relevant to the original post and explain your reasoning in JSON format."},
        {"role": "user", "content": f"""Determine if the comment is relevant to the original post and return the result in JSON format.

ORIGINAL POST:
{original_post}

COMMENT:
{comment_text}

Return a JSON object with exactly these fields:
{{"is_relevant": "yes"|"somewhat"|"no", "reasoning": "brief 1-2 sentence explanation"}}"""}
    ]
    
    try:
        response = make_openrouter_request(client_config, messages, model)
        
        if response and 'choices' in response and len(response['choices']) > 0:
            content = response['choices'][0]['message']['content'].strip()
            
            # Try to extract JSON if it exists in the response
            try:
                # Look for JSON object in the response
                import re
                json_match = re.search(r'\{[\s\S]*\}', content)
                if json_match:
                    json_str = json_match.group(0)
                    result = json.loads(json_str)
                    if 'is_relevant' in result and 'reasoning' in result:
                        logging.info(f"Successfully analyzed comment relevance: {result['is_relevant']}")
                        return result
            except json.JSONDecodeError:
                logging.warning("Failed to parse JSON from relevance analysis")
            
            # Fallback to basic text response if JSON parsing fails
            if "yes" in content.lower():
                return {"is_relevant": "yes", "reasoning": content}
            elif "somewhat" in content.lower():
                return {"is_relevant": "somewhat", "reasoning": content}
            elif "no" in content.lower():
                return {"is_relevant": "no", "reasoning": content}
            else:
                return {"is_relevant": "unknown", "reasoning": content}
        else:
            logging.error("Failed to get relevance analysis from OpenRouter API")
            return None
            
    except Exception as e:
        logging.error(f"Error analyzing comment relevance: {e}")
        return None


class AIProcessor:
    """
    Class for handling AI processing using OpenRouter API.
    Note: The main.py currently uses the module functions directly,
    but this class can be used for future OOP-based refactoring.
    """
    def __init__(self):
        self.client_config = get_openrouter_client()
    
    def analyze_thread(self, thread_data):
        """
        Analyze thread data using AI
        
        Args:
            thread_data (dict): Reddit thread data
            
        Returns:
            dict: Analysis results
        """
        # Implementation using the functions above
        pass
    
    def summarize(self, text, model="google/gemini-2.5-pro-preview"):
        """
        Summarize text using AI
        
        Args:
            text (str): Text to summarize
            model (str): Model to use
            
        Returns:
            str: Summarized text
        """
        return summarize_text(self.client_config, text, model)
    
    def analyze_relevance(self, original_post, comment_text, model="google/gemini-2.5-pro-preview"):
        """
        Analyze the relevance of a comment to the original post
        
        Args:
            original_post (str): Original post text
            comment_text (str): Comment text to analyze
            model (str): Model to use
            
        Returns:
            dict: Relevance information
        """
        return analyze_comment_relevance(self.client_config, original_post, comment_text, model)