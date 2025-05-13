import logging
from reddit_fetcher import get_reddit_instance, fetch_thread_data
from ai_processor import get_openrouter_client, summarize_text, analyze_comment_relevance
import json # For potentially saving results

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def process_reddit_thread(thread_url, comment_limit=20, summary_model="anthropic/claude-3-haiku", relevance_model="anthropic/claude-3-haiku"):
    """
    Main function to fetch, process, and analyze a Reddit thread.

    Args:
        thread_url (str): The URL of the Reddit thread.
        comment_limit (int): Max number of comments to process.
        summary_model (str): OpenRouter model for summarization.
        relevance_model (str): OpenRouter model for relevance analysis.

    Returns:
        dict: A dictionary containing processed data, including OP info and analyzed comments.
              Returns None on critical error.
    """
    results = {'thread_url': thread_url, 'processed_comments': []}
    try:
        reddit = get_reddit_instance()
        or_client = get_openrouter_client()
    except ValueError as e:
        logging.error(f"Initialization failed: {e}")
        return None
    except Exception as e:
         logging.error(f"Unexpected initialization error: {e}")
         return None

    submission, comments = fetch_thread_data(reddit, thread_url, comment_limit=comment_limit)

    if not submission:
        logging.error(f"Could not fetch submission for {thread_url}")
        return None

    op_text = submission.selftext if submission.selftext else submission.title # Use title if no selftext
    results['thread_title'] = submission.title
    results['thread_op_text'] = submission.selftext
    results['thread_score'] = submission.score
    results['thread_author'] = str(submission.author) # Convert Redditor object to string

    logging.info(f"Processing {len(comments)} comments for thread: {submission.title}")

    for i, comment in enumerate(comments):
        if not hasattr(comment, 'body') or not comment.body:
            logging.warning(f"Skipping comment {i+1} (no body)")
            continue

        comment_data = {
            'id': comment.id,
            'author': str(comment.author),
            'score': comment.score,
            'text': comment.body,
            'summary': None,
            'relevance': None
        }

        logging.info(f"Processing comment {i+1}/{len(comments)} (ID: {comment.id})")

        # 1. Summarize Comment
        summary = summarize_text(or_client, comment.body, model=summary_model)
        comment_data['summary'] = summary if summary else "Summarization failed."

        # 2. Analyze Relevance
        relevance_info = analyze_comment_relevance(or_client, op_text, comment.body, model=relevance_model)
        comment_data['relevance'] = relevance_info if relevance_info else {'is_relevant': 'unknown', 'reasoning': 'Analysis failed.'}

        results['processed_comments'].append(comment_data)

        # Optional: Add a small delay to respect potential API rate limits
        # time.sleep(0.5) # Adjust as needed

    logging.info(f"Finished processing thread {thread_url}")
    return results

if __name__ == "__main__":
    # --- Configuration ---
    TARGET_THREAD_URL = "https://www.reddit.com/r/Python/comments/1cophz1/what_are_your_goto_hacks_for_quickly_debugging/" # Replace with the URL you want to analyze
    MAX_COMMENTS_TO_PROCESS = 15 # Keep low for testing to manage cost/time
    SUMMARY_MODEL_ID = "anthropic/claude-3-haiku-20240307" # Cost-effective option
    # SUMMARY_MODEL_ID = "mistralai/mistral-7b-instruct" # Another option
    RELEVANCE_MODEL_ID = "anthropic/claude-3-haiku-20240307" # Can use the same or different
    # --- End Configuration ---

    logging.info(f"Starting analysis for: {TARGET_THREAD_URL}")
    processed_data = process_reddit_thread(
        TARGET_THREAD_URL,
        comment_limit=MAX_COMMENTS_TO_PROCESS,
        summary_model=SUMMARY_MODEL_ID,
        relevance_model=RELEVANCE_MODEL_ID
    )

    if processed_data:
        print("\n--- Analysis Results ---")
        print(f"Thread Title: {processed_data['thread_title']}")
        # print(f"Thread OP Text: {processed_data['thread_op_text'][:300]}...") # Optional: show OP text
        print(f"\n--- Processed Comments ({len(processed_data['processed_comments'])}/{MAX_COMMENTS_TO_PROCESS} max) ---")

        for comment in processed_data['processed_comments']:
            print(f"\nComment ID: {comment['id']} (Score: {comment['score']}, Author: {comment['author']})")
            print(f"  Original Text: {comment['text'][:200]}...") # Show snippet
            print(f"  Summary: {comment['summary']}")
            print(f"  Relevance: {comment['relevance']['is_relevant']} | Reasoning: {comment['relevance']['reasoning']}") # Adjusted print

        # Optional: Save results to a JSON file
        # try:
        #     with open("analysis_results.json", "w", encoding="utf-8") as f:
        #         json.dump(processed_data, f, indent=4, ensure_ascii=False)
        #     logging.info("Results saved to analysis_results.json")
        # except Exception as e:
        #     logging.error(f"Failed to save results to JSON: {e}")
    else:
        print("Analysis failed. Check logs for details.")